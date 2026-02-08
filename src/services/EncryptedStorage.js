/**
 * EncryptedStorage.js
 * 
 * Provides AES-GCM encryption for IndexedDB storage using HKDF key derivation.
 * Currently uses a hardcoded "insecure-key" - this will be replaced with high-entropy
 * IKM in production. Do not use in production environments.
 */

import * as Storage from './Storage.js';

// Session-based encryption key
let sessionEncryptionKey = null;
let isUnlockedFlag = false;

/**
 * Derive a deterministic encryption key from the insecure-key using HKDF.
 * This will be replaced with a high-entropy IKM in production.
 */
async function deriveEncryptionKey() {
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
 * Unlock the storage by deriving and caching the encryption key.
 * Stub function for future authentication flow implementation.
 */
export async function unlock() {
    console.warn("[EncryptedStorage] WARNING: Using hardcoded insecure-key. This is for development only.");
    
    try {
        sessionEncryptionKey = await deriveEncryptionKey();
        isUnlockedFlag = true;
        return true;
    } catch (error) {
        console.error("[EncryptedStorage] Failed to unlock storage:", error);
        throw error;
    }
}

/**
 * Lock the storage by clearing the cached encryption key.
 * Stub function for future authentication flow implementation.
 */
export function lock() {
    isUnlockedFlag = false;
    sessionEncryptionKey = null;
    console.log("[EncryptedStorage] Storage locked");
}

/**
 * Encrypt a value using AES-GCM with the derived encryption key.
 * @param {*} value - The value to encrypt
 * @returns {Promise<string>} Base64-encoded encrypted data (IV + ciphertext)
 */
async function encryptValue(value) {
    if (!sessionEncryptionKey) {
        throw new Error("Storage not unlocked. Call unlock() first.");
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
 * Decrypt a value using AES-GCM with the derived encryption key.
 * @param {string} encryptedBase64 - Base64-encoded encrypted data (IV + ciphertext)
 * @returns {Promise<*>} The decrypted value
 */
async function decryptValue(encryptedBase64) {
    if (!sessionEncryptionKey) {
        throw new Error("Storage not unlocked. Call unlock() first.");
    }

    try {
        const encryptedArray = new Uint8Array(Storage.base64ToArrayBuffer(encryptedBase64));

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
 * Check if storage is currently unlocked
 */
export function isUnlocked() {
    return isUnlockedFlag;
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
 * @param {string} clientID - Client identifier
 * @param {string} key - Storage key
 * @returns {Promise<*|null>} The decrypted value or null
 */
export async function loadBase64(clientID, key) {
    const storedValue = await Storage.loadBase64(clientID, key);
    
    if (storedValue === null) {
        return null;
    }

    try {
        return await decryptValue(storedValue);
    } catch (error) {
        console.error("[EncryptedStorage] Failed to decrypt key", key, ":", error.message);
        console.warn("[EncryptedStorage] Data may be corrupted. Returning null.");
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

