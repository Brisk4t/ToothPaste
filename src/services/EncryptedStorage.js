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
    console.warn("[EncryptedStorage] WARNING: Using insecure storage without encryption.");
    
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
    
    sessionEncryptionKey = await getInsecureDefaultKey();
    isAuthenticatedFlag = true;
    return true;
}

// Get or create a user ID for WebAuthn
function getOrCreateUserId() {
    let userId = localStorage.getItem(USER_ID_STORAGE_KEY);
    if (!userId) {
        // Generate a user ID and store it
        const randomBytes = crypto.getRandomValues(new Uint8Array(16));
        userId = Storage.arrayBufferToBase64(randomBytes.buffer);
        localStorage.setItem(USER_ID_STORAGE_KEY, userId);
    }
    return userId;
}

/**
 * Simple CBOR decoder for extracting public key from attestationObject
 */
function decodeCBOR(buffer) {
    const view = new DataView(buffer);
    let offset = 0;

    function read() {
        const byte = view.getUint8(offset++);
        const majorType = (byte & 0xe0) >> 5;
        const additionalInfo = byte & 0x1f;

        if (majorType === 0) {
            // Unsigned integer
            if (additionalInfo < 24) return additionalInfo;
            if (additionalInfo === 24) return view.getUint8(offset++);
            if (additionalInfo === 25) return view.getUint16(offset, false), offset += 2, view.getUint16(offset - 2, false);
            if (additionalInfo === 26) return view.getUint32(offset, false), offset += 4, view.getUint32(offset - 4, false);
        } else if (majorType === 1) {
            // Negative integer
            if (additionalInfo < 24) return -1 - additionalInfo;
            if (additionalInfo === 24) return -1 - view.getUint8(offset++);
            if (additionalInfo === 25) return -1 - view.getUint16(offset, false), offset += 2, view.getUint16(offset - 2, false);
        } else if (majorType === 2) {
            // Byte string
            const length = read();
            const bytes = new Uint8Array(buffer, offset, length);
            offset += length;
            return bytes;
        } else if (majorType === 3) {
            // Text string
            const length = read();
            const str = new TextDecoder().decode(new Uint8Array(buffer, offset, length));
            offset += length;
            return str;
        } else if (majorType === 5) {
            // Map
            const length = read();
            const map = {};
            for (let i = 0; i < length; i++) {
                const key = read();
                const value = read();
                map[key] = value;
            }
            return map;
        }
        throw new Error("Unsupported CBOR type");
    }

    return read();
}

/**
 * Extract public key from attestationObject
 */
function extractPublicKeyFromAttestation(attestationObject) {
    const attestation = decodeCBOR(attestationObject);
    const authData = attestation.authData;
    
    // authData structure: rpIdHash(32) + flags(1) + signCount(4) + [attested credential data]
    // Bit 6 of flags indicates attested credential data is included
    const flags = authData[32];
    const hasAttestedCredentialData = (flags & 0x40) !== 0;
    
    if (!hasAttestedCredentialData) {
        throw new Error("No attested credential data in authData");
    }

    // Skip: rpIdHash(32) + flags(1) + signCount(4) + credentialIdLength(2)
    let offset = 32 + 1 + 4;
    const credentialIdLength = (authData[offset] << 8) | authData[offset + 1];
    offset += 2;
    
    // Skip credential ID
    offset += credentialIdLength;
    
    // credentialPublicKey is CBOR-encoded
    const publicKeyBuffer = authData.slice(offset);
    const publicKey = decodeCBOR(publicKeyBuffer);
    
    return publicKey;
}

/**
 * Export public key to JWK format for storage
 */
function publicKeyToJWK(publicKey) {
    // publicKey is a CBOR map with kty, alg, and coordinate data
    // For ES256: kty=2 (EC), crv=1 (P-256), x=-2, y=-3
    // For RS256: kty=3 (RSA), n=-1, e=3
    return JSON.stringify(publicKey);
}

/**
 * Import public key from stored format
 */
async function importPublicKey(jwkString) {
    const publicKey = JSON.parse(jwkString);
    
    if (publicKey[1] === 2) {
        // EC key (ES256 or ES384)
        const crv = publicKey[20] === 1 ? "P-256" : "P-384";
        const x = publicKey[-2] instanceof Uint8Array ? publicKey[-2] : new Uint8Array(publicKey[-2]);
        const y = publicKey[-3] instanceof Uint8Array ? publicKey[-3] : new Uint8Array(publicKey[-3]);
        
        return await crypto.subtle.importKey(
            "raw",
            new Uint8Array([0x04, ...x, ...y]), // Uncompressed point format
            { name: "ECDSA", namedCurve: crv },
            false,
            ["verify"]
        );
    } else if (publicKey[1] === 3) {
        // RSA key
        throw new Error("RSA verification not yet implemented");
    }
    
    throw new Error("Unknown public key type");
}

/**
 * Verify WebAuthn assertion signature
 */
async function verifyAssertionSignature(assertion, storedPublicKeyJWK) {
    const clientDataJSON = new TextDecoder().decode(assertion.response.clientDataJSON);
    const clientData = JSON.parse(clientDataJSON);
    
    const authenticatorData = assertion.response.authenticatorData;
    const signature = assertion.response.signature;
    
    // The signed data is: authenticatorData + SHA256(clientDataJSON)
    const clientDataHash = await crypto.subtle.digest("SHA-256", assertion.response.clientDataJSON);
    const signedData = new Uint8Array(authenticatorData.byteLength + clientDataHash.byteLength);
    signedData.set(new Uint8Array(authenticatorData));
    signedData.set(new Uint8Array(clientDataHash), authenticatorData.byteLength);
    
    const publicKey = await importPublicKey(storedPublicKeyJWK);
    
    try {
        return await crypto.subtle.verify(
            { name: "ECDSA", hash: "SHA-256" },
            publicKey,
            signature,
            signedData
        );
    } catch (e) {
        console.error("[EncryptedStorage] Signature verification failed:", e);
        return false;
    }
}

