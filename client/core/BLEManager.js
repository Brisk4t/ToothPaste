import { EventEmitter } from './EventEmitter.js';
import { HIDMap, parseKeyCombo } from './HIDKeyMap.js';

/**
 * BLEManager orchestrates the entire BLE lifecycle:
 * - Device discovery and connection
 * - ECDH authentication and key agreement
 * - Encrypted packet transmission and reception
 * - Status management and event emission
 *
 * Compatible with any BLEAdapter implementation (Web-BLE, native, etc).
 * Emits events: 'status', 'device', 'disconnect', 'error', 'response', 'serialData'
 */

const DEFAULT_SERVICE_UUID = '19b10000-e8f2-537e-4f6c-d104768a1214';
const DEFAULT_PACKET_CHAR_UUID = '6856e119-2c7b-455a-bf42-cf7ddd2c5907';
const DEFAULT_SEMAPHORE_CHAR_UUID = '6856e119-2c7b-455a-bf42-cf7ddd2c5908';
const DEFAULT_MAC_CHAR_UUID = '19b10002-e8f2-537e-4f6c-d104768a1214';

// Status enum
export const Status = {
  DISCONNECTED: 0,
  READY: 1,
  CONNECTED: 2,
  UNSUPPORTED: 3,
  SCANNING: 4,
};

export class BLEManager extends EventEmitter {
  /**
   * @param {BLEAdapter} bleAdapter - Platform-specific BLE adapter
   * @param {SessionManager} sessionManager - Handles ECDH crypto + key storage
   * @param {PacketHandler} packetHandler - Constructs protobuf packets
   * @param {Object} [options] - Optional UUID overrides
   */
  constructor(bleAdapter, sessionManager, packetHandler, options = {}) {
    super();
    this.bleAdapter = bleAdapter;
    this.sessionManager = sessionManager;
    this.packetHandler = packetHandler;

    // Allow UUID overrides for different firmware builds
    this.serviceUUID = options.serviceUUID || DEFAULT_SERVICE_UUID;
    this.packetCharUUID = options.packetCharacteristicUUID || DEFAULT_PACKET_CHAR_UUID;
    this.semaphoreCharUUID = options.hidSemaphoreCharacteristicUUID || DEFAULT_SEMAPHORE_CHAR_UUID;
    this.macCharUUID = options.macAddressCharacteristicUUID || DEFAULT_MAC_CHAR_UUID;

    this.status = Status.DISCONNECTED;
    this.device = null;
    this.connected = false;
    this.authenticated = false;
    this.deviceMAC = null;
    this._pairingInProgress = false;
    this.packetsWaitingForSemaphore = [];
    this.responseTimeout = 30000;
    this.firmwareVersion = null;
  }

  /**
   * Update status and emit event.
   */
  async _setStatus(newStatus) {
    if (this.status === newStatus) return;
    this.status = newStatus;
    this.emit('status', newStatus);
  }

