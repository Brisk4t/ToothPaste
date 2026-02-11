/**
 * EncryptedStorage.js
 * 
 * Provides AES-GCM encryption for IndexedDB storage using HKDF key derivation.
 * Supports two modes:
 * 1. Password-based: Derives key from user password using Argon2
 * 2. Passwordless: Uses a hardcoded insecure key (development only)
 */

import * as Storage from '../Storage.js';
import argon2 from 'argon2-wasm-esm';

// Session-based encryption key and salt (salt is used for key re-derivation, not secret)
let sessionEncryptionKey = null;
let sessionSalt = null;
let isUnlockedFlag = false;

/**
 * Hash password with Argon2id and import as AES-GCM key
 */
async function argon2ToAesKey(password, salt) {
    const result = await argon2.hash({
        pass: password,
        salt: salt,
        time: 3,
        mem: 64 * 1024,
        hashLen: 32,
        parallelism: 1,
        type: argon2.ArgonType.Argon2id,
    });

    return await crypto.subtle.importKey(
        "raw",
        result.hash,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
    );
}

/**
 * Load or generate the master salt from localStorage
 */
function loadOrGenerateMasterSalt() {
    const storedSaltBase64 = localStorage.getItem("__EncryptedStorage_MasterSalt__");
    if (storedSaltBase64) {
        return new Uint8Array(Storage.base64ToArrayBuffer(storedSaltBase64));
    }
    
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltBase64 = Storage.arrayBufferToBase64(salt.buffer);
    localStorage.setItem("__EncryptedStorage_MasterSalt__", saltBase64);
    return salt;
}

/**
 * Create a validation token to verify password correctness on future unlocks.
 * This is a special encrypted value that is stored immediately after successful unlock.
 */
async function createValidationToken(key) {
    const token = { timestamp: Date.now(), challenge: "password_validated" };
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(token));

    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        data
    );

    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encrypted), iv.length);

    return Storage.arrayBufferToBase64(result.buffer);
}

/**
 * Verify the stored validation token with the current key.
 * Returns true if token exists and decryption succeeds, false otherwise.
 */
async function verifyValidationToken(key) {
    try {
        const tokenBase64 = localStorage.getItem("__EncryptedStorage_ValidationToken__");
        if (!tokenBase64) {
            return null; // No token yet, so can't verify
        }

        const encryptedArray = new Uint8Array(Storage.base64ToArrayBuffer(tokenBase64));
        const iv = encryptedArray.slice(0, 12);
        const ciphertext = encryptedArray.slice(12);

        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            key,
            ciphertext
        );

        const decoder = new TextDecoder();
        const token = JSON.parse(decoder.decode(decrypted));
        return token.challenge === "password_validated";
    } catch {
        return false; // If decryption fails, password is wrong
    }
}

/**
 * Derive AES-GCM key from password using Argon2id and a specific salt.
 * @param {string} password - User password
 * @param {Uint8Array} salt - The salt to use for derivation
 * @returns {Promise<CryptoKey>} AES-GCM key
 */
async function deriveAesKey(password, salt = null) {
    try {
        if (!salt) {
            salt = loadOrGenerateMasterSalt();
        }
        return await argon2ToAesKey(password, salt);
    } catch (error) {
        console.error("[EncryptedStorage] Failed to derive key:", error);
        throw new Error("Failed to derive key from password: " + error.message);
    }
}

/**
 * Derive AES-GCM key and return with salt.
 * Used during unlock to get both the key and the salt for the session.
 * @param {string} password - User password
 * @returns {Promise<{aesKey: CryptoKey, salt: Uint8Array}>}
 */
async function deriveAesKeyWithSalt(password) {
    const salt = loadOrGenerateMasterSalt();
    const aesKey = await deriveAesKey(password, salt);
    return { aesKey, salt };
}

/**
 * Derive encryption key from insecure-key (passwordless mode).
 * This will be replaced with high-entropy IKM in production.
 */
