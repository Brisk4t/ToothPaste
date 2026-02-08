/**
 * EncryptedStorage.js
 * 
 * Wraps Storage.js with optional AES-GCM encryption + WebAuthn credential management.
 * 
 * Set ENCRYPTION_ENABLED = true to use WebAuthn (secure)
 * Set ENCRYPTION_ENABLED = false to use insecure default key (dev/testing)
 */

import * as Storage from './Storage.js';

// Configuration: set to false to use insecure storage without WebAuthn
const ENCRYPTION_ENABLED = true;

const CREDENTIALS_STORE = "webauthnCredentials";
const USER_ID_STORAGE_KEY = "toothpaste_webauthn_user_id";

// Session-based encryption key
let sessionEncryptionKey = null;
let isAuthenticatedFlag = false;

/**
 * Generate insecure default encryption key for non-encrypted mode
 * Only used if ENCRYPTION_ENABLED is false
 */
async function getInsecureDefaultKey() {
    console.warn("[EncryptedStorage] WARNING: Using insecure storage without encryption. Do not use in production!");
    
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode("insecure-default-key-do-not-use"),
        "HKDF",
        false,
        ["deriveKey"]
    );

    return await crypto.subtle.deriveKey(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: new TextEncoder().encode("insecure-salt"),
            info: new TextEncoder().encode("insecure-encryption"),
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

/**
 * Initialize insecure encryption mode (only if ENCRYPTION_ENABLED is false)
 */
export async function initializeInsecureStorage() {
    if (ENCRYPTION_ENABLED) {
        throw new Error("Cannot initialize insecure storage when encryption is enabled");
    }
    
    console.warn("[EncryptedStorage] Initializing insecure storage (no encryption)");
    sessionEncryptionKey = await getInsecureDefaultKey();
    isAuthenticatedFlag = true;
    return true;
}

// Get or create a stable user ID for WebAuthn
function getOrCreateUserId() {
    let userId = localStorage.getItem(USER_ID_STORAGE_KEY);
    if (!userId) {
        // Generate a stable user ID and store it
        const randomBytes = crypto.getRandomValues(new Uint8Array(16));
        userId = Storage.arrayBufferToBase64(randomBytes.buffer);
        localStorage.setItem(USER_ID_STORAGE_KEY, userId);
    }
    return userId;
}

/**
 * Derive a stable encryption key from credential ID
 * Same key is produced every time for the same credential
 */
async function deriveKeyFromCredentialId(credentialIdBase64) {
    console.log("[EncryptedStorage] Deriving key from credential ID");
    
    // Convert credential ID from URL-safe base64url to bytes
    const credentialIdBytes = new Uint8Array(Storage.base64urlToArrayBuffer(credentialIdBase64));
    
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        credentialIdBytes,
        "HKDF",
        false,
        ["deriveKey"]
    );

    return await crypto.subtle.deriveKey(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: new TextEncoder().encode("toothpaste-user"),
            info: new TextEncoder().encode("toothpaste-encryption-v1"),
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

/**
 * Encrypt value using session encryption key
 */
async function encryptValue(value) {
    if (!sessionEncryptionKey) {
        throw new Error("Not authenticated. Please authenticate first.");
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

    return Storage.arrayBufferToBase64(result.buffer);
}

/**
 * Decrypt value using session encryption key
 */
async function decryptValue(encryptedBase64) {
    if (!sessionEncryptionKey) {
        throw new Error("Not authenticated. Please authenticate first.");
    }

    try {
        const encryptedArray = new Uint8Array(Storage.base64ToArrayBuffer(encryptedBase64));
        console.log("[EncryptedStorage] Decrypting value, total length:", encryptedArray.length);

        if (encryptedArray.length < 12) {
            throw new Error(`Encrypted data too short: need at least 12 bytes for IV+data, got ${encryptedArray.length}`);
        }

        const iv = encryptedArray.slice(0, 12);
        const encrypted = encryptedArray.slice(12);

        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            sessionEncryptionKey,
            encrypted
        );

        const decoder = new TextDecoder();
        return JSON.parse(decoder.decode(decrypted));
    } catch (error) {
        console.error("[EncryptedStorage] Decryption failed:", error.message);
        throw error;
    }
}

/**
 * Check if WebAuthn credentials exist
 */
export async function credentialsExist() {
    if (!ENCRYPTION_ENABLED) {
        return false;
    }
    
    try {
        console.log("[EncryptedStorage] Checking if credentials exist...");
        const db = await Storage.openDB();
        const tx = db.transaction(CREDENTIALS_STORE, "readonly");
        const store = tx.objectStore(CREDENTIALS_STORE);
        
        const credentials = await new Promise((resolve) => {
            const request = store.getAll();
            request.onsuccess = () => {
                console.log("[EncryptedStorage] getAll() returned:", JSON.stringify(request.result));
                resolve(request.result);
            };
            request.onerror = () => {
                console.error("[EncryptedStorage] getAll() error:", request.error);
                resolve([]);
            };
        });
        
        const exists = credentials.length > 0;
        console.log("[EncryptedStorage] Credentials check complete:", { count: credentials.length, exists });
        return exists;
    } catch (e) {
        console.error("[EncryptedStorage] Error checking credentials:", e);
        return false;
    }
}

/**
 * Register a new WebAuthn credential
 */
export async function registerWebAuthnCredential(displayName) {
    if (!ENCRYPTION_ENABLED) {
        throw new Error("WebAuthn is not enabled. Use initializeInsecureStorage() instead.");
    }

    console.log("[EncryptedStorage] Starting WebAuthn registration", { displayName });
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = Storage.base64ToArrayBuffer(getOrCreateUserId());
    console.log("[EncryptedStorage] Generated challenge and retrieved user ID");
    
    // Use provided displayName or prompt user
    const username = displayName || prompt("Enter a username for this account:", "ToothPaste User") || "ToothPaste User";
    console.log("[EncryptedStorage] Using username:", username);
    
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
            console.warn("[EncryptedStorage] Credential creation was cancelled by user");
            throw new Error("Credential creation was cancelled");
        }
        console.log("[EncryptedStorage] WebAuthn credential created successfully");

        // Store the credential in IndexedDB
        console.log("[EncryptedStorage] Opening database to store credential...");
        const db = await Storage.openDB();
        const tx = db.transaction(CREDENTIALS_STORE, "readwrite");
        const store = tx.objectStore(CREDENTIALS_STORE);
        console.log("[EncryptedStorage] Transaction created, storing credential...");

        // Convert credential.id to base64 - handle multiple formats
        let credentialIdAsBase64 = '';
        
        if (typeof credential.id === 'string') {
            credentialIdAsBase64 = credential.id;
            console.log("[EncryptedStorage] credential.id is already a base64 string");
        } else if (credential.id instanceof ArrayBuffer) {
            credentialIdAsBase64 = Storage.arrayBufferToBase64(credential.id);
            console.log("[EncryptedStorage] credential.id was ArrayBuffer, converted to base64");
        } else if (credential.id instanceof Uint8Array) {
            credentialIdAsBase64 = Storage.arrayBufferToBase64(credential.id.buffer);
            console.log("[EncryptedStorage] credential.id was Uint8Array, converted to base64");
        } else {
            console.warn("[EncryptedStorage] credential.id has unexpected type:", typeof credential.id);
            throw new Error("Unable to handle credential.id format");
        }

        await new Promise((resolve, reject) => {
            const request = store.put({
                id: credentialIdAsBase64,
                displayName: username,
            });
            request.onsuccess = () => {
                console.log("[EncryptedStorage] Credential stored successfully in IndexedDB");
                resolve();
            };
            request.onerror = () => {
                console.error("[EncryptedStorage] Failed to store credential:", request.error);
                reject(request.error);
            };
        });

        console.log("[EncryptedStorage] WebAuthn registration completed successfully");
        
        // Derive and set the session encryption key from the new credential ID
        console.log("[EncryptedStorage] Deriving session key from registered credential...");
        sessionEncryptionKey = await deriveKeyFromCredentialId(credentialIdAsBase64);
        isAuthenticatedFlag = true;
        console.log("[EncryptedStorage] Session encryption key established from credential");
        
        return true;
    } catch (error) {
        console.error("[EncryptedStorage] WebAuthn registration failed:", error);
        throw error;
    }
}