/**
 * Derive an encryption key from credential ID
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
                resolve(request.result);
            };
            request.onerror = () => {
                resolve([]);
            };
        });
        
        const exists = credentials.length > 0;
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
    
    // Use provided displayName or prompt user
    const username = displayName || prompt("Enter a username for this account:", "ToothPaste User") || "ToothPaste User";
    
    try {
        const credential = await navigator.credentials.create({
            publicKey: {
                challenge: challenge,
                // Relying Party (ToothPaste app) information
                rp: {
                    name: "ToothPaste",
                    id: window.location.hostname,
                },

                // User information for WebAuthn
                user: {
                    id: new Uint8Array(userId),
                    name: username.toLowerCase().replace(/\s+/g, "_"), // Case insensitive username
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

        // Extract public key from attestation object
        const attestationObject = new Uint8Array(credential.response.attestationObject);
        let publicKey;
        try {
            publicKey = extractPublicKeyFromAttestation(attestationObject);
            console.log("[EncryptedStorage] Public key extracted from attestation");
        } catch (e) {
            console.error("[EncryptedStorage] Failed to extract public key:", e);
            throw new Error("Failed to extract public key from credential");
        }

        // Store the credential in IndexedDB
        const db = await Storage.openDB();
        const tx = db.transaction(CREDENTIALS_STORE, "readwrite");
        const store = tx.objectStore(CREDENTIALS_STORE);

        // credential.id is already a string per WebAuthn spec
        const credentialIdAsBase64 = credential.id;

        await new Promise((resolve, reject) => {
            const request = store.put({
                id: credentialIdAsBase64,
                displayName: username,
                publicKey: publicKeyToJWK(publicKey),
                counter: 0,
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
        
        sessionEncryptionKey = await deriveKeyFromCredentialId(credentialIdAsBase64);
        isAuthenticatedFlag = true;
        
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
        const db = await Storage.openDB();
        const tx = db.transaction(CREDENTIALS_STORE, "readonly");
        const store = tx.objectStore(CREDENTIALS_STORE);

        // Get all registered credentials
        const credentials = await new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                resolve(request.result);
            };
            request.onerror = () => reject(request.error);
        });

        if (credentials.length === 0) {
            console.warn("[EncryptedStorage] No credentials found for authentication");
            throw new Error("No registered credentials found. Please register a passkey first.");
        }

        // Generate fresh challenge for this authentication attempt
        const challenge = crypto.getRandomValues(new Uint8Array(32));
        
        const allowCredentials = credentials.map((cred) => ({
            id: new Uint8Array(Storage.base64urlToArrayBuffer(cred.id)),
            type: "public-key",
        }));

        // Get an assertion from the user using the registered credentials
        const assertion = await navigator.credentials.get({
            publicKey: {
                challenge: challenge,
                allowCredentials: allowCredentials,
                timeout: 60000,
                userVerification: "preferred",
            },
        });

        if (!assertion) {
            console.warn("[EncryptedStorage] Authentication was cancelled by user");
            throw new Error("Authentication was cancelled");
        }

        // assertion.id is a string per WebAuthn spec
        const credentialId = assertion.id;
        const usedCredential = credentials.find((cred) => cred.id === credentialId);
        
        if (!usedCredential) {
            console.warn("[EncryptedStorage] Could not find credential that was used for assertion");
            throw new Error("Credential not found: ID does not match any registered credential");
        }

        // Verify the challenge matches what we sent
        const clientDataJSON = new TextDecoder().decode(assertion.response.clientDataJSON);
        const clientData = JSON.parse(clientDataJSON);
        const challengeBase64 = Storage.arrayBufferToBase64(challenge);
        
        if (clientData.challenge !== challengeBase64) {
            console.error("[EncryptedStorage] Challenge mismatch - possible replay attack");
            throw new Error("Challenge verification failed");
        }
        console.log("[EncryptedStorage] Challenge verified");

        // Verify the signature using the stored public key
        if (!usedCredential.publicKey) {
            throw new Error("No public key stored for credential - re-register required");
        }
        
        const signatureValid = await verifyAssertionSignature(assertion, usedCredential.publicKey);
        if (!signatureValid) {
            console.error("[EncryptedStorage] Signature verification failed");
            throw new Error("Signature verification failed");
        }
        console.log("[EncryptedStorage] Signature verified");

        // Verify counter to detect cloned authenticators
        const authenticatorData = assertion.response.authenticatorData;
        const counterBytes = new DataView(authenticatorData.slice(33, 37));
        const signCount = counterBytes.getUint32(0);
        
        if (signCount <= usedCredential.counter) {
            console.warn("[EncryptedStorage] Sign count did not increase - possible cloned authenticator");
            throw new Error("Authenticator sign count verification failed - possible clone detected");
        }
        console.log("[EncryptedStorage] Sign count verified:", { previous: usedCredential.counter, current: signCount });

        // Update counter in database
        const txWrite = db.transaction(CREDENTIALS_STORE, "readwrite");
        const storeWrite = txWrite.objectStore(CREDENTIALS_STORE);
        await new Promise((resolve, reject) => {
            usedCredential.counter = signCount;
            const request = storeWrite.put(usedCredential);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });

        sessionEncryptionKey = await deriveKeyFromCredentialId(usedCredential.id);
        isAuthenticatedFlag = true;
        console.log("[EncryptedStorage] WebAuthn authentication successful");
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
