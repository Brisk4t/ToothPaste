/**
 * Storage.js - Simple IndexedDB storage (no encryption)
 * 
 * Provides basic CRUD operations for storing key-value pairs per client
 */

const DB_NAME = "ToothPasteDB";
const STORE_NAME = "deviceKeys";
const CREDENTIALS_STORE = "webauthnCredentials";
const DB_VERSION = 3;

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

// Save value under a given key in the store for a specific client
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

    // Put the new value into the clientID key
    existing.data[key] = value;
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

// Load value for a given client and key
export async function loadBase64(clientID, key) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(clientID);

    return new Promise((resolve, reject) => {
        req.onsuccess = () => {
            const data = req.result?.data?.[key] ?? null;
            resolve(data);
        };
        req.onerror = () => reject(req.error);
    });
}

// Check if device keys exist for a client
export async function keyExists(clientID) {
    try {
        const selfPublicKey = await loadBase64(clientID, "SelfPublicKey");
        const sharedSecret = await loadBase64(clientID, "sharedSecret");
        const peerPublicKey = await loadBase64(clientID, "PeerPublicKey");

        return !!(selfPublicKey && sharedSecret && peerPublicKey);
    } catch (error) {
        console.error("[Storage] Error retrieving keys:", error);
        return false;
    }
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

