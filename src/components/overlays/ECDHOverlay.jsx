import React, { useState, useContext, useRef, useEffect } from 'react';
import { ECDHContext } from '../../context/ECDHContext';
import { Button, Typography, Spinner } from "@material-tailwind/react";
import { KeyIcon } from '@heroicons/react/24/outline';
import { BLEContext } from '../../context/BLEContext';

const ECDHOverlay = ({ onChangeOverlay }) => {
    const { processPeerKeyAndGenerateSharedSecret } = useContext(ECDHContext);
    const [keyInput, setkeyInput] = useState("");
    const [error, setError] = useState(null);
    const { device, pktCharacteristic, status, sendUnencrypted } = useContext(BLEContext);
    const keyRef = useRef(null);

    const [isLoading, setisLoading] = useState(false);

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Handle submit when user (or ToothPaste) presses Enter in the input field
    const handleSubmit =  (event) =>{
        if(keyInput.trim() === "")
            return;

        if (event.key === 'Enter'){
            computeSecret();
        }   
    }

    // Use the context function to handle entire key exchange
    // This function will generate the shared secret and send the public key to the device
    const computeSecret = async () => {
        try {
            setError(null);
            setisLoading(true);

            // Use the comprehensive context function
            const b64SelfPublic = await processPeerKeyAndGenerateSharedSecret(
                keyInput.trim(),
                device.macAddress
            );

            await sleep(2000); // Wait for 2 seconds after generating the shared secret
            await sendUnencrypted(b64SelfPublic);
            setisLoading(false);

        } catch (e) {
            setError('Error: ' + e.message);
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

                <Typography variant="h4" className="text-text font-header normal-case font-semibold">
                    <span className="text-gray-500">Pair Device - </span>
                    <span className="text-text">{device?.name ?? ""}</span>
                </Typography>
                            
                <input
                    type="password"
                    placeholder="Pairing Key"
                    value={keyInput}
                    onChange={(e) => setkeyInput(e.target.value)}
                    onKeyDown={handleSubmit}
                    className='w-full h-10 opacity-1 text-text bg-shelf border border-3 border-hover rounded-md p-2 my-4 font-body
                    focus:outline-none focus:border-primary focus:ring-primary-hover'
                />

                <Button
                    ref={keyRef}
                    onClick={computeSecret}
                    loading={isLoading.toString()}
                    disabled={keyInput.trim().length < 44 || !pktCharacteristic || isLoading}
                    className='w-full h-10 my-4 bg-primary text-text hover:bg-primary-hover focus:bg-primary-focus active:bg-primary-active flex items-center justify-center size-sm'>

                    <KeyIcon className={`h-7 w-7 mr-2  ${isLoading? "hidden":""}`} />
                    <Spinner className={`h-7 w-7 mr-2  ${isLoading? "":"hidden"}`} />

                    {/* Paste to Device */}
                    <Typography variant="h6" className={`font-header text-text normal-case font-semibold ${isLoading? "hidden":""}`}>Pair</Typography>
                </Button>


                <Typography variant="h6" className={`font-body text-text text-sm text-center my-2`}>
                        How to Pair your ToothPaste Device:
                </Typography>

                <div className="bg-hover rounded-lg p-4 my-2 gap-2 flex flex-col justify-center items-center">


                    <Typography variant="h6" className={`font-body text-text text-md text-center mb-2`}> 
                        1. Click the Pairing Key text input above to highlight it.
                    </Typography>

                    <Typography variant="h6" className={`font-body text-text text-md text-center`}>
                        2. Hold the Button on your ToothPaste for 10 seconds until the LED starts blinking.
                    </Typography>

                </div>

                <Typography variant="h6" className={`font-body text-primary text-sm text-center mt-2`}>     
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