  /**
   * Connect to the ToothPaste device.
   * @param {Object} options
   * @param {Function} options.onDisconnect - Callback when device disconnects
   * @returns {Promise<void>}
   */
  async connect(options = {}) {
    try {
      if (this.connected) {
        console.log('Already connected');
        return;
      }

      await this._setStatus(Status.SCANNING);

      // Request device
      const device = await this.bleAdapter.requestDevice();
      this.device = device;

      // Connect to GATT
      const gatt = await this.bleAdapter.connectGATT(device);

      // Get service
      const service = await this._getServiceWithRetry(gatt, this.serviceUUID, 3);
      if (!service) {
        throw new Error(`Service ${this.serviceUUID} not found`);
      }

      // Get characteristics
      this.packetChar = await this.bleAdapter.getCharacteristic(service, this.packetCharUUID);
      this.semaphoreChar = await this.bleAdapter.getCharacteristic(service, this.semaphoreCharUUID);
      this.macChar = await this.bleAdapter.getCharacteristic(service, this.macCharUUID);

      if (!this.packetChar || !this.semaphoreChar) {
        throw new Error('Required characteristics not found');
      }

      // Start notifications
      await this.bleAdapter.startNotifications(this.packetChar, (data) => this._onPacketNotification(data));
      await this.bleAdapter.startNotifications(this.semaphoreChar, (data) => this._onSemaphoreNotification(data));

      // Get device MAC
      const macBuffer = await this.bleAdapter.readCharacteristic(this.macChar);
      const macBytes = new Uint8Array(macBuffer);
      const macAddr = Array.from(macBytes).map((b) => b.toString(16).padStart(2, '0')).join(':');

      // Store MAC for later pairing
      this.deviceMAC = macAddr;

      // Emit device info now that we have the MAC address
      this.emit('device', { name: device.name, mac: macAddr });

      // Mark as connected to device (but not authenticated yet)
      this.connected = true;

      // Set status to CONNECTED (BLE linked, awaiting pairing/authentication)
      await this._setStatus(Status.CONNECTED);

      // Subscribe to disconnect event
      if (options.onDisconnect) {
        this.bleAdapter.onDisconnect(this.device, () => {
          this.connected = false;
          this.authenticated = false;
          this._pairingInProgress = false;
          this.emit('disconnect');
          options.onDisconnect();
        });
      }

      // Attempt non-blocking auto-authentication for known (returning) devices.
      // If keys are not found or firmware rejects us, status stays CONNECTED
      // and the UI will show the manual Pair button.
      this._tryAutoAuth();

      console.log('Connected to ToothPaste device (ready for pairing)');
    } catch (err) {
      console.error('Connection failed:', err);
      this.emit('error', err);
      await this._setStatus(Status.DISCONNECTED);
      throw err;
    }
  }

  /**
   * Attempt non-blocking auto-authentication for known devices.
   * Swallows errors — status stays at CONNECTED on failure so the UI
   * can show the manual paired button.
   * @private
   */
  _tryAutoAuth() {
    this.pair().catch((err) => {
      if (err.message !== 'NO_KEYS') {
        console.warn('[BLEManager] Auto-auth failed:', err.message);
      }
    });
  }

  /**
   * Authenticate with a returning (already-paired) device.
   * Loads the stored public key, sends it as an AUTH_PACKET, waits for the
   * firmware's CHALLENGE, then derives the session AES key.
   * @returns {Promise<void>}
   * @throws {Error} 'NO_KEYS' if no stored keys found for this device
   */
  async pair() {
    if (!this.deviceMAC) throw new Error('Device not connected');
    if (this._pairingInProgress) return;
    this._pairingInProgress = true;

    try {
      const savedKeys = await this.sessionManager.loadKeys(this.deviceMAC);
      if (!savedKeys) {
        throw new Error('NO_KEYS');
      }

      // Send our stored public key so the firmware can look up the shared secret
      await this._sendAuthPacket(savedKeys.publicKey);

      // Wait for the firmware's CHALLENGE notification (contains sessionSalt)
      const sessionSalt = await this._waitForChallenge(30000);

      // Re-derive the session AES key from the stored shared secret + session salt
      const sharedSecret = this._base64ToArrayBuffer(savedKeys.secret);
      await this.sessionManager.deriveAESKey(sharedSecret, new Uint8Array(sessionSalt));

      this.authenticated = true;
      await this._setStatus(Status.READY);
      console.log('[BLEManager] Re-authenticated with known device');
    } catch (err) {
      if (err.message === 'PEER_UNKNOWN') {
        // Firmware has forgotten this device; wipe local keys so next connect
        // re-does the full pairing flow.
        console.warn('[BLEManager] PEER_UNKNOWN — clearing stored keys.');
        if (this.sessionManager.storageAdapter) {
          await this.sessionManager.storageAdapter.save(this.deviceMAC, 'SelfPublicKey', null).catch(() => {});
          await this.sessionManager.storageAdapter.save(this.deviceMAC, 'SharedSecret', null).catch(() => {});
        }
      }
      throw err;
    } finally {
      this._pairingInProgress = false;
    }
  }

