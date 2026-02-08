/**
 * Storage.js - Unified storage interface
 * 
 * This is a facade that conditionally uses either:
 * - WebAuthnAdapter + BaseStorage (secure, requires WebAuthn authentication)
 * - BaseStorage with insecure default key (fallback for development)
 * 
 * Set WEBAUTHN_ENABLED = false to use insecure storage without requiring WebAuthn
 */

import * as BaseStorage from './BaseStorage.js';
import * as WebAuthnAdapter from './WebAuthnAdapter.js';

// Configuration: set to false to use insecure storage without WebAuthn
const WEBAUTHN_ENABLED = true;

// Insecure default key for development (DO NOT USE IN PRODUCTION)
const INSECURE_DEFAULT_KEY_PASSWORD = "insecure-default-key-do-not-use";

/**
 * Generate insecure default encryption key for non-WebAuthn mode
 * Only used if WEBAUTHN_ENABLED is false
 */
async function getInsecureDefaultKey() {
    console.warn("[Storage] WARNING: Using insecure storage without WebAuthn. Do not use in production!");
    
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(INSECURE_DEFAULT_KEY_PASSWORD),
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

// Initialize insecure storage mode (only if WebAuthn is disabled)
export async function initializeInsecureStorage() {
    if (WEBAUTHN_ENABLED) {
        throw new Error("Cannot initialize insecure storage when WebAuthn is enabled");
    }
    
    console.warn("[Storage] Initializing insecure storage (no WebAuthn)");
    const key = await getInsecureDefaultKey();
    BaseStorage.setSessionEncryptionKey(key);
    return true;
}

/**
 * Register a WebAuthn credential (only available if WEBAUTHN_ENABLED)
 */
export async function registerWebAuthnCredential(displayName) {
    if (!WEBAUTHN_ENABLED) {
        throw new Error("WebAuthn is not enabled. Use initializeInsecureStorage() instead.");
    }
    return WebAuthnAdapter.registerWebAuthnCredential(displayName);
}

/**
 * Authenticate with WebAuthn (only available if WEBAUTHN_ENABLED)
 */
export async function authenticateWithWebAuthn() {
    if (!WEBAUTHN_ENABLED) {
        throw new Error("WebAuthn is not enabled. Use initializeInsecureStorage() instead.");
    }
    return WebAuthnAdapter.authenticateWithWebAuthn();
}

/**
 * Check if WebAuthn credentials exist (only meaningful if WEBAUTHN_ENABLED)
 */
export async function credentialsExist() {
    if (!WEBAUTHN_ENABLED) {
        return false;
    }
    return WebAuthnAdapter.credentialsExist();
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated() {
    if (WEBAUTHN_ENABLED) {
        return WebAuthnAdapter.isAuthenticated();
    } else {
        return BaseStorage.hasSessionKey();
    }
}

/**
 * Clear the session
 */
export function clearSession() {
    if (WEBAUTHN_ENABLED) {
        WebAuthnAdapter.clearSession();
    } else {
        BaseStorage.clearSessionKey();
    }
}

/**
 * Save encrypted base64 data
 */
export async function saveBase64(clientID, key, value) {
    return BaseStorage.saveBase64(clientID, key, value);
}

/**
 * Load encrypted base64 data
 */
export async function loadBase64(clientID, key) {
    return BaseStorage.loadBase64(clientID, key);
}

/**
 * Check if device keys exist
 */
export async function keyExists(clientID) {
    return BaseStorage.keyExists(clientID);
}

/**
 * Export base64 and array buffer conversion utilities
 */
export const arrayBufferToBase64 = BaseStorage.arrayBufferToBase64;
export const base64ToArrayBuffer = BaseStorage.base64ToArrayBuffer;
export const base64urlToArrayBuffer = BaseStorage.base64urlToArrayBuffer;
export const openDB = BaseStorage.openDB;

