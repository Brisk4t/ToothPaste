/**
 * WebAuthnAdapter.js - WebAuthn credential management and session key derivation
 * Works with BaseStorage to provide secure WebAuthn-based storage
 */

import { setSessionEncryptionKey, clearSessionKey, openDB, arrayBufferToBase64, base64ToArrayBuffer, base64urlToArrayBuffer } from './BaseStorage.js';

const CREDENTIALS_STORE = "webauthnCredentials";
const USER_ID_STORAGE_KEY = "toothpaste_webauthn_user_id";

let isAuthenticatedFlag = false;

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

/**
 * Derive a stable encryption key from credential ID
 * Same key is produced every time for the same credential
 */
async function deriveKeyFromCredentialId(credentialIdBase64) {
    console.log("[WebAuthnAdapter] Deriving key from credential ID");
    
    // Convert credential ID from URL-safe base64url to bytes
    const credentialIdBytes = new Uint8Array(base64urlToArrayBuffer(credentialIdBase64));
    
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
 * Check if WebAuthn credentials exist
 */
export async function credentialsExist() {
    try {
        console.log("[WebAuthnAdapter] Checking if credentials exist...");
        const db = await openDB();
        const tx = db.transaction(CREDENTIALS_STORE, "readonly");
        const store = tx.objectStore(CREDENTIALS_STORE);
        
        const credentials = await new Promise((resolve) => {
            const request = store.getAll();
            request.onsuccess = () => {
                console.log("[WebAuthnAdapter] getAll() returned:", JSON.stringify(request.result));
                resolve(request.result);
            };
            request.onerror = () => {
                console.error("[WebAuthnAdapter] getAll() error:", request.error);
                resolve([]);
            };
        });
        
        const exists = credentials.length > 0;
        console.log("[WebAuthnAdapter] Credentials check complete:", { count: credentials.length, exists });
        return exists;
    } catch (e) {
        console.error("[WebAuthnAdapter] Error checking credentials:", e);
        return false;
    }
}

/**
 * Register a new WebAuthn credential
 */
export async function registerWebAuthnCredential(displayName) {
    console.log("[WebAuthnAdapter] Starting WebAuthn registration", { displayName });
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = base64ToArrayBuffer(getOrCreateUserId());
    console.log("[WebAuthnAdapter] Generated challenge and retrieved user ID");
    
    // Use provided displayName or prompt user
    const username = displayName || prompt("Enter a username for this account:", "ToothPaste User") || "ToothPaste User";
    console.log("[WebAuthnAdapter] Using username:", username);
    
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
            console.warn("[WebAuthnAdapter] Credential creation was cancelled by user");
            throw new Error("Credential creation was cancelled");
        }
        console.log("[WebAuthnAdapter] WebAuthn credential created successfully", { id: credential.id, idType: typeof credential.id });

        // Store the credential in IndexedDB
        console.log("[WebAuthnAdapter] Opening database to store credential...");
        const db = await openDB();
        const tx = db.transaction(CREDENTIALS_STORE, "readwrite");
        const store = tx.objectStore(CREDENTIALS_STORE);
        console.log("[WebAuthnAdapter] Transaction created, storing credential...");

        // Convert credential.id to base64 - handle multiple formats
        let credentialIdAsBase64 = '';
        
        if (typeof credential.id === 'string') {
            credentialIdAsBase64 = credential.id;
            console.log("[WebAuthnAdapter] credential.id is already a base64 string");
        } else if (credential.id instanceof ArrayBuffer) {
            credentialIdAsBase64 = arrayBufferToBase64(credential.id);
            console.log("[WebAuthnAdapter] credential.id was ArrayBuffer, converted to base64");
        } else if (credential.id instanceof Uint8Array) {
            credentialIdAsBase64 = arrayBufferToBase64(credential.id.buffer);
            console.log("[WebAuthnAdapter] credential.id was Uint8Array, converted to base64");
        } else {
            console.warn("[WebAuthnAdapter] credential.id has unexpected type:", typeof credential.id);
            throw new Error("Unable to handle credential.id format");
        }
        
        console.log("[WebAuthnAdapter] Final credential.id for storage:", { base64Length: credentialIdAsBase64.length, base64Sample: credentialIdAsBase64.substring(0, 20) });

        await new Promise((resolve, reject) => {
            const request = store.put({
                id: credentialIdAsBase64,
                displayName: username,
            });
            request.onsuccess = () => {
                console.log("[WebAuthnAdapter] Credential stored successfully in IndexedDB");
                resolve();
            };
            request.onerror = () => {
                console.error("[WebAuthnAdapter] Failed to store credential:", request.error);
                reject(request.error);
            };
        });

        console.log("[WebAuthnAdapter] WebAuthn registration completed successfully");
        
        // Derive and set the session encryption key from the new credential ID
        console.log("[WebAuthnAdapter] Deriving session key from registered credential...");
        const sessionKey = await deriveKeyFromCredentialId(credentialIdAsBase64);
        setSessionEncryptionKey(sessionKey);
        isAuthenticatedFlag = true;
        console.log("[WebAuthnAdapter] Session encryption key established from credential");
        
        return true;
    } catch (error) {
        console.error("[WebAuthnAdapter] WebAuthn registration failed:", error);
        throw error;
    }
}

