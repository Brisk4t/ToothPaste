/**
 * BaseStorage.js - Core IndexedDB storage service
 * Handles encryption/decryption with a provided session key
 * Does NOT handle WebAuthn - that's done by WebAuthnAdapter
 */

const DB_NAME = "ToothPasteDB";
const STORE_NAME = "deviceKeys";
const CREDENTIALS_STORE = "webauthnCredentials";
const DB_VERSION = 3;

// Session-based encryption key (provided externally by WebAuthnAdapter or default provider)
let sessionEncryptionKey = null;

/**
 * Set the session encryption key (called by WebAuthnAdapter or InsecureStorage)
 * @param {CryptoKey} key - The AES-GCM encryption key to use for this session
 */
export function setSessionEncryptionKey(key) {
    sessionEncryptionKey = key;
    console.log("[BaseStorage] Session encryption key set");
}

/**
 * Check if a session encryption key is currently configured
 */
export function hasSessionKey() {
    return sessionEncryptionKey !== null;
}

/**
 * Clear the session encryption key
 */
export function clearSessionKey() {
    sessionEncryptionKey = null;
    console.log("[BaseStorage] Session encryption key cleared");
}

// Open or create a new DB store and set the primary key to clientID
export function openDB() {
    return new Promise((resolve, reject) => {
        console.log("[BaseStorage] Opening database...", { name: DB_NAME, version: DB_VERSION });
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            console.log("[BaseStorage] onupgradeneeded triggered", { oldVersion: event.oldVersion, newVersion: event.newVersion });
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                console.log("[BaseStorage] Creating objectStore:", STORE_NAME);
                db.createObjectStore(STORE_NAME, { keyPath: "clientID" });
            }
            if (!db.objectStoreNames.contains(CREDENTIALS_STORE)) {
                console.log("[BaseStorage] Creating objectStore:", CREDENTIALS_STORE);
                db.createObjectStore(CREDENTIALS_STORE, { keyPath: "id" });
            }
        };

        request.onsuccess = () => {
            const db = request.result;
            console.log("[BaseStorage] Database opened successfully", { stores: Array.from(db.objectStoreNames) });
            
            // Verify all required stores exist
            const hasDeviceKeyStore = db.objectStoreNames.contains(STORE_NAME);
            const hasCredentialStore = db.objectStoreNames.contains(CREDENTIALS_STORE);
            
            console.log("[BaseStorage] Store verification", { hasDeviceKeyStore, hasCredentialStore });
            
            if (hasDeviceKeyStore && hasCredentialStore) {
                console.log("[BaseStorage] All stores present, database ready");
                resolve(db);
            } else {
                // Stores are missing - database may be corrupted or was deleted
                console.warn("[BaseStorage] Database corrupted or incomplete. Deleting and recreating...");
                db.close();
                
                // Delete the database completely and recreate it
                const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
                deleteRequest.onsuccess = () => {
                    console.log("[BaseStorage] Database deleted successfully, recreating...");
                    // Wait briefly then retry opening - this will trigger onupgradeneeded
                    setTimeout(() => {
                        openDB().then(resolve).catch(reject);
                    }, 50);
                };
                deleteRequest.onerror = () => {
                    console.error("[BaseStorage] Failed to delete database:", deleteRequest.error);
                    reject(new Error("Failed to recover database: " + deleteRequest.error));
                };
            }
        };

        request.onerror = () => {
            console.error("[BaseStorage] Error opening database:", request.error);
            reject(request.error);
        };
    });
}

// Helper: Convert ArrayBuffer to Base64
export function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// Helper: Convert Base64 to ArrayBuffer
export function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

// Helper: Convert URL-safe Base64 to ArrayBuffer
export function base64urlToArrayBuffer(base64url) {
    // Convert URL-safe base64 to standard base64
    const standardBase64 = base64url
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    
    return base64ToArrayBuffer(standardBase64);
}

// Encrypt value using session encryption key
async function encryptValue(value) {
    if (!sessionEncryptionKey) {
        throw new Error("Not authenticated. Please authenticate with WebAuthn first or set up insecure storage.");
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
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encrypted), iv.length);

    return arrayBufferToBase64(result.buffer);
}

// Decrypt value using session encryption key
async function decryptValue(encryptedBase64) {
    if (!sessionEncryptionKey) {
        throw new Error("Not authenticated. Please authenticate with WebAuthn first or set up insecure storage.");
    }

    try {
        const encryptedArray = new Uint8Array(base64ToArrayBuffer(encryptedBase64));
        console.log("[BaseStorage] Decrypting value, total length:", encryptedArray.length);

        if (encryptedArray.length < 12) {
            throw new Error(`Encrypted data too short: need at least 12 bytes for IV+data, got ${encryptedArray.length}`);
        }

        const iv = encryptedArray.slice(0, 12);
        const encrypted = encryptedArray.slice(12);
        console.log("[BaseStorage] IV length:", iv.length, "encrypted data length:", encrypted.length);

        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            sessionEncryptionKey,
            encrypted
        );

        const decoder = new TextDecoder();
        return JSON.parse(decoder.decode(decrypted));
    } catch (error) {
        console.error("[BaseStorage] Decryption failed:", error.message);
        throw error;
    }
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
                console.log("[BaseStorage] Loading base64 key:", key, "for clientID:", clientID);
                const decryptedValue = await decryptValue(encryptedData);
                console.log("[BaseStorage] Successfully decrypted key:", key);
                resolve(decryptedValue);
            } catch (error) {
                console.error("[BaseStorage] Failed to decrypt key", key, ":", error.message);
                console.warn("[BaseStorage] Data may be corrupted. Returning null.");
                // Return null instead of rejecting - data is corrupted
                resolve(null);
            }
        };
        req.onerror = () => reject(req.error);
    });
}

// Check if keys exist for a device
export async function keyExists(clientID) {
    try {
        const selfPublicKey = await loadBase64(clientID, "SelfPublicKey");
        const sharedSecret = await loadBase64(clientID, "sharedSecret");
        const peerPublicKey = await loadBase64(clientID, "PeerPublicKey");

        return !!(selfPublicKey && sharedSecret && peerPublicKey);
    } catch (error) {
        console.error("[BaseStorage] Error retrieving keys:", error);
        return false;
    }
}
