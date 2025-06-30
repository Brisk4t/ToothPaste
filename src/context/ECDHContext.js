import React, { createContext, useState, useEffect } from 'react';
import { saveSharedSecretBase64, loadSharedSecretBase64 } from './Storage';
import { ec as EC } from 'elliptic';

const ec = new EC('p256');

export const ECDHContext = createContext(); // Shared context for ECDH operations

export const ECDHProvider = ({ children }) => {
  const [keyPair, setKeyPair] = useState(null); // { privateKey, publicKey }
  const [sharedSecret, setSharedSecret] = useState(null); // Shared secret derived from ECDH
  const [publicKeyCompressed, setPublicKeyCompressed] = useState(null);
  const [publicKeyUncompressed, setPublicKeyUncompressed] = useState(null);

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
    setKeyPair(pair); // Store the key pair in state
    return pair;
  };

  // Store self public and private keys
  const storeSelfKeys = async (keys, clientID) => {
    if (!keys || !keys.publicKey || !keys.privateKey) {
      throw new Error("Invalid key pair provided");
    }

    const SelfPublicKeyBase64 = await arrayBufferToBase64(keys.publicKey);
    const SelfPrivateKeyBase64 = await arrayBufferToBase64(keys.privateKey);

    await saveSharedSecretBase64(clientID, 'SelfPublicKey', SelfPublicKeyBase64);
    await saveSharedSecretBase64(clientID, 'SelfPrivateKey', SelfPrivateKeyBase64);

    return;
  };

  // Compress public key (Uint8Array)
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

  // Import peer's public key from raw byte array
  const importPeerPublicKey = async (rawKeyBuffer) => {
    return await crypto.subtle.importKey(
      'raw',
      rawKeyBuffer,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      []
    );
  };

  // Save peer's public key in uncompressed base64 format
  const savePeerPublicKey = async (peerPublicKey, clientID) => {
    if (!peerPublicKey) {
      throw new Error("Invalid peer public key");
    }

    const PeerPublicKeyBase64 = await arrayBufferToBase64(peerPublicKey);
    await saveSharedSecretBase64(clientID, 'PeerPublicKey', PeerPublicKeyBase64);
  };

  // Derive shared secret using ECDH
  const deriveSharedSecret = async (privateKey, peerPublicKey) => {
    const secretBuffer = await crypto.subtle.deriveBits(
      {
        name: 'ECDH',
        public: peerPublicKey,
      },
      privateKey,
      256
    );

    const secretHex = Array.from(new Uint8Array(secretBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    setSharedSecret(secretHex);
    return secretHex;
  };

  


  return (
    <ECDHContext.Provider
      value={{
        keyPair,
        generateECDHKeyPair,
        storeSelfKeys,
        compressKey,
        decompressKey,
        importPeerPublicKey,
        deriveSharedSecret,
        publicKeyUncompressed,
        setPublicKeyUncompressed,
        sharedSecret,
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
function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Encrypt plaintext using AES-GCM with shared secret key
export async function encryptText(sharedSecretHex, plaintext, key) {
  //const key = await importSharedSecretKey(sharedSecretHex);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  // Return base64 string with IV prepended (IV + ciphertext)
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

// Decrypt ciphertext (base64 string with IV prepended)
export async function decryptText(sharedSecretHex, ciphertextBase64, key) {
  //const key = await importSharedSecretKey(sharedSecretHex);
  const combined = Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}