/**
 * Authenticate with WebAuthn and establish a session
 */
export async function authenticateWithWebAuthn() {
    try {
        console.log("[WebAuthnAdapter] Starting WebAuthn authentication...");
        const db = await openDB();
        console.log("[WebAuthnAdapter] Database opened for authentication");
        const tx = db.transaction(CREDENTIALS_STORE, "readonly");
        const store = tx.objectStore(CREDENTIALS_STORE);

        // Get all registered credentials
        const credentials = await new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                console.log("[WebAuthnAdapter] Retrieved credentials from store:", JSON.stringify(request.result));
                resolve(request.result);
            };
            request.onerror = () => reject(request.error);
        });

        if (credentials.length === 0) {
            console.warn("[WebAuthnAdapter] No credentials found for authentication");
            throw new Error("No registered credentials found. Please register a passkey first.");
        }
        console.log("[WebAuthnAdapter] Found credentials:", { count: credentials.length });

        const allowCredentials = credentials.map((cred) => ({
            id: new Uint8Array(base64urlToArrayBuffer(cred.id)),
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
            console.warn("[WebAuthnAdapter] Authentication was cancelled by user");
            throw new Error("Authentication was cancelled");
        }
        console.log("[WebAuthnAdapter] WebAuthn assertion received successfully");

        // Find the credential that was used for this assertion
        let credentialId = '';
        
        if (typeof assertion.id === 'string') {
            credentialId = assertion.id;
            console.log("[WebAuthnAdapter] assertion.id is already a base64 string");
        } else if (assertion.id instanceof ArrayBuffer) {
            credentialId = arrayBufferToBase64(assertion.id);
            console.log("[WebAuthnAdapter] assertion.id was ArrayBuffer, converted to base64");
        } else if (assertion.id instanceof Uint8Array) {
            credentialId = arrayBufferToBase64(assertion.id.buffer);
            console.log("[WebAuthnAdapter] assertion.id was Uint8Array, converted to base64");
        } else {
            console.warn("[WebAuthnAdapter] assertion.id has unexpected type:", typeof assertion.id);
            throw new Error("Unable to handle assertion.id format");
        }
        
        console.log("[WebAuthnAdapter] Assertion credential ID:", { base64Length: credentialId.length, base64Sample: credentialId.substring(0, 20) });
        console.log("[WebAuthnAdapter] Looking for credential in stored credentials:", { storedIds: credentials.map(c => c.id) });
        
        const usedCredential = credentials.find((cred) => cred.id === credentialId);
        
        if (!usedCredential) {
            console.warn("[WebAuthnAdapter] Could not find credential that was used for assertion");
            console.warn("[WebAuthnAdapter] Assertion credential ID:", credentialId);
            console.warn("[WebAuthnAdapter] Stored credential IDs:", credentials.map(c => c.id));
            throw new Error("Credential not found: ID does not match any registered credential");
        }
        
        console.log("[WebAuthnAdapter] Found matching credential, ID:", credentialId);

        // Derive encryption key from the credential ID and set it in BaseStorage
        console.log("[WebAuthnAdapter] Deriving encryption key from credential ID...");
        const sessionKey = await deriveKeyFromCredentialId(usedCredential.id);
        setSessionEncryptionKey(sessionKey);
        isAuthenticatedFlag = true;
        console.log("[WebAuthnAdapter] Session encryption key derived successfully from credential ID");
        return true;
    } catch (error) {
        console.error("[WebAuthnAdapter] WebAuthn authentication failed:", error);
        throw error;
    }
}

/**
 * Check if user is currently authenticated with WebAuthn
 */
export function isAuthenticated() {
    console.log("[WebAuthnAdapter] isAuthenticated check:", isAuthenticatedFlag);
    return isAuthenticatedFlag;
}

/**
 * Clear the WebAuthn session
 */
export function clearSession() {
    isAuthenticatedFlag = false;
    clearSessionKey();
    console.log("[WebAuthnAdapter] Session cleared");
}
