import { EventEmitter } from './EventEmitter.js';

/**
 * BLEManager orchestrates the entire BLE lifecycle:
 * - Device discovery and connection
 * - ECDH authentication handshake
 * - Encrypted packet transmission and reception
 * - Status management and event emission
 *
 * Compatible with any BLEAdapter implementation (Web-BLE, native, etc).
 * Emits events: 'status', 'device', 'disconnect', 'error', 'response', 'serialData'
 */

const ServiceUUID = '19b10000-e8f2-537e-4f6c-d104768a1214';
const PacketCharacteristicUUID = '6856e119-2c7b-455a-bf42-cf7ddd2c5907';
const SemaphoreCharacteristicUUID = '6856e119-2c7b-455a-bf42-cf7ddd2c5908';
const MACCharacteristicUUID = '19b10002-e8f2-537e-4f6c-d104768a1214';

// Status enum
export const Status = {
  DISCONNECTED: 0,
  READY: 1,
  CONNECTED: 2,
  UNSUPPORTED: 3,
  SCANNING: 4,
};

export class BLEManager extends EventEmitter {
  constructor(sessionManager, packetHandler, bleAdapter) {
    super();
    this.sessionManager = sessionManager;
    this.packetHandler = packetHandler;
    this.bleAdapter = bleAdapter;

    this.status = Status.DISCONNECTED;
    this.device = null;
    this.connected = false;
    this.packetsWaitingForSemaphore = [];
    this.responseTimeout = 30000; // 30 seconds
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
      this.emit('device', device);

      // Connect to GATT
      const gatt = await this.bleAdapter.connectGATT(device);

      // Get service
      const service = await this._getServiceWithRetry(gatt, ServiceUUID, 3);
      if (!service) {
        throw new Error(`Service ${ServiceUUID} not found`);
      }

      // Get characteristics
      this.packetChar = await this.bleAdapter.getCharacteristic(service, PacketCharacteristicUUID);
      this.semaphoreChar = await this.bleAdapter.getCharacteristic(service, SemaphoreCharacteristicUUID);
      this.macChar = await this.bleAdapter.getCharacteristic(service, MACCharacteristicUUID);

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

      // Set status to READY (awaiting firmware version check)
      await this._setStatus(Status.READY);

      // Perform authentication handshake
      await this._authenticateWithDevice(macAddr);

      // Check firmware version
      await this._checkFirmwareVersion();

      // Set final status to CONNECTED
      this.connected = true;
      await this._setStatus(Status.CONNECTED);

      // Subscribe to disconnect event
      if (options.onDisconnect) {
        this.bleAdapter.onDisconnect(device, () => {
          this.connected = false;
          this.emit('disconnect');
          options.onDisconnect();
        });
      }

      console.log('Connected to ToothPaste device');
    } catch (err) {
      console.error('Connection failed:', err);
      this.emit('error', err);
      await this._setStatus(Status.DISCONNECTED);
      throw err;
    }
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
   * Send a keycode (Alt, Shift, F1, etc).
   * @param {string} keycode
   * @returns {Promise<void>}
   */
  async sendKeyCode(keycode) {
    const packet = this.packetHandler.createKeyboardKeycode(keycode);
    await this.sendEncryptedPackets([packet], 0);
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
   * Send raw encrypted packets.
   * @param {Object[]} packets - Array of protobuf packet objects
   * @param {number} slowMode - Delay in ms between transmissions
   * @returns {Promise<void>}
   */
  async sendEncryptedPackets(packets, slowMode = 0) {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    await this._sendEncryptedPackets(packets, slowMode);
  }

  /**
   * Internal: Perform ECDH authentication with the device.
   * @private
   */
  async _authenticateWithDevice(macAddr) {
    try {
      // Check if we already have keys for this device
      const savedKeys = await this.sessionManager.loadKeys(macAddr);

      if (!savedKeys) {
        // New device: generate key pair and perform handshake
        await this.sessionManager.generateKeyPair();
        const selfPublicKey = await this.sessionManager.getSelfPublicKeyRaw();
        const selfCompressed = await this.sessionManager.compressPublicKey(this.sessionManager.keyPair.publicKey);

        // Send unencrypted handshake
        const handshakeData = Buffer.concat([Buffer.from([0x00]), Buffer.from(selfCompressed)]);
        await this.bleAdapter.writeCharacteristicWithoutResponse(this.packetChar, handshakeData);

        // Wait for peer public key
        const peerCompressed = await this._receiveHandshakeKey(30000);
        const peerUncompressed = this.sessionManager.decompressPublicKey(peerCompressed);
        await this.sessionManager.importPeerPublicKey(peerUncompressed);

        // Derive shared secret and AES key
        const sharedSecret = await this.sessionManager.deriveSharedSecret();
        await this.sessionManager.deriveAESKey(sharedSecret);

        // Save keys
        await this.sessionManager.saveKeys(macAddr, sharedSecret);
      } else {
        // Returning device: restore AES key
        const sharedSecretB64 = savedKeys.secret;
        const sharedSecret = this._base64ToArrayBuffer(sharedSecretB64);
        await this.sessionManager.deriveAESKey(sharedSecret);
      }
    } catch (err) {
      console.error('Authentication failed:', err);
      throw err;
    }
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

      // Create DataPacket
      const dataPacket = {
        iv: iv,
        encryptedData: ciphertext.slice(0, -16),
        tag: tag,
        slowMode: slowMode > 0,
      };

      // Serialize DataPacket (you'll need to add this to PacketHandler)
      // For now, manually construct it or use protobuf
      const dataPacketBinary = this._serializeDataPacket(dataPacket);

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
   * Internal: Receive handshake key (peer public key).
   * @private
   */
  async _receiveHandshakeKey(timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Handshake timeout')),
        timeoutMs
      );

      const onNotification = (data) => {
        clearTimeout(timeout);
        // Parse the peer public key from the notification
        const bytes = new Uint8Array(data);
        if (bytes[0] === 0x01) {
          // Response type 1 = peer public key
          resolve(bytes.slice(1)); // Return 33-byte compressed key
        } else {
          reject(new Error('Unexpected handshake response'));
        }
      };

      this.bleAdapter.startNotifications(this.packetChar, onNotification);
    });
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
   * Internal: Handle semaphore notifications.
   * @private
   */
  _onSemaphoreNotification(data) {
    const bytes = new Uint8Array(data);
    const count = bytes[0];

    // Semaphore indicates how many packets are buffered on device
    for (let i = 0; i < count; i++) {
      if (this.packetsWaitingForSemaphore.length > 0) {
        this.packetsWaitingForSemaphore.shift();
      }
    }
  }

  /**
   * Internal: Serialize a DataPacket structure.
   * @private
   */
  _serializeDataPacket(dataPacket) {
    // This is a simplified binary serialization
    // In production, use the protobuf DataPacket schema

    const { iv, encryptedData, tag, slowMode } = dataPacket;
    const slowModeBytes = slowMode ? 1 : 0;

    const size = 1 + 12 + encryptedData.length + 16 + 1; // type + iv + data + tag + slowmode
    const buffer = new Uint8Array(size);

    let offset = 0;
    buffer[offset++] = 0x00; // DataPacket type
    buffer.set(iv, offset);
    offset += 12;
    buffer.set(encryptedData, offset);
    offset += encryptedData.length;
    buffer.set(tag, offset);
    offset += 16;
    buffer[offset] = slowModeBytes;

    return buffer;
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
