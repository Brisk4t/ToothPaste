import React, { createContext, useContext, useState } from "react";

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

export class DataPacket extends Packet {
    constructor(payload, sequence) {
        super("DataPacket");
        this.payload = payload; // e.g., encrypted message
        this.sequence = sequence; // for ordering
    }

    static fromObject(obj) {
        return new DataPacket(obj.payload, obj.sequence);
    }
}
