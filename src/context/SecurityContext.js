// ECDHComponent.js
import React, { useState } from 'react';
import { ec as EC } from 'elliptic';

const ec = new EC('p256'); // secp256r1

const decompressCompressedKey = (compressedBytes) => {
    const key = ec.keyFromPublic(compressedBytes, 'array');
    const pubPoint = key.getPublic();
    const x = pubPoint.getX().toArray('be', 32);
    const y = pubPoint.getY().toArray('be', 32);

    const uncompressed = new Uint8Array(65);
    uncompressed[0] = 0x04;
    uncompressed.set(x, 1);
    uncompressed.set(y, 33);
    return uncompressed.buffer;
};

const ECDHComponent = ({ showOverlay, setShowOverlay }) => {
    const [inputKey, setInputKey] = useState('');
    const [sharedSecret, setSharedSecret] = useState(null);
    const [error, setError] = useState(null);

    const generateECDHKeyPair = async () => {
        return await crypto.subtle.generateKey(
            {
                name: 'ECDH',
                namedCurve: 'P-256',
            },
            true,
            ['deriveKey', 'deriveBits']
        );
    };

    const importPeerPublicKey = async (rawKeyBuffer) => {
        return await crypto.subtle.importKey(
            'raw',
            rawKeyBuffer,
            {
                name: 'ECDH',
                namedCurve: 'P-256',
            },
            true,
            []
        );
    };

    const deriveSharedSecret = async (privateKey, publicKey) => {
        return await crypto.subtle.deriveBits(
            {
                name: 'ECDH',
                public: publicKey,
            },
            privateKey,
            256
        );
    };

    const handleSubmit = async () => {
        try {
            setError(null);
            const compressedBytes = Uint8Array.from(atob(inputKey.trim()), c => c.charCodeAt(0));

            if (compressedBytes.length !== 33) {
                throw new Error('Compressed public key must be 33 bytes');
            }

            const rawUncompressed = decompressCompressedKey(compressedBytes);
            const peerPublicKey = await importPeerPublicKey(rawUncompressed);
            const { privateKey } = await generateECDHKeyPair();
            const secretBuffer = await deriveSharedSecret(privateKey, peerPublicKey);

            const secretHex = Array.from(new Uint8Array(secretBuffer))
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('');

            setSharedSecret(secretHex);
        } catch (e) {
            setError('Error: ' + e.message);
            setSharedSecret(null);
        }
    };

    if (!showOverlay) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0,
            width: '100vw', height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
        }}>
            <div style={{
                background: 'var(--color-shelf)',
                padding: 20,
                borderRadius: 8,
                width: '90%',
                maxWidth: 500,
                boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                position: 'relative'
            }}>
                <button
                    onClick={() => setShowOverlay(false)}
                    style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        background: 'none',
                        border: 'none',
                        fontSize: 20,
                        cursor: 'pointer'
                    }}
                >
                    ×
                </button>

                <h2>ECDH Shared Secret (Compressed Public Key)</h2>
                <input
                    type="text"
                    placeholder="Enter compressed public key (hex)"
                    value={inputKey}
                    onChange={(e) => setInputKey(e.target.value)}
                    style={{ width: '100%', marginBottom: 10, color:'white', background:'var(--color-hover)'}}
                />
                <button style={{background: 'var(--color-primary)'}}onClick={handleSubmit}>Compute Shared Secret</button>
                {sharedSecret && (
                    <div style={{ marginTop: 20 }}>
                        <strong>Shared Secret:</strong>
                        <pre>{sharedSecret}</pre>
                    </div>
                )}
                {error && (
                    <div style={{ marginTop: 20, color: 'red' }}>
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ECDHComponent;
