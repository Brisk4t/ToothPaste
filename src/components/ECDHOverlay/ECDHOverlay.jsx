import React, { useState, useContext } from 'react';
import { ec as EC } from 'elliptic';
import { ECDHContext, arrayBufferToBase64 } from '../../context/ECDHContext';
import { Button, Typography } from "@material-tailwind/react";
import { KeyIcon} from '@heroicons/react/24/outline';
import { BLEContext } from '../../context/BLEContext';

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

const ECDHOverlay = ({ showOverlay, setShowOverlay }) => {
    const {generateKeyPair, encryptMessage, decompressKey, importPeerPublicKey, storeSelfKeys } = useContext(ECDHContext);
    const [inputKey, setInputKey] = useState('');
    const [sharedSecret, setSharedSecret] = useState(null);
    const [error, setError] = useState(null);
    const [pkey, setpkey] = useState(null);
    const {characteristic, status} = useContext(BLEContext);
    

    async function compressKey(pkey) {
    // Export raw uncompressed key (65 bytes): 0x04 || X (32 bytes) || Y (32 bytes)
    const rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', pkey));

    if (rawKey[0] !== 0x04 || rawKey.length !== 65) {
        throw new Error("Unexpected raw public key format");
    }

    const x = rawKey.slice(1, 33);       // bytes 1–32
    const y = rawKey.slice(33, 65);      // bytes 33–64

    const prefix = (y[y.length - 1] % 2 === 0) ? 0x02 : 0x03; // LSB of Y

    const compressed = new Uint8Array(33);
    compressed[0] = prefix;
    compressed.set(x, 1);

    return compressed;
}

    const sendPublicKey = async () => {
        if (!characteristic || !pkey) return;

        try {
            console.log("Public key", pkey)
            const encoder = new TextEncoder();
            const data = encoder.encode(pkey);
            await characteristic.writeValue(data);
        } 
        
        catch (error) {
            console.error(error);
        }
    };   

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

            const rawUncompressed = decompressKey(compressedBytes); // Decompress the base64 compressed key to a raw uncompressed key (65 bytes)
            const peerPublicKey = await importPeerPublicKey(rawUncompressed); // Import the key into a CryptoKey object
            const { privateKey, publicKey } = await generateECDHKeyPair().then(keys => storeSelfKeys(keys)); // Generate and save our ECDH key pair

            // Compress our public key and turn in into Base64 to send to the peer
            await crypto.subtle.exportKey('raw', publicKey).then((rawKey) => {
                    const b64Uncompressed = arrayBufferToBase64(rawKey);
                    setpkey(b64Uncompressed);
            });
            
            const secretBuffer = await deriveSharedSecret(privateKey, peerPublicKey); // Derive the shared secret using our private key and the peer's public key
            setSharedSecret(secretBuffer);
            
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
                    className='w-100 h-10 opacity-0'
                />
                <Button 
                    onClick={handleSubmit} 
                    disabled={null} 
                    className='my-4 bg-primary text-text hover:bg-primary-hover focus:bg-primary-focus active:bg-primary-active flex items-center justify-center size-sm disabled:bg-hover'>
                    
                    <KeyIcon className="h-7 w-7 mr-2" />
                    
                    {/* Paste to Device */}
                    <Typography variant="h6" className="text-text font-sans normal-case font-semibold">Generate Shared Secret</Typography>
                </Button>
                <Button 
                    onClick={sendPublicKey} 
                    disabled={pkey === null || sharedSecret === null} 
                    className='my-4 bg-primary text-text hover:bg-primary-hover focus:bg-primary-focus active:bg-primary-active flex items-center justify-center size-sm disabled:bg-hover'>
                    
                    <KeyIcon className="h-7 w-7 mr-2" />
                    
                    {/* Paste to Device */}
                    <Typography variant="h6" className="text-text font-sans normal-case font-semibold">Send Public Key</Typography>
                </Button>

                {sharedSecret && (
                    <div style={{ marginTop: 20 }}>
                        <strong>Shared Secret:</strong>
                        <pre>{sharedSecret}</pre>
                    </div>
                )}

                {pkey && (
                    <div style={{ marginTop: 20 }}>
                        <strong>Public Key:</strong>
                        <pre>{pkey}</pre>
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

export default ECDHOverlay;