/**
 * Authenticate with WebAuthn and establish a session
 */
export async function authenticateWithWebAuthn() {
    if (!ENCRYPTION_ENABLED) {
        throw new Error("WebAuthn is not enabled. Use initializeInsecureStorage() instead.");
    }

    try {
        console.log("[EncryptedStorage] Starting WebAuthn authentication...");
        const db = await Storage.openDB();
        console.log("[EncryptedStorage] Database opened for authentication");
        const tx = db.transaction(CREDENTIALS_STORE, "readonly");
        const store = tx.objectStore(CREDENTIALS_STORE);

        // Get all registered credentials
        const credentials = await new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                console.log("[EncryptedStorage] Retrieved credentials from store:", JSON.stringify(request.result));
                resolve(request.result);
            };
            request.onerror = () => reject(request.error);
        });

        if (credentials.length === 0) {
            console.warn("[EncryptedStorage] No credentials found for authentication");
            throw new Error("No registered credentials found. Please register a passkey first.");
        }
        console.log("[EncryptedStorage] Found credentials:", { count: credentials.length });

        const allowCredentials = credentials.map((cred) => ({
            id: new Uint8Array(Storage.base64urlToArrayBuffer(cred.id)),
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
            console.warn("[EncryptedStorage] Authentication was cancelled by user");
            throw new Error("Authentication was cancelled");
        }
        console.log("[EncryptedStorage] WebAuthn assertion received successfully");

        // Find the credential that was used for this assertion
        let credentialId = '';
        
        if (typeof assertion.id === 'string') {
            credentialId = assertion.id;
            console.log("[EncryptedStorage] assertion.id is already a base64 string");
        } else if (assertion.id instanceof ArrayBuffer) {
            credentialId = Storage.arrayBufferToBase64(assertion.id);
            console.log("[EncryptedStorage] assertion.id was ArrayBuffer, converted to base64");
        } else if (assertion.id instanceof Uint8Array) {
            credentialId = Storage.arrayBufferToBase64(assertion.id.buffer);
            console.log("[EncryptedStorage] assertion.id was Uint8Array, converted to base64");
        } else {
            console.warn("[EncryptedStorage] assertion.id has unexpected type:", typeof assertion.id);
            throw new Error("Unable to handle assertion.id format");
        }
        
        const usedCredential = credentials.find((cred) => cred.id === credentialId);
        
        if (!usedCredential) {
            console.warn("[EncryptedStorage] Could not find credential that was used for assertion");
            throw new Error("Credential not found: ID does not match any registered credential");
        }
        
        console.log("[EncryptedStorage] Found matching credential, ID:", credentialId);

        // Derive encryption key from the credential ID
        console.log("[EncryptedStorage] Deriving encryption key from credential ID...");
        sessionEncryptionKey = await deriveKeyFromCredentialId(usedCredential.id);
        isAuthenticatedFlag = true;
        console.log("[EncryptedStorage] Session encryption key derived successfully");
        return true;
    } catch (error) {
        console.error("[EncryptedStorage] WebAuthn authentication failed:", error);
        throw error;
    }
}

