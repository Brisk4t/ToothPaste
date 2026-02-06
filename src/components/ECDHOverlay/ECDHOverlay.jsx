import React, { useState, useContext, useRef, useEffect } from 'react';
import { ec as EC } from 'elliptic';
import { ECDHContext, arrayBufferToBase64, base64ToArrayBuffer } from '../../context/ECDHContext';
import { Button, Typography } from "@material-tailwind/react";
import { KeyIcon } from '@heroicons/react/24/outline';
import { BLEContext } from '../../context/BLEContext';

const ec = new EC('p256'); // secp256r1


const ECDHOverlay = ({ onChangeOverlay }) => {
    const { generateECDHKeyPair, decompressKey, importPeerPublicKey, saveSelfKeys: saveKeys, deriveKey, savePeerPublicKey } = useContext(ECDHContext);
    const [keyInput, setkeyInput] = useState("");
    const [sharedSecret, setSharedSecret] = useState(null);
    const [error, setError] = useState(null);
    const [pkey, setpkey] = useState(null);
    const { device, pktCharacteristic, status, sendUnencrypted } = useContext(BLEContext);
    const keyRef = useRef(null);

    const [isLoading, setisLoading] = useState(false);

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    const handleSubmit =  (event) =>{
        if(keyInput.trim() === "")
            return;

        if (event.key === 'Enter'){
            computeSecret();
        }   
    }
    const computeSecret = async () => {
        try {
            setError(null);
            setisLoading(true);

            // Parse the Base64 compressed public key input into a Uint8Array
            const compressedBytes = new Uint8Array(base64ToArrayBuffer(keyInput.trim()));
            
            // If the compressed key is not 33 bytes, throw an error
            if (compressedBytes.length !== 33) {
                throw new Error('Compressed public key must be 33 bytes');
            }

            // Peer key functions
            const rawUncompressed = decompressKey(compressedBytes);  // Decompress the compressed public key to get the raw uncompressed key uint8array (65 bytes)
            const peerPublicKeyObject = await importPeerPublicKey(rawUncompressed); // Create a CryptoKey object from the uncompressed public key

            // Save the uncompressed peer public key in the database as base64 <MAC, PubKey>
            await crypto.subtle.exportKey('raw', peerPublicKeyObject).then((rawKey) => {
                savePeerPublicKey(rawKey, device.macAddress);
            });

            // Self functions
            const keys = await generateECDHKeyPair(); // Generate ECDH key pair
            const { _, publicKey } = keys;

            // Compress our public key and turn it into Base64 to send to the peer
            const rawPublicKey = await crypto.subtle.exportKey('raw', publicKey);
            const b64SelfPublic = arrayBufferToBase64(rawPublicKey);

            // Derive the shared secret + AES key
            await deriveKey(peerPublicKeyObject); // Derive the shared secret using our private key and the peer's public key

            // Store all keys in DB under WEB BLE device.macAddress
            await saveKeys(device.macAddress); 
            setpkey(b64SelfPublic);


            await sleep(2000); // Wait for 2 second after generating the shared secret
            await sendUnencrypted(b64SelfPublic);
            setisLoading(false);

        } catch (e) {
            setError('Error: ' + e.message);
            setSharedSecret(null);
        }
    };

    // Focus the input field when the overlay is shown
    useEffect(() => {
        keyRef.current?.focus();
    }, []); 

    // Close overlay if device disconnects
    useEffect(() => {
        if (!device) {
            onChangeOverlay(null);
        }
    }, [device, onChangeOverlay]); 

    return (
        <div className="fixed inset-0 bg-hover/60 flex flex-col justify-center items-center z-[9999]" onClick={() => onChangeOverlay(null)}>
            <div className="bg-shelf p-5 rounded-lg w-11/12 max-w-lg flex flex-col justify-center items-center shadow-lg relative" onClick={(e) => e.stopPropagation()}>
                {/* Close Button*/}
                <button
                    onClick={() => onChangeOverlay(null)}
                    className="absolute top-2.5 right-2.5 bg-transparent border-0 text-2xl cursor-pointer text-text"
                >
                ×
                </button>

                <Typography variant="h4" className="text-text font-sans normal-case font-semibold">
                    <span className="text-gray-500">Pair Device - </span>
                    <span className="text-text">{device?.name ?? ""}</span>
                </Typography>
                            
                <input
                    type="password"
                    placeholder="Pairing Key"
                    value={keyInput}
                    onChange={(e) => setkeyInput(e.target.value)}
                    onKeyDown={handleSubmit}
                    className='w-full h-10 opacity-1 color-text bg-shelf border border-3 border-hover rounded-md p-2 my-4 focus:outline-none focus:border-primary focus:ring-primary-hover'
                />

                <Button
                    ref={keyRef}
                    onClick={computeSecret}
                    loading={isLoading.toString()}
                    disabled={keyInput.trim().length < 44 || !pktCharacteristic || isLoading}
                    className='w-full h-10 my-4 bg-primary text-text hover:bg-primary-hover focus:bg-primary-focus active:bg-primary-active flex items-center justify-center size-sm'>

                    <KeyIcon className={`h-7 w-7 mr-2  ${isLoading? "hidden":""}`} />

                    {/* Paste to Device */}
                    <Typography variant="h6" className={`text-text font-sans normal-case font-semibold ${isLoading? "hidden":""}`}>Pair</Typography>
                </Button>


                <Typography variant="h6" className={`text-text text-sm text-center my-2`}>
                        How to Pair your ToothPaste Device:
                </Typography>

                <div className="bg-hover rounded-lg p-4 my-2">


                    <Typography variant="h6" className={`text-text text-md text-center mb-2`}> 
                        1. Click the Pairing Key text input above to highlight it.
                    </Typography>

                    <Typography variant="h6" className={`text-text text-md text-center`}>
                        2. Hold the Button on your ToothPaste for 10 seconds until the LED starts blinking.
                    </Typography>

                </div>

                <Typography variant="h6" className={`text-primary text-sm text-center mt-2`}>     
                    The device will input the pairing key into the text box, wait for it finish and the device will be paired.  
                </Typography>

                {error && (
                    <div className="mt-5 text-red-500">
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ECDHOverlay;