async function deriveInsecureKey() {
    const ikm = "insecure-key";
    
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(ikm),
        "HKDF",
        false,
        ["deriveKey"]
    );

    return await crypto.subtle.deriveKey(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: new TextEncoder().encode("toothpaste-salt"),
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
 * Unlock the storage with a password using Argon2id.
 * Validates the password by checking the stored validation token.
 * Fails immediately if password is incorrect.
 * @param {string} password - User password
 * @throws {Error} If password is incorrect
 */
export async function unlockWithPassword(password) {
    try {
        const { aesKey, salt } = await deriveAesKeyWithSalt(password);
        
        // Verify password by checking validation token
        const validationResult = await verifyValidationToken(aesKey);
        
        // If token exists and verification failed, password is wrong
        if (validationResult === false) {
            throw new Error("Incorrect password");
        }
        
        // If no token exists yet, create one (first unlock)
        if (validationResult === null) {
            const tokenBase64 = await createValidationToken(aesKey);
            localStorage.setItem("__EncryptedStorage_ValidationToken__", tokenBase64);
        }
        
        sessionEncryptionKey = aesKey;
        sessionSalt = salt;
        isUnlockedFlag = true;
        localStorage.setItem("__EncryptedStorage_AuthScheme__", AuthScheme.PASSWORD);
        return { success: true };
    } catch (error) {
        console.error("[EncryptedStorage] Password unlock failed:", error.message);
        throw error;
    }
}

/**
 * Unlock the storage in passwordless mode (uses insecure-key).
 * Stub function for development/testing only.
 */
export async function unlockPasswordless() {
    try {
        sessionEncryptionKey = await deriveInsecureKey();
        isUnlockedFlag = true;
        localStorage.setItem("__EncryptedStorage_AuthScheme__", AuthScheme.PASSWORDLESS);
        return true;
    } catch (error) {
        console.error("[EncryptedStorage] Passwordless unlock failed:", error);
        throw error;
    }
}

/**
 * Legacy unlock function (for backward compatibility).
 * Now calls unlockPasswordless.
 */
export async function unlock() {
    return unlockPasswordless();
}

/**
 * Lock the storage by clearing the cached encryption key and salt.
 */
export function lock() {
    isUnlockedFlag = false;
    sessionEncryptionKey = null;
    sessionSalt = null;
}

/**
 * Storage consistency states
 */
export const StorageConsistency = {
    VALID: 'valid',              // Both localStorage and IndexedDB consistent
    CORRUPTED: 'corrupted',      // Partial data exists (mismatch)
    EMPTY: 'empty',              // No storage data (virgin state)
};

/**
 * Stored authentication schemes (persisted in localStorage)
 */
export const AuthScheme = {
    PASSWORD: 'password',          // Password-protected
    PASSWORDLESS: 'passwordless',  // Passwordless mode
};

/**
 * Verify localStorage and IndexedDB consistency
 * @returns {Promise<StorageConsistency>}
 */
export async function verifyStorageConsistency() {
    try {
        const authScheme = localStorage.getItem("__EncryptedStorage_AuthScheme__");
        const masterSalt = localStorage.getItem("__EncryptedStorage_MasterSalt__");
        
        // Check if IndexedDB has any data
        const db = await Storage.openDB();
        const tx = db.transaction(Storage.STORE_NAME || "deviceKeys", "readonly");
        const store = tx.objectStore(Storage.STORE_NAME || "deviceKeys");
        const countRequest = store.count();
        
        const hasIndexedDBData = await new Promise((resolve) => {
            countRequest.onsuccess = () => resolve(countRequest.result > 0);
            countRequest.onerror = () => resolve(false);
        });
        
        db.close();
        
        // Both empty - virgin state
        if (!authScheme && !masterSalt && !hasIndexedDBData) {
            return StorageConsistency.EMPTY;
        }
        
        // Consistent state - authScheme is set (passwordless doesn't need masterSalt)
        // Password mode will have both authScheme and masterSalt
        // Passwordless mode will have only authScheme
        if (authScheme) {
            return StorageConsistency.VALID;
        }
        
        // Mangled state - partial data exists (has masterSalt or IndexedDB but no authScheme)
        return StorageConsistency.CORRUPTED;
    } catch (error) {
        console.error("[EncryptedStorage] Error verifying consistency:", error);
        return StorageConsistency.CORRUPTED;
    }
}

/**
 * Completely reset storage to virgin state
 * Use this when storage is corrupted
 */
export async function resetStorageCompletely() {
    try {
        // Close any open database connections
        lock();
        
        // Delete the entire database
        await Storage.deleteDatabase();
        
        // Clear all localStorage auth data
        localStorage.removeItem("__EncryptedStorage_MasterSalt__");
        localStorage.removeItem("__EncryptedStorage_ValidationToken__");
        localStorage.removeItem("__EncryptedStorage_AuthScheme__");
        
        console.log("[EncryptedStorage] Storage completely reset");
    } catch (error) {
        console.error("[EncryptedStorage] Error resetting storage:", error);
        throw error;
    }
}

/**
 * Clear the master salt and validation token (for intentional password reset/change).
 * Warning: This will clear all stored data and require re-entering password on next unlock.
 */
export async function clearMasterSalt() {
    return resetStorageCompletely();
}

/**
 * Encrypt a value using AES-GCM with the derived encryption key.
 * @param {*} value - The value to encrypt
 * @returns {Promise<string>} Base64-encoded encrypted data (IV + ciphertext only)
 */
async function encryptValue(value) {
    if (!sessionEncryptionKey) {
        throw new Error("Storage not unlocked. Call unlockWithPassword() first.");
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
    // Salt is stored separately in IndexedDB, not with the encrypted data
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encrypted), iv.length);

    return Storage.arrayBufferToBase64(result.buffer);
}

/**
 * Decrypt a value using AES-GCM.
 * Can use either the session key (fast path) or re-derive a key (if password+salt provided).
 * Falls back to passwordless key if decryption fails (backwards compatibility).
 * @param {string} encryptedBase64 - Base64-encoded encrypted data (IV + ciphertext)
 * @param {string|null} password - Password for key derivation. If null, uses sessionEncryptionKey
 * @param {Uint8Array|null} salt - Salt for key derivation. Only needed if password is provided
 * @returns {Promise<*>} The decrypted value
 */
