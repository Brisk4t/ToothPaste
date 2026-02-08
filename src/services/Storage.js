const DB_NAME = "ToothPasteDB";
const STORE_NAME = "deviceKeys";
const CREDENTIALS_STORE = "webauthnCredentials";
const DB_VERSION = 3;
const USER_ID_STORAGE_KEY = "toothpaste_webauthn_user_id";

// Session-based encryption key derived from WebAuthn
let sessionEncryptionKey = null;

// Get or create a stable user ID for WebAuthn
function getOrCreateUserId() {
    let userId = localStorage.getItem(USER_ID_STORAGE_KEY);
    if (!userId) {
        // Generate a stable user ID and store it
        const randomBytes = crypto.getRandomValues(new Uint8Array(16));
        userId = arrayBufferToBase64(randomBytes.buffer);
        localStorage.setItem(USER_ID_STORAGE_KEY, userId);
    }
    return userId;
}

// Open or create a new DB store and set the primary key to clientID
export function openDB() {
    return new Promise((resolve, reject) => {
        console.log("[Storage] Opening database...", { name: DB_NAME, version: DB_VERSION });
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            console.log("[Storage] onupgradeneeded triggered", { oldVersion: event.oldVersion, newVersion: event.newVersion });
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                console.log("[Storage] Creating objectStore:", STORE_NAME);
                db.createObjectStore(STORE_NAME, { keyPath: "clientID" });
            }
            if (!db.objectStoreNames.contains(CREDENTIALS_STORE)) {
                console.log("[Storage] Creating objectStore:", CREDENTIALS_STORE);
                db.createObjectStore(CREDENTIALS_STORE, { keyPath: "id" });
            }
        };

        request.onsuccess = () => {
            const db = request.result;
            console.log("[Storage] Database opened successfully", { stores: Array.from(db.objectStoreNames) });
            
            // Verify all required stores exist
            const hasDeviceKeyStore = db.objectStoreNames.contains(STORE_NAME);
            const hasCredentialStore = db.objectStoreNames.contains(CREDENTIALS_STORE);
            
            console.log("[Storage] Store verification", { hasDeviceKeyStore, hasCredentialStore });
            
            if (hasDeviceKeyStore && hasCredentialStore) {
                console.log("[Storage] All stores present, database ready");
                resolve(db);
            } else {
                // Stores are missing - database may be corrupted or was deleted
                console.warn("[Storage] Database corrupted or incomplete. Deleting and recreating...");
                db.close();
                
                // Delete the database completely and recreate it
                const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
                deleteRequest.onsuccess = () => {
                    console.log("[Storage] Database deleted successfully, recreating...");
                    // Wait briefly then retry opening - this will trigger onupgradeneeded
                    setTimeout(() => {
                        openDB().then(resolve).catch(reject);
                    }, 50);
                };
                deleteRequest.onerror = () => {
                    console.error("[Storage] Failed to delete database:", deleteRequest.error);
                    reject(new Error("Failed to recover database: " + deleteRequest.error));
                };
            }
        };

        request.onerror = () => {
            console.error("[Storage] Error opening database:", request.error);
            reject(request.error);
        };
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

// Check if WebAuthn credentials exist without opening a transaction
export async function credentialsExist() {
    try {
        console.log("[Storage] Checking if credentials exist...");
        const db = await openDB();
        const tx = db.transaction(CREDENTIALS_STORE, "readonly");
        const store = tx.objectStore(CREDENTIALS_STORE);
        
        const credentials = await new Promise((resolve) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve([]);
        });
        
        const exists = credentials.length > 0;
        console.log("[Storage] Credentials check complete:", { count: credentials.length, exists });
        return exists;
    } catch (e) {
        console.error("[Storage] Error checking credentials:", e);
        return false;
    }
}

// Register a new WebAuthn credential
export async function registerWebAuthnCredential(displayName) {
    console.log("[Storage] Starting WebAuthn registration", { displayName });
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = base64ToArrayBuffer(getOrCreateUserId());
    console.log("[Storage] Generated challenge and retrieved user ID");
    
    // Use provided displayName or prompt user
    const username = displayName || prompt("Enter a username for this account:", "ToothPaste User") || "ToothPaste User";
    console.log("[Storage] Using username:", username);
    
    try {
        const credential = await navigator.credentials.create({
            publicKey: {
                challenge: challenge,
                rp: {
                    name: "ToothPaste",
                    id: window.location.hostname,
                },
                user: {
                    id: new Uint8Array(userId),
                    name: username.toLowerCase().replace(/\s+/g, "_"),
                    displayName: username,
                },
                pubKeyCredParams: [
                    { alg: -7, type: "public-key" }, // ES256
                    { alg: -257, type: "public-key" }, // RS256
                ],
                timeout: 60000,
                attestation: "none",
                residentKey: "preferred",
                userVerification: "preferred",
            },
        });

        if (!credential) {
            console.warn("[Storage] Credential creation was cancelled by user");
            throw new Error("Credential creation was cancelled");
        }
        console.log("[Storage] WebAuthn credential created successfully", { id: credential.id.byteLength });

        // Store the credential in IndexedDB for future authentication
        console.log("[Storage] Opening database to store credential...");
        const db = await openDB();
        const tx = db.transaction(CREDENTIALS_STORE, "readwrite");
        const store = tx.objectStore(CREDENTIALS_STORE);
        console.log("[Storage] Transaction created, storing credential...");

        await new Promise((resolve, reject) => {
            const request = store.put({
                id: arrayBufferToBase64(credential.id),
                publicKey: arrayBufferToBase64(credential.response.getPublicKey()),
                credentialId: credential.id,
                displayName: username,
            });
            request.onsuccess = () => {
                console.log("[Storage] Credential stored successfully in IndexedDB");
                resolve();
            };
                request.onerror = () => {
                    console.error("[Storage] Failed to store credential:", request.error);
                    reject(request.error);
                };
        });

        console.log("[Storage] WebAuthn registration completed successfully");
        return true;
    } catch (error) {
        console.error("[Storage] WebAuthn registration failed:", error);
        throw error;
    }
}

// Authenticate with WebAuthn and establish a session
export async function authenticateWithWebAuthn() {
    try {
        console.log("[Storage] Starting WebAuthn authentication...");
        const db = await openDB();
        console.log("[Storage] Database opened for authentication");
        const tx = db.transaction(CREDENTIALS_STORE, "readonly");
        const store = tx.objectStore(CREDENTIALS_STORE);

        // Get all registered credentials
        const credentials = await new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        if (credentials.length === 0) {
            console.warn("[Storage] No credentials found for authentication");
            throw new Error("No registered credentials found. Please register a passkey first.");
        }
        console.log("[Storage] Found credentials:", { count: credentials.length });

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
            console.warn("[Storage] Authentication was cancelled by user");
            throw new Error("Authentication was cancelled");
        }
        console.log("[Storage] WebAuthn assertion received successfully");

        // Derive encryption key from the assertion
        console.log("[Storage] Deriving encryption key from assertion...");
        sessionEncryptionKey = await deriveKeyFromWebAuthn(assertion.response);
        console.log("[Storage] Session encryption key derived successfully");
        return true;
    } catch (error) {
        console.error("[Storage] WebAuthn authentication failed:", error);
        throw error;
    }
}

// Check if user is currently authenticated
export function isAuthenticated() {
    const authenticated = sessionEncryptionKey !== null;
    console.log("[Storage] isAuthenticated check:", authenticated);
    return authenticated;
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
