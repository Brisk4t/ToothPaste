const DB_NAME = "ToothPasteDB";
const STORE_NAME = "deviceKeys";
const CREDENTIALS_STORE = "webauthnCredentials";
const DB_VERSION = 2;

// Session-based encryption key derived from WebAuthn
let sessionEncryptionKey = null;

// Open or create a new DB store and set the primary key to clientID
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "clientID" });
            }
            if (!db.objectStoreNames.contains(CREDENTIALS_STORE)) {
                db.createObjectStore(CREDENTIALS_STORE, { keyPath: "id" });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Helper: Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// Helper: Convert Base64 to ArrayBuffer
function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

// Derive encryption key from WebAuthn assertion
async function deriveKeyFromWebAuthn(assertionData) {
    const authenticatorData = assertionData.authenticatorData;
    
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        authenticatorData,
        "HKDF",
        false,
        ["deriveKey"]
    );

    return await crypto.subtle.deriveKey(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: new Uint8Array(0),
            info: new TextEncoder().encode("toothpaste-encryption"),
        },
        keyMaterial,
        {
            name: "AES-GCM",
            length: 256,
        },
        false,
        ["encrypt", "decrypt"]
    );
}

// Register a new WebAuthn credential
export async function registerWebAuthnCredential() {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    
    try {
        const credential = await navigator.credentials.create({
            publicKey: {
                challenge: challenge,
                rp: {
                    name: "ToothPaste",
                    id: window.location.hostname,
                },
                user: {
                    id: crypto.getRandomValues(new Uint8Array(16)),
                    name: "toothpaste-user",
                    displayName: "ToothPaste User",
                },
                pubKeyCredParams: [
                    { alg: -7, type: "public-key" }, // ES256
                    { alg: -257, type: "public-key" }, // RS256
                ],
                timeout: 60000,
                attestation: "direct",
            },
        });

        if (!credential) {
            throw new Error("Credential creation was cancelled");
        }

        // Store the credential in IndexedDB for future authentication
        const db = await openDB();
        const tx = db.transaction(CREDENTIALS_STORE, "readwrite");
        const store = tx.objectStore(CREDENTIALS_STORE);

        await new Promise((resolve, reject) => {
            const request = store.put({
                id: arrayBufferToBase64(credential.id),
                publicKey: arrayBufferToBase64(credential.response.getPublicKey()),
                credentialId: credential.id,
            });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });

        return true;
    } catch (error) {
        console.error("WebAuthn registration failed:", error);
        throw error;
    }
}

// Authenticate with WebAuthn and establish a session
export async function authenticateWithWebAuthn() {
    try {
        const db = await openDB();
        const tx = db.transaction(CREDENTIALS_STORE, "readonly");
        const store = tx.objectStore(CREDENTIALS_STORE);

        // Get all registered credentials
        const credentials = await new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        if (credentials.length === 0) {
            throw new Error("No registered credentials found. Please register a passkey first.");
        }

        const allowCredentials = credentials.map((cred) => ({
            id: new Uint8Array(base64ToArrayBuffer(cred.id)),
            type: "public-key",
        }));

        const assertion = await navigator.credentials.get({
            publicKey: {
                challenge: crypto.getRandomValues(new Uint8Array(32)),
                allowCredentials: allowCredentials,
                timeout: 60000,
                userVerification: "preferred",
            },
        });

        if (!assertion) {
            throw new Error("Authentication was cancelled");
        }

        // Derive encryption key from the assertion
        sessionEncryptionKey = await deriveKeyFromWebAuthn(assertion.response);
        return true;
    } catch (error) {
        console.error("WebAuthn authentication failed:", error);
        throw error;
    }
}

// Check if user is currently authenticated
export function isAuthenticated() {
    return sessionEncryptionKey !== null;
}

// Clear session (logout)
export function clearSession() {
    sessionEncryptionKey = null;
}

// Encrypt value using session encryption key
async function encryptValue(value) {
    if (!sessionEncryptionKey) {
        throw new Error("Not authenticated. Please authenticate with WebAuthn first.");
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(value));

    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        sessionEncryptionKey,
        data
    );

    // Combine IV + encrypted data, then base64 encode
    const result = new Uint8Array(iv.length + encrypted.length);
    result.set(iv);
    result.set(new Uint8Array(encrypted), iv.length);

    return arrayBufferToBase64(result.buffer);
}

// Decrypt value using session encryption key
async function decryptValue(encryptedBase64) {
    if (!sessionEncryptionKey) {
        throw new Error("Not authenticated. Please authenticate with WebAuthn first.");
    }

    const encryptedArray = new Uint8Array(base64ToArrayBuffer(encryptedBase64));

    const iv = encryptedArray.slice(0, 12);
    const encrypted = encryptedArray.slice(12);

    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        sessionEncryptionKey,
        encrypted
    );

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decrypted));
}

// Save base64 shared secret under a given key in the store for a specific client
export async function saveBase64(clientID, key, value) {
    // Open the database
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = await tx.objectStore(STORE_NAME);

    // Wrap the IDbRequest in a promise and get the clientID key's value
    const existing = await new Promise((resolve, reject) => {
        const request = store.get(clientID);
        request.onsuccess = () =>
            resolve(request.result ?? { clientID, data: {} });
        request.onerror = () => reject(request.error);
    });

    // Encrypt the value before storing
    const encryptedValue = await encryptValue(value);
    
    // Wrap the IDbRequest in a promise and put the new value into the clientID key
    existing.data[key] = encryptedValue;
    await new Promise((resolve, reject) => {
        const request = store.put(existing);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });

    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}

// Load the base64 shared secret for a given client and key
export async function loadBase64(clientID, key) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(clientID);

    return new Promise((resolve, reject) => {
        req.onsuccess = async () => {
            const encryptedData = req.result?.data?.[key] ?? null;
            
            if (!encryptedData) {
                resolve(null);
                return;
            }

            try {
                const decryptedValue = await decryptValue(encryptedData);
                resolve(decryptedValue);
            } catch (error) {
                reject(error);
            }
        };
        req.onerror = () => reject(req.error);
    });
}

// Load the stored base64 keys into the ECDH context if they exist
export async function keyExists(clientID) {
    try {
        const selfPublicKey = await loadBase64(clientID, "SelfPublicKey");
        const sharedSecret = await loadBase64(clientID, "sharedSecret");
        const peerPublicKey = await loadBase64(clientID, "PeerPublicKey");

        return !!(selfPublicKey && sharedSecret && peerPublicKey);
    } catch (error) {
        console.error("Error retreiving keys in ECDH context", error);
        return false;
    }
}