async function decryptValue(encryptedBase64, password, salt) {
    try {
        const encryptedArray = new Uint8Array(Storage.base64ToArrayBuffer(encryptedBase64));

        if (encryptedArray.length < 13) {
            throw new Error(`Encrypted data too short: need at least 13 bytes (12 IV + 1 ciphertext), got ${encryptedArray.length}`);
        }

        const iv = encryptedArray.slice(0, 12);
        const ciphertext = encryptedArray.slice(12);

        // Determine which key to use
        let decryptionKey;
        if (password && salt) {
            decryptionKey = await deriveAesKey(password, salt);
        } else {
            if (!sessionEncryptionKey) {
                throw new Error("Storage not unlocked. Call unlockWithPassword() first.");
            }
            decryptionKey = sessionEncryptionKey;
        }

        try {
            const decrypted = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv },
                decryptionKey,
                ciphertext
            );

            const decoder = new TextDecoder();
            return JSON.parse(decoder.decode(decrypted));
        } catch (decryptError) {
            // Try passwordless fallback for backwards compatibility
            const passwordlessKey = await deriveInsecureKey();
            const decrypted = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv },
                passwordlessKey,
                ciphertext
            );

            const decoder = new TextDecoder();
            return JSON.parse(decoder.decode(decrypted));
        }
    } catch (error) {
        console.error("[EncryptedStorage] Decryption failed:", error);
        throw error;
    }
}

/**
 * Check if storage is currently unlocked
 */
export function isUnlocked() {
    return isUnlockedFlag;
}

/**
 * Required authentication modes
 */
export const RequiredAuthMode = {
    UNLOCKED: 'unlocked',              // Already unlocked in session
    PASSWORD: 'password',               // Requires password entry
    PASSWORDLESS: 'passwordless',      // Requires passwordless unlock
    CHOOSE: 'choose',                  // User must choose (first time)
};

/**
 * Auto-unlock based on stored auth scheme.
 * Returns:
 *   RequiredAuthMode.UNLOCKED - if already unlocked
 *   RequiredAuthMode.PASSWORDLESS - if passwordless mode is set and successfully unlocked
 *   RequiredAuthMode.PASSWORD - if password mode is set (requires manual password entry)
 *   RequiredAuthMode.CHOOSE - if no auth scheme is set (show both options)
 */
export async function getRequiredAuthMode() {
    // Already unlocked
    if (isUnlockedFlag) {
        return RequiredAuthMode.UNLOCKED;
    }
    
    const authScheme = getAuthScheme();
    
    // Auto-unlock passwordless
    if (authScheme === AuthScheme.PASSWORDLESS) {
        try {
            await unlockPasswordless();
            return RequiredAuthMode.UNLOCKED;
        } catch (error) {
            console.error("[EncryptedStorage] Passwordless auto-unlock failed:", error);
            return RequiredAuthMode.PASSWORDLESS;
        }
    }
    
    // Password mode requires manual input
    if (authScheme === AuthScheme.PASSWORD) {
        return RequiredAuthMode.PASSWORD;
    }
    
    // No scheme set - show choose screen
    return RequiredAuthMode.CHOOSE;
}

/**
 * Get the stored authentication scheme ("password", "passwordless", or null if not set).
 */
export function getAuthScheme() {
    return localStorage.getItem("__EncryptedStorage_AuthScheme__");
}

/**
 * Check if passwordless mode is available (i.e., has been used before).
 */
export function hasPasswordlessMode() {
    return getAuthScheme() === "passwordless";
}

/**
 * Check if password mode is available (i.e., has been used before).
 */
export function hasPasswordMode() {
    return getAuthScheme() === "password";
}

/**
 * Get the current session salt (needed for storing with encrypted data)
 */
export function getSessionSalt() {
    return sessionSalt;
}

/**
 * Save encrypted base64 data to IndexedDB
 * @param {string} clientID - Client identifier
 * @param {string} key - Storage key
 * @param {*} value - Value to encrypt and store
 */
export async function saveBase64(clientID, key, value) {
    const encryptedValue = await encryptValue(value);
    return Storage.saveBase64(clientID, key, encryptedValue);
}

/**
 * Load and decrypt base64 data from IndexedDB
 * Uses the session key (derived at unlock time).
 * @param {string} clientID - Client identifier
 * @param {string} key - Storage key
 * @returns {Promise<*|null>} The decrypted value or null
 */
export async function loadBase64(clientID, key) {
    try {
        const storedValue = await Storage.loadBase64(clientID, key);
        
        if (storedValue === null) {
            return null;
        }

        if (!sessionEncryptionKey) {
            throw new Error("Storage not unlocked. Call unlockWithPassword() first.");
        }

        return await decryptValue(storedValue, null, null);
    } catch (error) {
        console.error("[EncryptedStorage] Failed to decrypt key " + key + ":", error.message);
        return null;
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