  /**
   * Pair with a brand-new device.
   * Takes the firmware's compressed public key (base64, shown on the device),
   * performs the full ECDH exchange, saves keys, and completes authentication.
   * @param {string} peerKeyB64 - Base64-encoded compressed (33-byte) public key from firmware
   * @returns {Promise<void>}
   */
  async pairNewDevice(peerKeyB64) {
    if (!this.deviceMAC) throw new Error('Device not connected');
    if (this._pairingInProgress) throw new Error('Pairing already in progress');
    this._pairingInProgress = true;

    try {
      // Decompress the firmware's public key and import it for ECDH
      const compressedBytes = new Uint8Array(this._base64ToArrayBuffer(peerKeyB64));
      const peerUncompressed = this.sessionManager.decompressPublicKey(compressedBytes);
      await this.sessionManager.importPeerPublicKey(peerUncompressed);

      // Generate our own ephemeral key pair
      await this.sessionManager.generateKeyPair();

      // Derive shared secret via ECDH
      const sharedSecret = await this.sessionManager.deriveSharedSecret();

      // Persist keys so we can re-authenticate on reconnect
      await this.sessionManager.saveKeys(this.deviceMAC, sharedSecret);

      // Send our uncompressed public key (base64) to the firmware as AUTH_PACKET
      const pubKeyRaw = await this.sessionManager.getSelfPublicKeyRaw();
      const pubKeyB64 = this.sessionManager._arrayBufferToBase64(pubKeyRaw.buffer);
      await this._sendAuthPacket(pubKeyB64);

      // Wait for the firmware's CHALLENGE
      const sessionSalt = await this._waitForChallenge(30000);

      // Derive session AES key
      await this.sessionManager.deriveAESKey(sharedSecret, new Uint8Array(sessionSalt));

      this.authenticated = true;
      await this._setStatus(Status.READY);
      console.log('[BLEManager] New device paired successfully');
    } finally {
      this._pairingInProgress = false;
    }
  }

  /**
   * Send the client's public key to the firmware as an AUTH_PACKET.
   * @param {string} b64PublicKey - Base64-encoded uncompressed (65-byte) public key
   * @private
   */
  async _sendAuthPacket(b64PublicKey) {
    const packet = this.packetHandler.createUnencryptedPacket(b64PublicKey);
    await this.bleAdapter.writeCharacteristicWithoutResponse(this.packetChar, packet);
  }

