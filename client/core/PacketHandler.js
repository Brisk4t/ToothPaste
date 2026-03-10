/**
 * PacketHandler wraps protobuf operations for creating and parsing packets.
 * Uses dependency injection to accept protobuf schemas, keeping the core library
 * independent of protobuf imports.
 *
 * Usage:
 *   const handler = new PacketHandler(ToothPacketPB, { create, toBinary, fromBinary });
 *   const packet = handler.createKeyboardString('hello');
 */
export class PacketHandler {
  constructor(pbSchemas, pbFunctions) {
    // pbSchemas: The ToothPacketPB namespace
    // pbFunctions: { create, toBinary, fromBinary } from @bufbuild/protobuf
    this.pb = pbSchemas;
    this.pbFunctions = pbFunctions;
    if (!this.pb || !this.pbFunctions) {
      throw new Error('PacketHandler requires protobuf schemas and functions');
    }
  }

  // ===== Unencrypted Packets =====

  /**
   * Create an unencrypted data packet (used for initial auth/handshake).
   * @param {string} inputString - Text to send unencrypted
   * @returns {Uint8Array} Binary DataPacket
   */
  createUnencryptedPacket(inputString) {
    const encoder = new TextEncoder();
    const textData = encoder.encode(inputString);

    const unencryptedPacket = this.pbFunctions.create(this.pb.DataPacketSchema, {});
    unencryptedPacket.encryptedData = textData;
    unencryptedPacket.packetID = 1;
    unencryptedPacket.slowMode = true;
    unencryptedPacket.packetNumber = 1;
    unencryptedPacket.dataLen = textData.length;
    unencryptedPacket.tag = new Uint8Array(16); // Empty tag
    unencryptedPacket.iv = new Uint8Array(12); // Empty IV

    return this.pbFunctions.toBinary(this.pb.DataPacketSchema, unencryptedPacket);
  }

  // ===== Keyboard Packets =====

  /**
   * Create a keyboard string packet (single character or short string).
   * @param {string} keyString - Text to type
   * @returns {Object} EncryptedData packet (protobuf object, not binary)
   */
  createKeyboardString(keyString) {
    const keyboardPacket = this.pbFunctions.create(this.pb.KeyboardPacketSchema, {});
    keyboardPacket.message = keyString;
    keyboardPacket.length = keyString.length;

    return this.pbFunctions.create(this.pb.EncryptedDataSchema, {
      packetType: this.pb.EncryptedData_PacketType.KEYBOARD_STRING,
      packetData: {
        case: 'keyboardPacket',
        value: keyboardPacket,
      },
    });
  }

  /**
   * Create multiple keyboard packets for a longer string (chunked by 100 chars).
   * @param {string|string[]} keyStrings - Single string or array of strings
   * @returns {Object[]} Array of EncryptedData packets
   */
  createKeyboardStream(keyStrings) {
    const fullString = Array.isArray(keyStrings) ? keyStrings.join('') : keyStrings;
    const packets = [];
    const chunkSize = 100;

    for (let i = 0; i < fullString.length; i += chunkSize) {
      const chunk = fullString.substring(i, i + chunkSize);

      const keyboardPacket = this.pbFunctions.create(this.pb.KeyboardPacketSchema, {});
      keyboardPacket.message = chunk;
      keyboardPacket.length = chunk.length;

      const encryptedPacket = this.pbFunctions.create(this.pb.EncryptedDataSchema, {
        packetType: this.pb.EncryptedData_PacketType.KEYBOARD_STRING,
        packetData: {
          case: 'keyboardPacket',
          value: keyboardPacket,
        },
      });

      packets.push(encryptedPacket);
    }

    return packets;
  }

  /**
   * Create a keyboard keycode packet (Alt, Shift, F1, etc).
   * @param {string} keycode - Keycode string (e.g. "Return", "Escape")
   * @returns {Object} EncryptedData packet
   */
  createKeyboardKeycode(keycode) {
    const keycodePacket = this.pbFunctions.create(this.pb.KeycodePacketSchema, {});
    keycodePacket.code = keycode;
    keycodePacket.length = keycode.length;

    return this.pbFunctions.create(this.pb.EncryptedDataSchema, {
      packetType: this.pb.EncryptedData_PacketType.KEYBOARD_KEYCODE,
      packetData: {
        case: 'keycodePacket',
        value: keycodePacket,
      },
    });
  }

  // ===== Mouse Packets =====

  /**
   * Create a single mouse movement + click packet.
   * @param {number} x - X delta pixels
   * @param {number} y - Y delta pixels
   * @param {boolean} leftClick - Left button pressed
   * @param {boolean} rightClick - Right button pressed
   * @returns {Object} EncryptedData packet
   */
  createMousePacket(x, y, leftClick = false, rightClick = false) {
    const frame = this.pbFunctions.create(this.pb.FrameSchema, {});
    frame.x = Math.round(x);
    frame.y = Math.round(y);

    const mousePacket = this.pbFunctions.create(this.pb.MousePacketSchema, {});
    mousePacket.frames = [frame];
    mousePacket.numFrames = 1;
    mousePacket.lClick = leftClick ? 1 : 0;
    mousePacket.rClick = rightClick ? 1 : 0;

    return this.pbFunctions.create(this.pb.EncryptedDataSchema, {
      packetType: this.pb.EncryptedData_PacketType.MOUSE,
      packetData: {
        case: 'mousePacket',
        value: mousePacket,
      },
    });
  }

