import { describe, it, expect } from "vitest";
import { toBinary, fromBinary } from "@bufbuild/protobuf";

import {
    unpackResponsePacket,
    supportsVerify,
    createVerifyPacket,
    isVersionCompatible,
    VERIFY_MIN_FIRMWARE_VERSION,
} from "./packetFunctions";
import * as ToothPacketPB from "./toothpacket/toothpacket_pb.js";

// Hand-encoded ResponsePacket wire bytes: field 1 (responseType) as varint,
// so any enum value — including ones this build doesn't know — can be decoded
function responseTypeBytes(value: number): Uint8Array {
    return new Uint8Array([0x08, value]);
}

describe("unpackResponsePacket with unknown responseType values", () => {
    it("decodes an unknown value (99) as a plain number without throwing", () => {
        const packet = unpackResponsePacket(responseTypeBytes(99));

        expect(packet.responseType).toBe(99);
        expect(typeof packet.responseType).toBe("number");
    });

    it("an unknown value does not equal any named enum member", () => {
        // This is the old-web + new-firmware compatibility guarantee: an enum
        // value the generated code doesn't know falls through every branch
        const packet = unpackResponsePacket(responseTypeBytes(99));
        const namedMembers = Object.values(
            ToothPacketPB.ResponsePacket_ResponseType
        ).filter((v): v is number => typeof v === "number");

        for (const member of namedMembers) {
            expect(packet.responseType === member).toBe(false);
        }
    });

    it("decodes DECRYPT_FAILED (4) and PONG (5)", () => {
        expect(ToothPacketPB.ResponsePacket_ResponseType.DECRYPT_FAILED).toBe(4);
        expect(ToothPacketPB.ResponsePacket_ResponseType.PONG).toBe(5);

        expect(unpackResponsePacket(responseTypeBytes(4)).responseType)
            .toBe(ToothPacketPB.ResponsePacket_ResponseType.DECRYPT_FAILED);
        expect(unpackResponsePacket(responseTypeBytes(5)).responseType)
            .toBe(ToothPacketPB.ResponsePacket_ResponseType.PONG);
    });

    it("still decodes the pre-existing values", () => {
        for (const [wire, named] of [
            [0, ToothPacketPB.ResponsePacket_ResponseType.KEEPALIVE],
            [1, ToothPacketPB.ResponsePacket_ResponseType.PEER_UNKNOWN],
            [2, ToothPacketPB.ResponsePacket_ResponseType.PEER_KNOWN],
            [3, ToothPacketPB.ResponsePacket_ResponseType.CHALLENGE],
        ] as const) {
            expect(unpackResponsePacket(responseTypeBytes(wire)).responseType).toBe(named);
        }
    });
});

describe("supportsVerify (VERIFY/PONG version gate)", () => {
    it("is false for firmware below 0.10.0 — old firmware never answers VERIFY", () => {
        expect(supportsVerify("0.9.0")).toBe(false);
        expect(supportsVerify("0.9.9")).toBe(false);
        expect(supportsVerify("0.8.2")).toBe(false);
    });

    it("is true for 0.10.0 and newer", () => {
        expect(supportsVerify(VERIFY_MIN_FIRMWARE_VERSION)).toBe(true);
        expect(supportsVerify("0.10.1")).toBe(true);
        expect(supportsVerify("0.11.0")).toBe(true);
        expect(supportsVerify("1.0.0")).toBe(true);
    });

    it("is false for malformed versions", () => {
        expect(supportsVerify("")).toBe(false);
        expect(supportsVerify("not-a-version")).toBe(false);
    });
});

describe("createVerifyPacket", () => {
    it("carries the nonce through an encode/decode round trip", () => {
        const nonce = crypto.getRandomValues(new Uint8Array(16));
        const packet = createVerifyPacket(nonce);

        expect(packet.packetData.case).toBe("verifyPacket");

        const decoded = fromBinary(
            ToothPacketPB.EncryptedDataSchema,
            toBinary(ToothPacketPB.EncryptedDataSchema, packet)
        );

        expect(decoded.packetData.case).toBe("verifyPacket");
        if (decoded.packetData.case !== "verifyPacket") {
            throw new Error(`expected verifyPacket, got ${decoded.packetData.case}`);
        }
        expect(Array.from(decoded.packetData.value.nonce)).toEqual(Array.from(nonce));
    });

    it("encodes small enough for the 253-byte BLE limit", () => {
        // EncryptedData plaintext + 12 B IV + 16 B GCM tag + DataPacket
        // overhead must stay well under the on-air limit
        const nonce = crypto.getRandomValues(new Uint8Array(16));
        const plaintext = toBinary(
            ToothPacketPB.EncryptedDataSchema,
            createVerifyPacket(nonce)
        );
        expect(plaintext.length).toBeLessThan(200);
    });
});

describe("isVersionCompatible (moved from BLEContext)", () => {
    it("supports caret ranges and exact matches as before", () => {
        expect(isVersionCompatible("0.9.0", ["0.9.0^"])).toBe(true);
        expect(isVersionCompatible("0.12.0", ["0.9.0^"])).toBe(true);
        expect(isVersionCompatible("0.8.0", ["0.9.0^"])).toBe(false);
        expect(isVersionCompatible("0.9.0", ["0.9.0"])).toBe(true);
    });
});
