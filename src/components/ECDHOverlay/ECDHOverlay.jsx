import React, { useState, useContext } from 'react';
import { ec as EC } from 'elliptic';
import { ECDHContext, arrayBufferToBase64, base64ToArrayBuffer } from '../../context/ECDHContext';
import { Button, Typography } from "@material-tailwind/react";
import { KeyIcon } from '@heroicons/react/24/outline';
import { BLEContext } from '../../context/BLEContext';

const ec = new EC('p256'); // secp256r1


const ECDHOverlay = ({ showOverlay, setShowOverlay }) => {
    const { generateECDHKeyPair, decompressKey, importPeerPublicKey, saveSelfKeys, deriveKey, savePeerPublicKey } = useContext(ECDHContext);
    const [keyInput, setkeyInput] = useState("");
    const [sharedSecret, setSharedSecret] = useState(null);
    const [error, setError] = useState(null);
    const [pkey, setpkey] = useState(null);
    const { device, pktCharacteristic, status, sendUnencrypted } = useContext(BLEContext);

    // Send the pkey variable as an unencrypted string over BLE
    const sendPublicKey = async () => {
        if (!pktCharacteristic || !pkey) return;

        try {
            sendUnencrypted(pkey);
        } catch (error) {
            console.error(error);
        }
    };

    const handleEnter =  (event) =>{
        if(keyInput.trim() === "")
            return;

        if (event.key === 'Enter'){
            computeSecret();
        }   
    }
    const computeSecret = async () => {
        try {
            setError(null);
             
            // Parse the Base64 compressed public key input into a Uint8Array
            const compressedBytes = new Uint8Array(base64ToArrayBuffer(keyInput.trim()));
            
            // If the compressed key is not 33 bytes, throw an error
            if (compressedBytes.length !== 33) {
                throw new Error('Compressed public key must be 33 bytes');
            }

            // Peer key functions
            const rawUncompressed = decompressKey(compressedBytes);  // Decompress the compressed public key to get the raw uncompressed key (65 bytes)
            const peerPublicKeyObject = await importPeerPublicKey(rawUncompressed); // Create a CryptoKey object from the uncompressed public key

            // Self functions
            const keys = await generateECDHKeyPair(); // Generate ECDH key pair
            const { privateKey, publicKey } = keys;

            // Save the uncompressed peer public key in the database as base64
            await crypto.subtle.exportKey('raw', peerPublicKeyObject).then((rawKey) => {
                savePeerPublicKey(rawKey, device.id);
            });

            // Compress our public key and turn it into Base64 to send to the peer
            const rawPublicKey = await crypto.subtle.exportKey('raw', publicKey);
            const b64SelfPublic = arrayBufferToBase64(rawPublicKey);

            // Store all keys in DB under WEB BLE device.id
            await saveSelfKeys(device.id); 
            setpkey(b64SelfPublic);


            await deriveKey(privateKey, peerPublicKeyObject); // Derive the shared secret using our private key and the peer's public key

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

                <h2>Pair Device</h2>
                <input
                    type="text"
                    placeholder="Enter compressed public key (base64)"
                    value={keyInput}
                    onChange={(e) => setkeyInput(e.target.value)}
                    onKeyDown={handleEnter}
                    className='w-full h-10 opacity-1 color-text bg-shelf rounded-md p-2 my-4 focus:outline-none focus:border-primary-hover focus:ring-1 focus:ring-primary-hover'
                />
                <Button
                    onClick={computeSecret}
                    disabled={keyInput.trim().length < 44 || !pktCharacteristic}
                    className='my-4 bg-primary text-text hover:bg-primary-hover focus:bg-primary-focus active:bg-primary-active flex items-center justify-center size-sm disabled:bg-hover'>

                    <KeyIcon className="h-7 w-7 mr-2" />

                    {/* Paste to Device */}
                    <Typography variant="h6" className="text-text font-sans normal-case font-semibold">Generate Shared Secret</Typography>
                </Button>
                <Button
                    onClick={sendPublicKey}
                    disabled={pkey === null}
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

