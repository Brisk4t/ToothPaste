import { ec as EC } from 'elliptic';

const cryptoEc = new EC('p256');

/**
 * SessionManager handles ECDH key generation, derivation, and management.
 * Decoupled from React and browser-specific APIs — works in any JS environment.
 * 
 * Responsibilities:
 * - Generate ECDH key pairs (P-256 curve)
 * - Compress/decompress public keys
 * - Derive shared secrets and session AES keys
 * - Store/retrieve keys via an abstract storage adapter
 */
export class SessionManager {
  constructor(storageAdapter = null) {
    this.storageAdapter = storageAdapter; // Optional: IndexedDB or localStorage adapter
    this.keyPair = null; // { publicKey: CryptoKey, privateKey: CryptoKey }
    this.aesKey = null; // Derived AES key for encryption/decryption
    this.peerPublicKey = null; // Peer's public key (CryptoKey)
  }

  /**
   * Generate a new ECDH key pair using P-256 curve
   * @returns {Promise<{publicKey: CryptoKey, privateKey: CryptoKey}>}
   */
  async generateKeyPair() {
    this.keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      false, // non-extractable private key (Web Crypto best practice)
      ['deriveKey', 'deriveBits']
    );
    return this.keyPair;
  }

  /**
   * Get the self public key as raw bytes (uncompressed, 65 bytes)
   * @returns {Promise<Uint8Array>} Uncompressed public key bytes
   */
  async getSelfPublicKeyRaw() {
    if (!this.keyPair) {
      throw new Error('Key pair not yet generated');
    }
    const raw = await crypto.subtle.exportKey('raw', this.keyPair.publicKey);
    return new Uint8Array(raw);
  }

  /**
   * Compress a public key from uncompressed (65 bytes) to compressed (33 bytes) format.
   * Uses point compression with prefix 0x02 (even Y) or 0x03 (odd Y).
   * @param {CryptoKey} publicKey - The public key to compress
   * @returns {Promise<Uint8Array>} Compressed key (33 bytes)
   */
  async compressPublicKey(publicKey) {
    const rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));

    if (rawKey[0] !== 0x04 || rawKey.length !== 65) {
      throw new Error(
        `Invalid uncompressed P-256 key: expected 0x04 prefix and 65 bytes, got 0x${rawKey[0].toString(16)} and ${rawKey.length} bytes`
      );
    }

    const x = rawKey.slice(1, 33);
    const y = rawKey.slice(33, 65);
    const prefix = y[y.length - 1] % 2 === 0 ? 0x02 : 0x03;

    const compressed = new Uint8Array(33);
    compressed[0] = prefix;
    compressed.set(x, 1);

    return compressed;
  }

  /**
   * Decompress a compressed public key (33 bytes) to uncompressed format (65 bytes).
   * Uses elliptic curve math to recover the full Y coordinate.
   * @param {Uint8Array} compressedBytes - Compressed public key (33 bytes)
   * @returns {Uint8Array} Uncompressed key (65 bytes): [0x04, ...x, ...y]
   */
  decompressPublicKey(compressedBytes) {
    if (compressedBytes.length !== 33 || (compressedBytes[0] !== 0x02 && compressedBytes[0] !== 0x03)) {
      throw new Error(
        `Invalid compressed P-256 key: expected 33 bytes with prefix 0x02 or 0x03, got ${compressedBytes.length} bytes with prefix 0x${compressedBytes[0].toString(16)}`
      );
    }

    const key = cryptoEc.keyFromPublic(compressedBytes, 'array');
    const pubPoint = key.getPublic();
    const x = pubPoint.getX().toArray('be', 32);
    const y = pubPoint.getY().toArray('be', 32);

    const uncompressed = new Uint8Array(65);
    uncompressed[0] = 0x04;
    uncompressed.set(x, 1);
    uncompressed.set(y, 33);

    return uncompressed;
  }

  /**
   * Import a peer's uncompressed public key as a CryptoKey for ECDH.
   * @param {ArrayBuffer|Uint8Array} rawKeyBuffer - 65-byte uncompressed public key
   * @returns {Promise<CryptoKey>}
   */
  async importPeerPublicKey(rawKeyBuffer) {
    const buffer = rawKeyBuffer instanceof Uint8Array ? rawKeyBuffer.buffer : rawKeyBuffer;
    this.peerPublicKey = await crypto.subtle.importKey('raw', buffer, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    return this.peerPublicKey;
  }

  /**
   * Derive a shared secret using ECDH (our private key + peer's public key).
   * @returns {Promise<ArrayBuffer>} 32-byte shared secret
   */
  async deriveSharedSecret() {
    if (!this.keyPair || !this.peerPublicKey) {
      throw new Error('Both key pair and peer public key required');
    }

    return await crypto.subtle.deriveBits(
      { name: 'ECDH', public: this.peerPublicKey },
      this.keyPair.privateKey,
      256 // 256 bits = 32 bytes
    );
  }

  /**
   * Derive an AES-GCM key from a shared secret using HKDF-SHA256.
   * @param {ArrayBuffer} sharedSecret - 32-byte shared secret from ECDH
   * @param {Uint8Array} salt - Optional salt for HKDF (default: zeros)
   * @param {Uint8Array} info - Optional info parameter for HKDF
   * @returns {Promise<CryptoKey>} AES-256-GCM key for encryption
   */
  async deriveAESKey(sharedSecret, salt = null, info = null) {
    // Default salt and info if not provided
    const defaultSalt = new Uint8Array(32);
    const defaultInfo = new TextEncoder().encode('aes-gcm-256'); // Must match firmware

    // Import shared secret as raw key for HKDF
    const keyMaterial = await crypto.subtle.importKey('raw', sharedSecret, { name: 'HKDF' }, false, ['deriveBits']);

    // Derive 32 bytes (256-bit) for AES-256
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: salt || defaultSalt,
        info: info || defaultInfo,
      },
      keyMaterial,
      256
    );

    // Import the derived bits as an AES key
    this.aesKey = await crypto.subtle.importKey('raw', derivedBits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

    return this.aesKey;
  }

  /**
   * Encrypt data using AES-256-GCM with a random IV.
   * @param {ArrayBuffer|Uint8Array} plaintext - Data to encrypt
   * @returns {Promise<Uint8Array>} IV (12 bytes) + ciphertext + tag (16 bytes)
   */
  async encrypt(plaintext) {
    if (!this.aesKey) {
      throw new Error('AES key not yet derived');
    }

    // Generate random 12-byte IV (nonce)
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt with AES-GCM
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.aesKey, plaintext);

    // Return IV + ciphertext (tag is included in ciphertext by Web Crypto)
    const result = new Uint8Array(iv.length + ciphertext.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(ciphertext), iv.length);

    return result;
  }

  /**
   * Decrypt data using AES-256-GCM.
   * @param {ArrayBuffer|Uint8Array} encrypted - IV (12 bytes) + ciphertext + tag
   * @returns {Promise<Uint8Array>} Decrypted plaintext
   */
  async decrypt(encrypted) {
    if (!this.aesKey) {
      throw new Error('AES key not yet derived');
    }

    const buf = encrypted instanceof Uint8Array ? encrypted : new Uint8Array(encrypted);

    // Extract IV (first 12 bytes)
    const iv = buf.slice(0, 12);
    const ciphertext = buf.slice(12);

    // Decrypt with AES-GCM
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, this.aesKey, ciphertext);

    return new Uint8Array(plaintext);
  }

  /**
   * Save self public key and shared secret to storage.
   * @param {string} deviceId - Device identifier (MAC address or UUID)
   * @param {ArrayBuffer|Uint8Array} sharedSecret - Shared secret to store
   * @returns {Promise<void>}
   */
  async saveKeys(deviceId, sharedSecret) {
    if (!this.storageAdapter) {
      console.warn('No storage adapter configured, skipping key save');
      return;
    }

    if (!this.keyPair) {
      throw new Error('Key pair not yet generated');
    }

    const publicKeyRaw = await crypto.subtle.exportKey('raw', this.keyPair.publicKey);
    const publicKeyB64 = this._arrayBufferToBase64(publicKeyRaw);
    const secretB64 = this._arrayBufferToBase64(sharedSecret);

    await this.storageAdapter.save(deviceId, 'SelfPublicKey', publicKeyB64);
    await this.storageAdapter.save(deviceId, 'SharedSecret', secretB64);
  }

  /**
   * Load keys from storage for a specific device.
   * @param {string} deviceId - Device identifier
   * @returns {Promise<{publicKey: string, secret: string} | null>} Keys in base64, or null if not found
   */
  async loadKeys(deviceId) {
    if (!this.storageAdapter) {
      return null;
    }

    try {
      const [publicKey, secret] = await Promise.all([
        this.storageAdapter.load(deviceId, 'SelfPublicKey'),
        this.storageAdapter.load(deviceId, 'SharedSecret'),
      ]);

      return publicKey && secret ? { publicKey, secret } : null;
    } catch (err) {
      console.error(`Failed to load keys for device ${deviceId}:`, err);
      return null;
    }
  }

  /**
   * Check if keys exist for a device in storage.
   * @param {string} deviceId - Device identifier
   * @returns {Promise<boolean>}
   */
  async keysExist(deviceId) {
    if (!this.storageAdapter) {
      return false;
    }
    try {
      return await this.storageAdapter.exists(deviceId, 'SelfPublicKey');
    } catch (err) {
      return false;
    }
  }

  // Helper: Convert ArrayBuffer to base64
  _arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Helper: Convert base64 to ArrayBuffer
  _base64ToArrayBuffer(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