/**
 * Check if user is currently authenticated
 */
export function isAuthenticated() {
    return isAuthenticatedFlag;
}

/**
 * Clear the session
 */
export function clearSession() {
    isAuthenticatedFlag = false;
    sessionEncryptionKey = null;
    console.log("[EncryptedStorage] Session cleared");
}

/**
 * Save encrypted base64 data
 */
export async function saveBase64(clientID, key, value) {
    if (ENCRYPTION_ENABLED) {
        const encryptedValue = await encryptValue(value);
        return Storage.saveBase64(clientID, key, encryptedValue);
    } else {
        // Insecure mode: store plain value
        return Storage.saveBase64(clientID, key, value);
    }
}

/**
 * Load encrypted base64 data
 */
export async function loadBase64(clientID, key) {
    const storedValue = await Storage.loadBase64(clientID, key);
    
    if (storedValue === null) {
        return null;
    }

    if (ENCRYPTION_ENABLED) {
        try {
            return await decryptValue(storedValue);
        } catch (error) {
            console.error("[EncryptedStorage] Failed to decrypt key", key, ":", error.message);
            console.warn("[EncryptedStorage] Data may be corrupted. Returning null.");
            return null;
        }
    } else {
        // Insecure mode: return plain value
        return storedValue;
    }
}

/**
 * Check if device keys exist
 */
export async function keyExists(clientID) {
    return Storage.keyExists(clientID);
}

/**
 * Export utilities from Storage
 */
export const arrayBufferToBase64 = Storage.arrayBufferToBase64;
export const base64ToArrayBuffer = Storage.base64ToArrayBuffer;
export const base64urlToArrayBuffer = Storage.base64urlToArrayBuffer;
export const openDB = Storage.openDB;
