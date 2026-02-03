import { create } from "@bufbuild/protobuf";
import * as ToothPacketPB from '../controllers/toothpacket/toothpacket_pb.js';
// import { EncryptedData, KeyboardPacket, MousePacket, RenamePacket, KeycodePacket, Frame, ConsumerControlPacket } from '../controllers/toothpacket/toothpacket_pb.js';

// Base class for all packets (optional, for shared logic)
export class Packet {
    static MAX_DATA_SIZE =  199; // Safe estimate for max gATT payload size - 38[IV+TAG] - 4[header] - protocol overhead

    constructor(id, payload, chunkNumber = 0, totalChunks = 1, slowMode = false) {
        this.id = id; // string or enum to identify packet type (0 = RESERVED, 1 = DATA, 2 = ACK, 3 = HANDSHAKE, 4=KEEPALIVE)
        this.payload = payload; // The data contents of the packet
        this.chunkNumber = chunkNumber; // Packet number
        this.totalChunks = totalChunks; // Total number of packets for message
        this.slowMode = slowMode;
    }

    serialize() {
        // Header (4 bytes)
        const header = new Uint8Array(4);
        header[0] = this.id; // Packet ID
        header[1] = this.slowMode; // Low WPM typing mode

        header[2] = this.chunkNumber; // Current packet number
        header[3] = this.totalChunks; // Total packets for message

        // Final serialized packet
        const combined = new Uint8Array(header.length + this.payload.length);
        combined.set(header);
        combined.set(this.payload, header.length);

        return combined;
    }
}

export class HandshakePacket extends Packet {
    constructor(deviceId, publicKey) {
        super("HandshakePacket");
        this.deviceId = deviceId;
        this.publicKey = publicKey;
    }

    static fromObject(obj) {
        return new HandshakePacket(obj.deviceId, obj.publicKey);
    }
}

// Return an EncryptedData packet containing a MousePacket
export function createMousePacket(x, y, leftClick = false, rightClick = false) {
    const frame = create(ToothPacketPB.FrameSchema, {});
    frame.x = Math.round(x);
    frame.y = Math.round(y);

    const mousePacket = create(ToothPacketPB.MousePacketSchema, {});
    
    mousePacket.frames = [frame];
    mousePacket.numFrames = 1;
    mousePacket.lClick = leftClick;
    mousePacket.rClick = rightClick;
    
    const encryptedPacket = create(ToothPacketPB.EncryptedDataSchema, {
        packetType: ToothPacketPB.EncryptedData_PacketType.MOUSE,
        packetData: {
        case: "mousePacket",
        value: mousePacket,
        },
    });

    return encryptedPacket
}

// Return an EncryptedData packet containing a MousePacket
export function createMouseStream(frames, leftClick = false, rightClick = false, scrollDelta = 0) {
    const mousePacket = create(ToothPacketPB.MousePacketSchema, {});
    
    for (let frame of frames) {
        const pbFrame = create(ToothPacketPB.FrameSchema, {});
        pbFrame.x = Math.round(frame.x);
        pbFrame.y = Math.round(frame.y);
        mousePacket.frames.push(pbFrame);
    }

    mousePacket.numFrames = frames.length;
    mousePacket.lClick = Number(leftClick);
    mousePacket.rClick = Number(rightClick);
    mousePacket.wheel = scrollDelta;

    const encryptedPacket = create(ToothPacketPB.EncryptedDataSchema, {
        packetType: ToothPacketPB.EncryptedData_PacketType.MOUSE,
        packetData: {
        case: "mousePacket",
        value: mousePacket,
        },
    });

    return encryptedPacket
}

// Return an EncryptedData packet containing a KeyboardPacket
export function createKeyboardPacket(keyString) {

    const keyboardPacket = create(ToothPacketPB.KeyboardPacketSchema, {});
    keyboardPacket.message = keyString;
    keyboardPacket.length = keyString.length;

    const encryptedPacket = create(ToothPacketPB.EncryptedDataSchema, {
        packetType: ToothPacketPB.EncryptedData_PacketType.KEYBOARD_STRING,
        packetData: {
        case: "keyboardPacket",
        value: keyboardPacket,
        },
    });


    return encryptedPacket
}

export function createKeyboardStream(keyStrings) {
    // Handle both single string and array of strings
    let fullString = Array.isArray(keyStrings) ? keyStrings.join('') : keyStrings;
    
    const packets = [];
    const chunkSize = 100; // Max characters per packet
    
    // Split string into chunks and create a packet for each
    for (let i = 0; i < fullString.length; i += chunkSize) {
        const chunk = fullString.substring(i, i + chunkSize);
        
        const keyboardPacket = create(ToothPacketPB.KeyboardPacketSchema, {});
        keyboardPacket.message = chunk;
        keyboardPacket.length = chunk.length;
        
        const encryptedPacket = create(ToothPacketPB.EncryptedDataSchema, {
            packetType: ToothPacketPB.EncryptedData_PacketType.KEYBOARD_STRING,
            packetData: {
                case: "keyboardPacket",
                value: keyboardPacket,
            },
        });
        
        packets.push(encryptedPacket);
    }
    
    return packets;
}

// Return an EncryptedData packet containing a KeycodePacket
export function createKeyCodePacket(keycode) {
    const keycodePacket = create(ToothPacketPB.KeycodePacketSchema, {});
    keycodePacket.code = keycode;
    keycodePacket.length = keycode.length;

    const encryptedPacket = create(ToothPacketPB.EncryptedDataSchema, {
        packetType: ToothPacketPB.EncryptedData_PacketType.KEYBOARD_KEYCODE,
        packetData: {
        case: "keycodePacket",
        value: keycodePacket,
        },
    });
    
    return encryptedPacket;
}

// Return an EncryptedData packet containing a RenamePacket
export function createRenamePacket(newName) {
    const renamePacket = create(ToothPacketPB.RenamePacketSchema, {});
    renamePacket.message = newName;
    renamePacket.length = newName.length;

    const encryptedPacket = create(ToothPacketPB.EncryptedDataSchema, {
        packetType: ToothPacketPB.EncryptedData_PacketType.RENAME,
        packetData: {
        case: "renamePacket",
        value: renamePacket,
        },
    });

    return encryptedPacket;
}

// Return an EncryptedData packet containing a RenamePacket
export function createConsumerControlPacket(code) {
    const controlPacket = create(ToothPacketPB.ConsumerControlPacketSchema, {});
    controlPacket.code.push(code);
    controlPacket.length = 1;

    const encryptedPacket = create(ToothPacketPB.EncryptedDataSchema, {
        packetType: ToothPacketPB.EncryptedData_PacketType.CONSUMER_CONTROL,
        packetData: {
        case: "consumerControlPacket",
        value: controlPacket,
        },
    });

    return encryptedPacket;
}

// Return an EncryptedData packet containing a MouseJigglePacket
export function createMouseJigglePacket(enable) {
    const jigglePacket = create(ToothPacketPB.MouseJigglePacketSchema, {});
    jigglePacket.enable = enable;

    const encryptedPacket = create(ToothPacketPB.EncryptedDataSchema, {
        packetType: ToothPacketPB.EncryptedData_PacketType.COMPOSITE,
        packetData: {
        case: "mouseJigglePacket",
        value: jigglePacket,
        },
    });

    return encryptedPacket;
}