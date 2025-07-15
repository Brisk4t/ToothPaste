import React, { createContext, useState, useEffect, useRef } from 'react';
import { saveBase64, loadBase64 } from './Storage';
import { ec as EC } from 'elliptic';
import {Packet} from './PacketFunctions'

const ec = new EC('p256');

export const ECDHContext = createContext(); // Shared context for ECDH operations


export const ECDHProvider = ({ children }) => {
    //const [keyPair, setKeyPair] = useState(null); // { privateKey, publicKey }
    const aesKey = useRef(null); // Shared secret derived from ECDH
    const keyPair = useRef(null);
    // Generate ECDH keypair
    const generateECDHKeyPair = async () => {
        const pair = await crypto.subtle.generateKey(
            {
                name: 'ECDH',
                namedCurve: 'P-256',
            },
            true,
            ['deriveKey', 'deriveBits']
        );
        keyPair.current = pair; // Store the key pair in state
        return pair;
    };

    // Save self base64 uncompressed public and private keys
    const saveSelfKeys = async (clientID) => {
        if(!keyPair.current) {
            console.log("No keypair generated before saveSelfKeys was called");
            return;
        }

        var rawPublicKey = await crypto.subtle.exportKey('raw', keyPair.current.publicKey);
        var rawPrivateKey = await crypto.subtle.exportKey('pkcs8', keyPair.current.privateKey);
        
        var publicKey = arrayBufferToBase64(rawPublicKey);
        var privateKey = arrayBufferToBase64(rawPrivateKey);

        if (!publicKey || !privateKey) {
            throw new Error("Invalid key pair provided");
        }

        await saveBase64(clientID, 'SelfPublicKey', publicKey);
        await saveBase64(clientID, 'SelfPrivateKey', privateKey);


        console.log("Self public key saved:", publicKey);
        return;
    };

    // Compress cryptokey object to uncompressed uint8 Uint8Array(33 bytes)
    const compressKey = async (pkey) => {
        const rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', pkey));
        if (rawKey[0] !== 0x04 || rawKey.length !== 65) {
            throw new Error("Unexpected raw public key format");
        }
        const x = rawKey.slice(1, 33);
        const y = rawKey.slice(33, 65);
        const prefix = (y[y.length - 1] % 2 === 0) ? 0x02 : 0x03;
        const compressed = new Uint8Array(33);
        compressed[0] = prefix;
        compressed.set(x, 1);
        return compressed;
    };

    // Decompress Uint8Array(33 bytes) to Uint8Array(66 bytes)
    const decompressKey = (compressedBytes) => {
        const key = ec.keyFromPublic(compressedBytes, 'array');
        const pubPoint = key.getPublic();
        const x = pubPoint.getX().toArray('be', 32);
        const y = pubPoint.getY().toArray('be', 32);

        const uncompressed = new Uint8Array(65);
        uncompressed[0] = 0x04;
        uncompressed.set(x, 1);
        uncompressed.set(y, 33);
        return uncompressed.buffer;
    };

    // Import Peer public key as a cryptoKey object from Uint8Array(66 bytes)
    const importPeerPublicKey = async (rawKeyBuffer) => {
        return await crypto.subtle.importKey(
            'raw',
            rawKeyBuffer,
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            []
        );
    };

    // Import the keyBuffer as a cryptoKey object
    const importSelfPrivateKey = async (rawKeyBuffer) => {
      return await crypto.subtle.importKey(
        "pkcs8",               // Private key format
        rawKeyBuffer,
        { name: "ECDH", namedCurve: "P-256"},
        false,                  // extractable
        ["deriveKey", "deriveBits"] // Key usages for ECDH
      );
    };
    
    // Save PeerPublicKey (Uint8Array) in base64 format to indexedDB under the clientID store
    const savePeerPublicKey = async (peerPublicKey, clientID) => {
        if (!peerPublicKey) {
            throw new Error("Invalid peer public key");
        }

        const PeerPublicKeyBase64 = await arrayBufferToBase64(peerPublicKey);
        await saveBase64(clientID, 'PeerPublicKey', PeerPublicKeyBase64);
        console.log("Peer public key saved:", PeerPublicKeyBase64);
    };

    // Derive shared secret using ECDH store it in the sharedSecret variable
    const deriveKey = async (privateKey, peerPublicKey) => {
        //Derive just the shared secret
        const sharedSecret = await crypto.subtle.deriveBits(
            {
                name: 'ECDH',
                public: peerPublicKey,
            },
            privateKey,
            256
        );

        // console.log("Shared Secret: ")
        // console.log(arrayBufferToBase64(sharedSecret));

        const info = new TextEncoder().encode("aes-gcm-256");
        const keyMaterial = await crypto.subtle.importKey(
            "raw", 
            sharedSecret, 
            "HKDF", 
            false, 
            ["deriveKey"]
        );

        // Derive the sharedSecret and use it to return a usable aesKey 
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
                name: 'AES-GCM',
                length: 256,
            },

            true, // not extractable || extractable ONLY FOR DEBUGGING
            ['encrypt', 'decrypt']
        );

        aesKey.current = aesKeyGen; // Set the aes key


        const rawKey = await crypto.subtle.exportKey("raw", aesKey.current);
        const keyBytes = new Uint8Array(rawKey);
    };

    // Encrypt plaintext using AES-GCM with shared secret key
    const encryptText = async (plaintext, aad) => {
        const iv = crypto.getRandomValues(new Uint8Array(12)); // 12 byte IV
        const encoder = new TextEncoder();
        const data = (plaintext instanceof Uint8Array) ? plaintext : encoder.encode(plaintext);

        // Encrypt the data with the AES key from storage
        const encrypted = await crypto.subtle.encrypt(
            {   name: 'AES-GCM', 
                iv, 
                //additionalData: aad // extra data that is not encrypted but authenticated by TAG for integrity
            },
            aesKey.current,
            data
        );

        const encryptedBytes = new Uint8Array(encrypted); // encryptedBytes contains data + 16 byte tag
        
        // Return base64 string with IV prepended (IV + ciphertext)
        //const combined = new Uint8Array(4 + iv.length + encryptedBytes.length);        
        const combined = new Uint8Array(iv.length + encryptedBytes.length);        
        
        // combined.set(iv, 4); // The iv is byte 5+12 bytes
        // combined.set(encryptedBytes, 4 + iv.length); // The rest of the packet
        combined.set(iv);
        combined.set(encryptedBytes, iv.length);
        return combined;
    };

    // Decrypt ciphertext (base64 string with IV prepended)
    const decryptText = async (ciphertextBase64) => {
        const combined = Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0));
        const iv = combined.slice(0, 12);
        const data = combined.slice(12);
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            aesKey,
            data
        );
        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    };

    // create and encrypt packet -> returns an iterator of one or more packets where payload size < max_data_size
    const createEncryptedPackets = async function *(id, payload, slowMode=true){
        const encoder = new TextEncoder();
        const data = (payload instanceof Uint8Array) ? payload : encoder.encode(payload);
        const totalChunks = Math.ceil(data.length / Packet.MAX_DATA_SIZE);
        
        // console.log(payload);
        // console.log(data.length);
        // console.log(totalChunks);   
        // TODO: Raise here if too much data is given
        if(totalChunks > 254)
            return;

        for (let chunkNumber = 0; chunkNumber < totalChunks; chunkNumber++){
            const chunkData = data.slice(chunkNumber * Packet.MAX_DATA_SIZE, (chunkNumber+1) * Packet.MAX_DATA_SIZE);
            const nullTerminated = new Uint8Array(chunkData.length + 1);
            nullTerminated.set(chunkData);
            const aad = new Uint8Array([chunkNumber, totalChunks]);

            const encrypted = await encryptText(nullTerminated, aad);
            yield new Packet(id, encrypted, chunkNumber, totalChunks, slowMode);
        }
    };
    
    const loadKeys = async(clientID) => {
      const peerPubKey = await loadBase64(clientID, 'PeerPublicKey');
      console.log("Peer pubkey: ", peerPubKey)
      const pubKeyObject = await importPeerPublicKey(base64ToArrayBuffer(peerPubKey));

      const sprivKey = await loadBase64(clientID, 'SelfPrivateKey');
      console.log("Self private key: ", sprivKey)
      const privKeyObject =  await importSelfPrivateKey(base64ToArrayBuffer(sprivKey));

      await deriveKey(privKeyObject, pubKeyObject);
    };

    // Context Provider return
    return (
        <ECDHContext.Provider
            value={{
                keyPair,
                generateECDHKeyPair,
                saveSelfKeys,
                compressKey,
                decompressKey,
                importPeerPublicKey,
                deriveKey,
                savePeerPublicKey,
                encryptText,
                decryptText,
                createEncryptedPackets,
                loadKeys,
            }}
        >
            {children}
        </ECDHContext.Provider>
    );
};

// Convert byte array to Base64 string
export function arrayBufferToBase64(buffer) {
    const rawBytes = new Uint8Array(buffer);
    const binaryString = Array.from(rawBytes, b => String.fromCharCode(b)).join('');
    return btoa(binaryString);
}

// Convert Base64 string to byte array
export function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

