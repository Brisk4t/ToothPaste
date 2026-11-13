import { describe, it, expect } from 'vitest';
import { ec as EC } from 'elliptic';
import { decompressKey, invertKeyCase } from './ECDHContext';

const ec = new EC('p256');

// Simulates what the device types when Caps Lock is left on: the base64
// pairing key arrives with every letter case-flipped.
const capsLockMangle = (base64: string): string =>
    base64.replace(/[a-zA-Z]/g, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()));

const base64Encode = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
const base64Decode = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'base64'));

function makePairingKey(): { compressedB64: string; uncompressed: Uint8Array } {
    const pair = ec.genKeyPair();
    const compressed = pair.getPublic().encodeCompressed('array') as number[];
    const pub = pair.getPublic();
    const uncompressed = new Uint8Array(65);
    uncompressed[0] = 0x04;
    uncompressed.set(pub.getX().toArray('be', 32), 1);
    uncompressed.set(pub.getY().toArray('be', 32), 33);
    return { compressedB64: base64Encode(new Uint8Array(compressed)), uncompressed };
}

describe('invertKeyCase', () => {
    it('flips letters while leaving digits and + / = untouched', () => {
        expect(invertKeyCase('AbC123+/=')).toBe('aBc123+/=');
    });

    it('is an involution', () => {
        const { compressedB64 } = makePairingKey();
        expect(invertKeyCase(invertKeyCase(compressedB64))).toBe(compressedB64);
    });
});

describe('Caps Lock key recovery', () => {
    it('rejects the mangled key and recovers it via case inversion', () => {
        const { compressedB64, uncompressed } = makePairingKey();
        const mangled = capsLockMangle(compressedB64);

        // A case-flipped key never decodes: valid compressed keys start with
        // 'A' (0x02/0x03 prefix), which flips to 'a' (invalid prefix 0x68).
        expect(() => decompressKey(base64Decode(mangled))).toThrow(/Unknown point format|invalid point/i);

        // The recovery path in processPeerKeyAndGenerateSharedSecret: invert
        // the case and decompress again — must yield the original key.
        const recovered = decompressKey(base64Decode(invertKeyCase(mangled)));
        expect(new Uint8Array(recovered)).toEqual(uncompressed);
    });

    it('still rejects a clean key mangled in a non-recoverable way', () => {
        const { compressedB64 } = makePairingKey();
        // Replacing the leading 'A' with 'B' yields a 0x04-prefix 33-byte
        // array (invalid at any case), so neither variant can decode.
        const corrupted = 'B' + compressedB64.slice(1);
        expect(() => decompressKey(base64Decode(corrupted))).toThrow(/Unknown point format/);
        expect(() => decompressKey(base64Decode(invertKeyCase(corrupted)))).toThrow(/Unknown point format/);
    });
});