  /**
   * Wait for the firmware to send a CHALLENGE (or PEER_UNKNOWN) notification.
   * Resolves with the sessionSalt Uint8Array, or rejects on timeout / PEER_UNKNOWN.
   * @param {number} timeoutMs
   * @returns {Promise<Uint8Array>}
   * @private
   */
  _waitForChallenge(timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeListener('challenge', onChallenge);
        this.removeListener('peerUnknown', onPeerUnknown);
        reject(new Error('Challenge timeout'));
      }, timeoutMs);

      const onChallenge = (salt) => {
        clearTimeout(timeout);
        this.removeListener('peerUnknown', onPeerUnknown);
        resolve(salt);
      };

      const onPeerUnknown = () => {
        clearTimeout(timeout);
        this.removeListener('challenge', onChallenge);
        reject(new Error('PEER_UNKNOWN'));
      };

      this.once('challenge', onChallenge);
      this.once('peerUnknown', onPeerUnknown);
    });
  }

  /**
   * Disconnect from the device.
   * @returns {Promise<void>}
   */
  async disconnect() {
    try {
      if (this.device) {
        await this.bleAdapter.disconnectDevice(this.device);
      }
      this.connected = false;
      this.device = null;
      await this._setStatus(Status.DISCONNECTED);
    } catch (err) {
      console.error('Disconnect failed:', err);
      this.emit('error', err);
    }
  }

  /**
   * Send a keyboard string (encrypted).
   * @param {string} text
   * @param {number} slowMode - Delay in ms between packets
   * @returns {Promise<void>}
   */
  async sendKeyboardString(text, slowMode = 0) {
    const packets = [this.packetHandler.createKeyboardString(text)];
    if (text.length > 100) {
      // For longer text, use stream
      return this.sendKeyboardStream(text, slowMode);
    }
    await this.sendEncryptedPackets(packets, slowMode);
  }

  /**
   * Send a keyboard stream (multiple string chunks).
   * @param {string} text
   * @param {number} slowMode
   * @returns {Promise<void>}
   */
  async sendKeyboardStream(text, slowMode = 0) {
    const packets = this.packetHandler.createKeyboardStream(text);
    await this.sendEncryptedPackets(packets, slowMode);
  }

  /**
   * Send a key combo such as "ctrl+c", "Meta+r", "Enter", "F5".
   * Builds the correct 8-byte HID report from HIDMap.
   * @param {string} combo - Key combo string
   * @param {number} slowMode - Delay in ms between BLE packets
   * @returns {Promise<void>}
   */
  async sendKeyCode(combo, slowMode = 0) {
    const { key, modifiers } = parseKeyCombo(combo);
    const keycodeBytes = this._buildKeycodeBytes(key, modifiers);
    const packet = this.packetHandler.createKeyboardKeycode(keycodeBytes);
    await this.sendEncryptedPackets([packet], slowMode);
  }

  /**
   * Build an 8-byte HID keycode report from a key name and modifier list.
   * Bytes 0-4: modifier HID codes; byte 5: main key HID code.
   * @param {string} key - Canonical key name (e.g. "Enter", "a")
   * @param {string[]} modifiers - Array of canonical modifier names
   * @returns {Uint8Array} 8-byte HID report
   * @private
   */
  _buildKeycodeBytes(key, modifiers) {
    const report = new Uint8Array(8);
    const modCodes = modifiers
      .map((m) => HIDMap[m] ?? 0)
      .filter((c) => c > 0);
    modCodes.slice(0, 5).forEach((code, i) => { report[i] = code; });
    report[5] = HIDMap[key] ?? key.charCodeAt(0);
    return report;
  }

  /**
   * Send a mouse command.
   * @param {number} x - X delta
   * @param {number} y - Y delta
   * @param {Object} options - { leftClick, rightClick, scrollDelta }
   * @returns {Promise<void>}
   */
  async sendMouseCommand(x = 0, y = 0, options = {}) {
    const { leftClick = false, rightClick = false, scrollDelta = 0 } = options;
    const packet = this.packetHandler.createMousePacket(x, y, leftClick, rightClick);
    if (scrollDelta !== 0) {
      // Mouse stream supports scroll
      const stream = this.packetHandler.createMouseStream([{ x, y }], leftClick, rightClick, scrollDelta);
      await this.sendEncryptedPackets([stream], 0);
    } else {
      await this.sendEncryptedPackets([packet], 0);
    }
  }

  /**
   * Send a media control command.
   * @param {number} code - HID consumer control code
   * @returns {Promise<void>}
   */
  async sendMediaControl(code) {
    const packet = this.packetHandler.createConsumerControl(code);
    await this.sendEncryptedPackets([packet], 0);
  }

  /**
   * Returns true if the device is BLE-connected AND authenticated (ready to send).
   */
  isConnected() {
    return this.connected && this.authenticated;
  }

  /**   * Send raw encrypted packets.
   * @param {Object[]} packets - Array of protobuf packet objects
   * @param {number} slowMode - Delay in ms between transmissions
   * @returns {Promise<void>}
   */
  async sendEncryptedPackets(packets, slowMode = 0) {
    if (!this.connected) {
      throw new Error('Not connected to device');
    }
    if (!this.authenticated) {
      throw new Error('Device not authenticated. Pair first.');
    }
    await this._sendEncryptedPackets(packets, slowMode);
  }



  /**
   * Internal: Check firmware version for compatibility.
   * @private
   */
  async _checkFirmwareVersion() {
    try {
      // Send an empty config packet or use device info to get version
      // Firmware version is expected to be >= 0.9.0
      // For now, assume compatibility; in production, parse from device response
      this.firmwareVersion = '0.9.0+';
    } catch (err) {
      console.warn('Could not determine firmware version:', err);
    }
  }

  /**
   * Internal: Send packets with encryption.
   * @private
   */
  async _sendEncryptedPackets(packets, slowMode = 0) {
    for (const packet of packets) {
      // Serialize the packet
      const serialized = this.packetHandler.serializePacket(packet, this.packetHandler.getEncryptedDataSchema());

      // Encrypt
      const encrypted = await this.sessionManager.encrypt(serialized);

      // Extract IV, ciphertext, tag
      const iv = encrypted.slice(0, 12);
      const ciphertext = encrypted.slice(12);
      const tag = ciphertext.slice(-16);

      // Create and serialize DataPacket via PacketHandler (uses DataPacketSchema)
      const dataPacketBinary = this.packetHandler.createDataPacket(
        iv,
        ciphertext.slice(0, -16),
        tag,
        slowMode > 0,
      );

      // Send to device
      await this.bleAdapter.writeCharacteristicWithoutResponse(this.packetChar, dataPacketBinary);

      // Add to semaphore queue
      this.packetsWaitingForSemaphore.push(dataPacketBinary.length);

      // Apply slowMode delay if needed
      if (slowMode > 0) {
        await new Promise((resolve) => setTimeout(resolve, slowMode));
      }
    }
  }

  /**
   * Internal: Subscribe to packet responses.
   * @private
   */
  async _subscribeToResponses() {
    // Responses come in via packet characteristic notifications
    // Parse response packets and emit 'response' event
  }

  /**
   * Internal: Get service from GATT with retries.
   * @private
   */
  async _getServiceWithRetry(gatt, uuid, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await this.bleAdapter.getPrimaryService(gatt, uuid);
      } catch (err) {
        if (i < maxRetries - 1) {
          console.warn(`Service retrieval failed (attempt ${i + 1}), retrying...`);
          await new Promise((resolve) => setTimeout(resolve, 500));
        } else {
          throw err;
        }
      }
    }
  }

  /**
   * Internal: Handle packet notifications.
   * @private
   */
  _onPacketNotification(data) {
    try {
      const bytes = new Uint8Array(data);
      const responseType = bytes[0];

      if (responseType === 0x00) {
        // Serial data
        const serialData = bytes.slice(1);
        const text = new TextDecoder().decode(serialData);
        this.emit('serialData', text);
      } else if (responseType === 0x01) {
        // Response packet
        const packet = this.packetHandler.parseResponsePacket(bytes.slice(1));
        this.emit('response', packet);
      }
    } catch (err) {
      console.error('Failed to parse notification:', err);
    }
  }

  /**
   * Internal: Handle semaphore/response characteristic notifications.
   * The firmware sends protobuf ResponsePacket messages on this characteristic.
   * @private
   */
  _onSemaphoreNotification(data) {
    try {
      const bytes = new Uint8Array(data);
      const response = this.packetHandler.parseResponsePacket(bytes);

      // ResponseType values from proto: KEEPALIVE=0, PEER_UNKNOWN=1, PEER_KNOWN=2, CHALLENGE=3, SERIAL_DATA=4
      if (response.responseType === 3) {
        // CHALLENGE: firmware derived AES key with sessionSalt — client must do the same
        const sessionSalt = response.challengeData; // Uint8Array (16 bytes)
        this.emit('challenge', sessionSalt);
      } else if (response.responseType === 1) {
        // PEER_UNKNOWN: firmware doesn't recognise our public key — need to re-pair
        console.warn('[BLEManager] PEER_UNKNOWN from firmware — re-pairing required');
        this.emit('peerUnknown');
      }
    } catch (err) {
      console.error('[BLEManager] Failed to parse response notification:', err);
    }
  }

  /**
   * Internal: Convert base64 to ArrayBuffer.
   * @private
   */
  _base64ToArrayBuffer(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
