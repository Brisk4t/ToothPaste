import { create, toBinary, fromBinary } from "@bufbuild/protobuf";
import * as ToothPacketPB from './toothpacket/toothpacket_pb.js';
import type { EncryptedData, ResponsePacket } from './toothpacket/toothpacket_pb.js';

export interface MouseFrameLike {
    x: number;
    y: number;
}

// Create an unencrypted DataPacket from an input string
export function createUnencryptedPacket(inputString: string): Uint8Array<ArrayBuffer> {
    const encoder = new TextEncoder();
    const textData = encoder.encode(inputString); // Encode the input string into a byte array

    // protobuf packets
    const unencryptedPacket = create(ToothPacketPB.DataPacketSchema, {});
    unencryptedPacket.encryptedData = textData;
    unencryptedPacket.packetID = 1;
    unencryptedPacket.slowMode = true;
    unencryptedPacket.packetNumber = 1;
    unencryptedPacket.dataLen = textData.length;
    unencryptedPacket.tag = new Uint8Array(16); // Empty tag for unencrypted packet
    unencryptedPacket.iv = new Uint8Array(12); // Empty IV for unencrypted packet

    return toBinary(ToothPacketPB.DataPacketSchema, unencryptedPacket);
}

// Return an EncryptedData packet containing a MousePacket
export function createMousePacket(x: number, y: number, leftClick = 0, rightClick = 0): EncryptedData {
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
export function createMouseStream(frames: MouseFrameLike[], leftClick = 0, rightClick = 0, scrollDelta = 0): EncryptedData {
    const mousePacket = create(ToothPacketPB.MousePacketSchema, {});

    for (const frame of frames) {
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
export function createKeyboardPacket(keyString: string): EncryptedData {

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

export function createKeyboardStream(keyStrings: string | string[]): EncryptedData[] {
    // Handle both single string and array of strings
    const fullString = Array.isArray(keyStrings) ? keyStrings.join('') : keyStrings;

    const packets: EncryptedData[] = [];
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
export function createKeyCodePacket(keycode: Uint8Array): EncryptedData {
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
export function createRenamePacket(newName: string): EncryptedData {
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
export function createConsumerControlPacket(code: number): EncryptedData {
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
export function createMouseJigglePacket(enable: boolean): EncryptedData {
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

export function unpackResponsePacket(responsePacketBytes: Uint8Array): ResponsePacket {
    // Deserialize the ResponsePacket from binary data
    return fromBinary(ToothPacketPB.ResponsePacketSchema, responsePacketBytes);
}
