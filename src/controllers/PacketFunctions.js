import React, { createContext, useContext, useState } from "react";
import { toothpaste, DataPacket, EncryptedData, KeyboardPacket, MousePacket, RenamePacket, KeycodePacket, Frame, ConsumerControlPacket } from '../controllers/toothpacket/toothpacket_pb.js';

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
    const frame = new Frame();
    frame.setX(x);
    frame.setY(y);

    const mousePacket = new MousePacket();
    
    mousePacket.setFramesList([frame]);
    mousePacket.setNumFrames(1);
    mousePacket.setLClick(leftClick);
    mousePacket.setRClick(rightClick);


    const encryptedPacket = new EncryptedData();
    encryptedPacket.setPackettype(EncryptedData.PacketType.MOUSE);
    encryptedPacket.setMousepacket(mousePacket);

    return encryptedPacket
}

// Return an EncryptedData packet containing a MousePacket
export function createMouseStream(frames, leftClick = false, rightClick = false) {
    
    
    console.log("List of frames to create mouse packet:", frames);

    const mousePacket = new MousePacket();
    
    for (let frame of frames) {
        const pbFrame = new Frame();
        pbFrame.setX(Math.round(frame.x));
        pbFrame.setY(Math.round(frame.y));
        mousePacket.addFrames(pbFrame);
    }

    mousePacket.setNumFrames(frames.length);
    mousePacket.setLClick(Number(leftClick));
    mousePacket.setRClick(Number(rightClick));

    console.log("Creating mouse packet with frames:", mousePacket);

    const encryptedPacket = new EncryptedData();
    encryptedPacket.setPackettype(EncryptedData.PacketType.MOUSE);
    encryptedPacket.setMousepacket(mousePacket);

    return encryptedPacket
}

// Return an EncryptedData packet containing a KeyboardPacket
export function createKeyboardPacket(keyString) {

    // Chunk long keyString into manageable pieces 

    const keyboardPacket = new KeyboardPacket();
    keyboardPacket.setMessage(keyString);
    keyboardPacket.setLength(keyString.length);

    const encryptedPacket = new EncryptedData();
    encryptedPacket.setPackettype(EncryptedData.PacketType.KEYBOARD_STRING);
    encryptedPacket.setKeyboardpacket(keyboardPacket);

    return encryptedPacket
}

// Return an EncryptedData packet containing a KeycodePacket
export function createKeyCodePacket(keycode) {
    const keycodePacket = new KeycodePacket();
    keycodePacket.setCode(keycode);
    keycodePacket.setLength(keycode.length);

    const encryptedPacket = new EncryptedData();
    encryptedPacket.setPackettype(EncryptedData.PacketType.KEYBOARD_KEYCODE);
    encryptedPacket.setKeycodepacket(keycodePacket);

    return encryptedPacket
}

// Return an EncryptedData packet containing a RenamePacket
export function createRenamePacket(newName) {
    const renamePacket = new RenamePacket();
    renamePacket.setMessage(newName);
    renamePacket.setLength(newName.length);

    const encryptedPacket = new EncryptedData();
    encryptedPacket.setPackettype(EncryptedData.PacketType.RENAME);
    encryptedPacket.setRenamepacket(renamePacket);

    return encryptedPacket;
}

// Return an EncryptedData packet containing a RenamePacket
export function createConsumerControlPacket(code) {
    const controlPacket = new ConsumerControlPacket();
    controlPacket.addCode(code);
    controlPacket.setLength(1);

    const encryptedPacket = new EncryptedData();
    encryptedPacket.setPackettype(EncryptedData.PacketType.CONSUMER_CONTROL);
    encryptedPacket.setConsumercontrolpacket(controlPacket);

    return encryptedPacket;
}