  /**
   * Create a mouse stream with multiple movement frames.
   * @param {Array<{x, y}>} frames - Array of mouse position deltas
   * @param {boolean} leftClick - Left button state
   * @param {boolean} rightClick - Right button state
   * @param {number} scrollDelta - Wheel scroll delta
   * @returns {Object} EncryptedData packet
   */
  createMouseStream(frames, leftClick = false, rightClick = false, scrollDelta = 0) {
    const mousePacket = this.pbFunctions.create(this.pb.MousePacketSchema, {});

    for (const frame of frames) {
      const pbFrame = this.pbFunctions.create(this.pb.FrameSchema, {});
      pbFrame.x = Math.round(frame.x);
      pbFrame.y = Math.round(frame.y);
      mousePacket.frames.push(pbFrame);
    }

    mousePacket.numFrames = frames.length;
    mousePacket.lClick = leftClick ? 1 : 0;
    mousePacket.rClick = rightClick ? 1 : 0;
    mousePacket.wheel = scrollDelta;

    return this.pbFunctions.create(this.pb.EncryptedDataSchema, {
      packetType: this.pb.EncryptedData_PacketType.MOUSE,
      packetData: {
        case: 'mousePacket',
        value: mousePacket,
      },
    });
  }

  // ===== Consumer Control (Media) Packets =====

  /**
   * Create a consumer control packet (Play/Pause, Volume, etc).
   * @param {number} code - HID consumer control code
   * @returns {Object} EncryptedData packet
   */
  createConsumerControl(code) {
    const controlPacket = this.pbFunctions.create(this.pb.ConsumerControlPacketSchema, {});
    controlPacket.code.push(code);
    controlPacket.length = 1;

    return this.pbFunctions.create(this.pb.EncryptedDataSchema, {
      packetType: this.pb.EncryptedData_PacketType.CONSUMER_CONTROL,
      packetData: {
        case: 'consumerControlPacket',
        value: controlPacket,
      },
    });
  }

  // ===== Other Packets =====

  /**
   * Create a rename packet (change device name).
   * @param {string} newName - New device name
   * @returns {Object} EncryptedData packet
   */
  createRename(newName) {
    const renamePacket = this.pbFunctions.create(this.pb.RenamePacketSchema, {});
    renamePacket.message = newName;
    renamePacket.length = newName.length;

    return this.pbFunctions.create(this.pb.EncryptedDataSchema, {
      packetType: this.pb.EncryptedData_PacketType.RENAME,
      packetData: {
        case: 'renamePacket',
        value: renamePacket,
      },
    });
  }

  /**
   * Create a mouse jiggle packet (keep screen awake).
   * @param {boolean} enable - Enable jiggle
   * @returns {Object} EncryptedData packet
   */
  createMouseJiggle(enable) {
    const jigglePacket = this.pbFunctions.create(this.pb.MouseJigglePacketSchema, {});
    jigglePacket.enable = enable;

    return this.pbFunctions.create(this.pb.EncryptedDataSchema, {
      packetType: this.pb.EncryptedData_PacketType.COMPOSITE,
      packetData: {
        case: 'mouseJigglePacket',
        value: jigglePacket,
      },
    });
  }

  // ===== Parsing =====

  /**
   * Deserialize a response packet from binary data.
   * @param {Uint8Array|ArrayBuffer} responseBytes - Binary response packet
   * @returns {Object} Deserialized ResponsePacket
   */
  parseResponsePacket(responseBytes) {
    const buf = responseBytes instanceof Uint8Array ? responseBytes : new Uint8Array(responseBytes);
    return this.pbFunctions.fromBinary(this.pb.ResponsePacketSchema, buf);
  }

  /**
   * Serialize a packet object to binary.
   * @param {Object} packet - Packet object (EncryptedData, DataPacket, etc)
   * @param {Object} schema - Protobuf schema (e.g., EncryptedDataSchema)
   * @returns {Uint8Array} Binary packet
   */
  serializePacket(packet, schema) {
    return this.pbFunctions.toBinary(schema, packet);
  }

  /**
   * Get the schema for EncryptedData packets (for custom serialization).
   * @returns {Object} EncryptedDataSchema
   */
  getEncryptedDataSchema() {
    return this.pb.EncryptedDataSchema;
  }

  /**
   * Create and serialize a DataPacket from encrypted components.
   * @param {Uint8Array} iv - 12-byte IV
   * @param {Uint8Array} encryptedData - Ciphertext
   * @param {Uint8Array} tag - 16-byte auth tag
   * @param {boolean} slowMode - Whether slow mode is enabled
   * @param {number} [packetNumber=1]
   * @param {number} [totalPackets=1]
   * @returns {Uint8Array} Binary DataPacket
   */
  createDataPacket(iv, encryptedData, tag, slowMode, packetNumber = 1, totalPackets = 1) {
    const packet = this.pbFunctions.create(this.pb.DataPacketSchema, {});
    packet.iv = iv;
    packet.encryptedData = encryptedData;
    packet.tag = tag;
    packet.slowMode = slowMode;
    packet.packetNumber = packetNumber;
    packet.totalPackets = totalPackets;
    packet.dataLen = encryptedData.length;
    return this.pbFunctions.toBinary(this.pb.DataPacketSchema, packet);
  }
}
