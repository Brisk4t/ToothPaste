import React, { createContext, useState, useEffect, useRef, useMemo } from "react";
import { saveBase64, loadBase64 } from "../services/Storage.js";
import { ec as EC } from "elliptic";
import { create, toBinary, fromBinary } from "@bufbuild/protobuf";

import * as ToothPacketPB from '../services/packetService/toothpacket/toothpacket_pb.js';

const ec = new EC("p256"); // Define the elliptic curve (secp256r1)

/**
 * @typedef {Object} ECDHContextType
 * @property {() => Promise<void>} generateECDHKeyPair
 * @property {(key: ArrayBuffer) => Promise<CryptoKey>} decompressKey
 * @property {(key: ArrayBuffer) => Promise<void>} importPeerPublicKey
 * @property {() => Promise<void>} saveSelfKeys
 * @property {(peerKey: CryptoKey) => Promise<CryptoKey>} deriveKey
 * @property {(key: CryptoKey) => Promise<void>} savePeerPublicKey
 */


/** @type {React.Context<ECDHContextType>} */
export const ECDHContext = createContext(); // Shared context for ECDH operations

export const ECDHProvider = ({ children }) => {
    const aesKey = useRef(null); // AESKey cryptoKey for encrypting/decrypting messages
    const aesKeyB64 = useRef(null); // AES JWK loaded from storage
    const keyPair = useRef(null);

    /**
     * Generate a new ECDH key pair using P-256 curve
     * Stores the pair in keyPair.current for later use in key derivation
     * @returns {Promise<{publicKey: CryptoKey, privateKey: CryptoKey}>} The generated key pair
     */
    const generateECDHKeyPair = async () => {
        const pair = await crypto.subtle.generateKey(
            {
                name: "ECDH",
                namedCurve: "P-256",
            },
            false, // Extractable (only applies to private key)
            ["deriveKey", "deriveBits"]
        );
        keyPair.current = pair; // Store the key pair in state
        return pair;
    };

    /**
     * Save self public key and AES encryption key to IndexedDB storage
     * Requires keyPair and aesKeyB64 to be set in refs
     * @param {string} clientID - The device MAC address or client identifier to store keys under
     * @throws {Error} If key pair or AES key is not yet generated
     */
    const saveKeys = async (clientID) => {
        if (!keyPair.current) {
            return;
        }
        
        if (!aesKeyB64.current) {
            return;
        }

        // Export the public key as an arraybuffer (66 bytes uncompressed)
        var rawPublicKey = await crypto.subtle.exportKey("raw", keyPair.current.publicKey);

        // Convert the arraybuffer to base64 for storage
        var b64SelfPubkey = arrayBufferToBase64(rawPublicKey);

        // Store the public key and AES key in IndexedDB under the clientID
        await saveBase64(clientID, "SelfPublicKey", b64SelfPubkey);
        await saveBase64(clientID, "aesKey", aesKeyB64.current);

        return;
    };

    /**
     * Compress a P-256 public key from uncompressed (65 bytes) to compressed (33 bytes) format
     * Uses point compression with prefix 0x02 (even Y) or 0x03 (odd Y)
     * @param {CryptoKey} pkey - The public key to compress
     * @returns {Promise<Uint8Array>} Compressed key (33 bytes): [prefix, ...x-coordinate]
     * @throws {Error} If key format is not valid uncompressed P-256 format
     */
    const compressKey = async (pkey) => {
        const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", pkey));
        if (rawKey[0] !== 0x04 || rawKey.length !== 65) {
            throw new Error("Unexpected raw public key format");
        }
        const x = rawKey.slice(1, 33);
        const y = rawKey.slice(33, 65);
        const prefix = y[y.length - 1] % 2 === 0 ? 0x02 : 0x03;
        const compressed = new Uint8Array(33);
        compressed[0] = prefix;
        compressed.set(x, 1);
        return compressed;
    };

    /**
     * Decompress a compressed P-256 public key (33 bytes) to uncompressed format (65 bytes)
     * Uses elliptic curve math to recover the full Y coordinate from the compressed format
     * @param {Uint8Array} compressedBytes - Compressed public key (33 bytes): [prefix, ...x-coordinate]
     * @returns {ArrayBuffer} Uncompressed key in raw format (65 bytes): [0x04, ...x, ...y]
     */
    const decompressKey = (compressedBytes) => {
        const key = ec.keyFromPublic(compressedBytes, "array");
        const pubPoint = key.getPublic();
        const x = pubPoint.getX().toArray("be", 32);
        const y = pubPoint.getY().toArray("be", 32);

        const uncompressed = new Uint8Array(65);
        uncompressed[0] = 0x04;
        uncompressed.set(x, 1);
        uncompressed.set(y, 33);
        return uncompressed.buffer;
    };

    /**
     * Import a peer's uncompressed public key as a CryptoKey object for ECDH operations
     * @param {ArrayBuffer} rawKeyBuffer - Raw uncompressed public key (65 bytes)
     * @returns {Promise<CryptoKey>} CryptoKey object usable for key derivation
     */
    const importPeerPublicKey = async (rawKeyBuffer) => {
        return await crypto.subtle.importKey("raw", 
            rawKeyBuffer, 
            { name: "ECDH", namedCurve: "P-256" }, 
            true, // Extractable 
            []);
    };

    /**
     * Import a private key in PKCS8 format as a CryptoKey for ECDH operations
     * @param {ArrayBuffer} rawKeyBuffer - Private key in PKCS8 format
     * @returns {Promise<CryptoKey>} CryptoKey object for key derivation and signing operations
     */
    const importSelfPrivateKey = async (rawKeyBuffer) => {
        return await crypto.subtle.importKey(
            "pkcs8", // Private key format
            rawKeyBuffer,
            { name: "ECDH", namedCurve: "P-256" },
            false, // extractable
            ["deriveKey", "deriveBits"] // Key usages for ECDH
        );
    };

    /**
     * Import raw AES-GCM key bytes as a CryptoKey for encryption/decryption
     * @param {Uint8Array|ArrayBuffer} keyBytes - Raw AES key material (32 bytes for 256-bit key)
     * @param {boolean} [extractable=false] - Whether the key can be exported (usually false for security)
     * @param {string[]} [usages=["encrypt", "decrypt"]] - Permitted key operations
     * @returns {Promise<CryptoKey>} CryptoKey object for AES-GCM operations
     */
    async function importAESKeyFromBytes(keyBytes, extractable = false, usages = ["encrypt", "decrypt"]) {
        // keyBytes: Uint8Array or ArrayBuffer
        return await crypto.subtle.importKey(
            "raw",
            keyBytes,
            { name: "AES-GCM" },
            extractable,
            usages
        );
    }

    /**
     * Save peer's public key to IndexedDB storage in base64 format
     * @param {ArrayBuffer} peerPublicKey - Peer's public key in raw format
     * @param {string} clientID - Device MAC address or client identifier to store under
     * @throws {Error} If peerPublicKey is null or invalid
     */
    const savePeerPublicKey = async (peerPublicKey, clientID) => {
        if (!peerPublicKey) {
            throw new Error("Invalid peer public key");
        }

        const PeerPublicKeyBase64 = await arrayBufferToBase64(peerPublicKey);
        await saveBase64(clientID, "PeerPublicKey", PeerPublicKeyBase64);
    };

    /**
     * Perform ECDH key derivation: compute shared secret and derive AES-GCM key using HKDF
     * Stores results in aesKey.current and aesKeyB64.current for later encryption operations
     * @param {CryptoKey} peerPubKey - Peer's public key (CryptoKey object)
     * @returns {Promise<void>} Updates internal state; no direct return value
     */
    const deriveKey = async (peerPubKey) => {
        
        //Derive just the shared secret
        const sharedSecret = await crypto.subtle.deriveBits(
            {
                name: "ECDH",
                public: peerPubKey, // Their public key (as a cryptokey object)
            },
            keyPair.current.privateKey, // Our private key
            256
        );

        const info = new TextEncoder().encode("aes-gcm-256");
        const keyMaterial = await crypto.subtle.importKey(
            "raw", 
            sharedSecret, 
            "HKDF", 
            false, 
            ["deriveKey"]
        );

        // Use HKDF to derive a symmetric AES-GCM key from the shared secret
        const aesKeyGen = await crypto.subtle.deriveKey(
            {
                name: "HKDF",
                hash: "SHA-256",
                salt: new Uint8Array([]),
                info: info,
            },

            //Use this cryptoKey object
            keyMaterial,

            // Use the AES-GCM algorithm to create an AES key
            {
                name: "AES-GCM",
                length: 256,
            },

            true, // not extractable || extractable ONLY FOR DEBUGGING
            ["encrypt", "decrypt"]
        );

        aesKey.current = aesKeyGen; // Set the aes key

        aesKeyB64.current = await crypto.subtle.exportKey("raw", aesKeyGen) 
                            .then((rawKey) => arrayBufferToBase64(rawKey));
    };

    /**
     * Encrypt data using AES-GCM with the derived shared secret key
     * Generates random 12-byte IV and returns authentication tag separately
     * @param {string|Uint8Array} unEncryptedData - Data to encrypt
     * @param {ArrayBuffer} [aad] - Additional authenticated data (unused but available for integrity checking)
     * @returns {Promise<Object>} DataPacket with encryptedData, IV, tag, and metadata
     */
    const encryptText = async (unEncryptedData, aad) => {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const data = unEncryptedData instanceof Uint8Array ? unEncryptedData : new TextEncoder().encode(unEncryptedData);

        const encryptedBytes = new Uint8Array(await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            aesKey.current,
            data
        ));

        const ciphertextLength = encryptedBytes.length - 16; // 16-byte auth tag

        return create(ToothPacketPB.DataPacketSchema, {
            encryptedData: encryptedBytes.slice(0, ciphertextLength),
            dataLen: ciphertextLength,
            iv,
            tag: encryptedBytes.slice(ciphertextLength),
        });
    };

    /**
     * Decrypt ciphertext using AES-GCM with the derived shared secret key
     * Expected format: base64 string with 12-byte IV prepended to ciphertext+tag
     * @param {string} ciphertextBase64 - Base64 encoded [IV (12 bytes) + ciphertext + tag (16 bytes)]
     * @returns {Promise<string>} Decrypted plaintext as UTF-8 string
     */
    const decryptText = async (ciphertextBase64) => {
        const combined = new Uint8Array(base64ToArrayBuffer(ciphertextBase64));
        const iv = combined.slice(0, 12);
        const data = combined.slice(12);
        
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv }, 
            aesKey.current, data
        );

        return new TextDecoder().decode(decrypted);
    };

    /**
     * Create and encrypt a ToothPacket payload, yielding encrypted DataPackets
     * Generator function that can yield multiple packets if payload exceeds max size
     * @param {number} id - Packet ID for identification
     * @param {Object} payload - Protobuf EncryptedData object to encrypt
     * @param {boolean} [slowMode=true] - Whether to use slow transmission mode
     * @param {number} [packetPrefix=0] - Prefix byte for packet identification
     * @yields {Object} DataPacket with encryptedData, IV, tag, and metadata
     */
    const createEncryptedPackets = async function* (id, payload, slowMode = true, packetPrefix=0) {
        const byteArray = toBinary(ToothPacketPB.EncryptedDataSchema, payload);
        var data = new Uint8Array(byteArray);
        
        const encryptedPacket = await encryptText(data, null); // Encrypt the encryptedData component of a ToothPacket and get DataPacket
        
        // Set packet metadata
        encryptedPacket.packetID = id;
        encryptedPacket.slowMode = slowMode;
        encryptedPacket.packetNumber = 1;
        encryptedPacket.totalPackets = 1;

        yield encryptedPacket;
    };

    /**
     * Load previously saved keys from IndexedDB storage for a device
     * Restores AES key into aesKey.current for decryption operations
     * @param {string} clientID - Device MAC address or client identifier to load keys from
     * @returns {Promise<void>} Updates internal aesKey.current state
     */
    const loadKeys = async (clientID) => {
        const peerPubKey = await loadBase64(clientID, "PeerPublicKey");
        var aesKeyB64 = await loadBase64(clientID, "aesKey");
        aesKey.current = await importAESKeyFromBytes(base64ToArrayBuffer(aesKeyB64));
    };

    /**
     * Complete key exchange flow: decompress peer key, generate our key pair, derive AES key, and save all keys
     * Single high-level function that encapsulates the entire ECDH handshake process
     * @param {string} peerKeyBase64 - Peer's compressed public key in base64 format (decodes to 33 bytes)
     * @param {string} deviceMacAddress - Device MAC address to store keys under
     * @returns {Promise<string>} Base64-encoded uncompressed self public key to send to peer
     * @throws {Error} If peer key is not 33 bytes, or if any cryptographic operation fails
     */
    const processPeerKeyAndGenerateSharedSecret = async (peerKeyBase64, deviceMacAddress) => {
        // Decompress and import peer public key
        const compressedBytes = new Uint8Array(base64ToArrayBuffer(peerKeyBase64));
        
        if (compressedBytes.length !== 33) {
            throw new Error('Compressed public key must be 33 bytes');
        }

        // Decompress the peer's compressed public key to raw uncompressed format
        // Then import it as a CryptoKey object for ECDH operations
        const rawUncompressed = decompressKey(compressedBytes);
        const peerPublicKeyObject = await importPeerPublicKey(rawUncompressed);

        // Save the peer public key
        const rawPeerPublicKey = await crypto.subtle.exportKey('raw', peerPublicKeyObject);
        await savePeerPublicKey(rawPeerPublicKey, deviceMacAddress);

        // Generate our key pair
        await generateECDHKeyPair();

        // Export our public key in raw uncompressed format and convert to base64 for sending to peer
        const rawSelfPublicKey = await crypto.subtle.exportKey('raw', keyPair.current.publicKey);
        const b64SelfPublic = arrayBufferToBase64(rawSelfPublicKey);

        // Derive shared secret using peer's public key
        await deriveKey(peerPublicKeyObject);

        // Save all keys (self public key and AES key)
        await saveKeys(deviceMacAddress);

        return b64SelfPublic;
    };

    // Context Provider return
    const contextValue = useMemo(() => ({
        keyPair,
        generateECDHKeyPair,
        saveSelfKeys: saveKeys,
        compressKey,
        decompressKey,
        importPeerPublicKey,
        deriveKey,
        savePeerPublicKey,
        encryptText,
        decryptText,
        createEncryptedPackets,
        loadKeys,
        processPeerKeyAndGenerateSharedSecret,
    }), []);

    return (
        <ECDHContext.Provider value={contextValue}>
            {children}
        </ECDHContext.Provider>
    );
};

// Convert byte array to Base64 string
export function arrayBufferToBase64(buffer) {
    const rawBytes = new Uint8Array(buffer);
    const binaryString = Array.from(rawBytes, (b) => String.fromCharCode(b)).join("");
    return btoa(binaryString);
}

// Convert Base64 string to byte array
export function base64ToArrayBuffer(base64) {
    const decoded = atob(base64);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
        bytes[i] = decoded.charCodeAt(i);
    }
    return bytes.buffer;
}
