import React, { useState, useContext, useRef, useEffect } from 'react';
import { Button, Typography, Spinner } from "@material-tailwind/react";
import { KeyIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { BLEContext, ConnectionStatus } from '../../context/BLEContext';

const ECDHOverlay = ({ onChangeOverlay }) => {
    const [keyInput, setkeyInput] = useState("");
    const [error, setError] = useState(null);
    const [capsLockEnabled, setCapsLockEnabled] = useState(false);
    const { device, pktCharacteristic, status, pairNewDevice } = useContext(BLEContext);
    const keyRef = useRef(null);

    const [isLoading, setisLoading] = useState(false);

    // Close overlay once authentication completes (status transitions to READY)
    useEffect(() => {
        if (status === ConnectionStatus.ready) {
            setisLoading(false);
            onChangeOverlay(null);
        }
    }, [status]);

    // Handle capslock detection
    const handleKeyDown = (event) => {
        handleSubmit(event);
    };

    const handleKeyUp = (event) => {
        // Check capslock on key up to detect toggle
        setCapsLockEnabled(event.getModifierState("CapsLock"));
    };

    const handleFocus = (event) => {
        // Check capslock on focus
        setCapsLockEnabled(event.getModifierState("CapsLock"));
    };

    const handleClick = (event) => {
        // Check capslock on click
        setCapsLockEnabled(event.getModifierState("CapsLock"));
    };

    // Handle submit when user (or ToothPaste) presses Enter in the input field
    const handleSubmit =  (event) =>{
        if(keyInput.trim() === "")
            return;

        if (event.key === 'Enter'){
            computeSecret();
        }   
    }

    // Use pairNewDevice from BLEManager via BLEContext.
    // It handles the full ECDH key exchange, key persistence, AUTH_PACKET,
    // CHALLENGE wait and AES key derivation. Status transitions to READY when done.
    const computeSecret = async () => {
        try {
            setError(null);
            setisLoading(true);
            await pairNewDevice(keyInput.trim());
            // isLoading clears via the status===READY useEffect above
        } catch (e) {
            setError('Error: ' + e.message);
            setisLoading(false);
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
        <div className="fixed inset-0 bg-ash/60 flex flex-col justify-center items-center z-[9999]" onClick={() => onChangeOverlay(null)}>
            <div className="bg-ink p-5 rounded-lg w-11/12 max-w-lg flex flex-col justify-center items-center shadow-lg relative" onClick={(e) => e.stopPropagation()}>
                {/* Close Button*/}
                <button
                    onClick={() => onChangeOverlay(null)}
                    className="absolute top-2.5 right-2.5 bg-transparent border-0 text-2xl cursor-pointer text-text"
                >
                ×
                </button>

                <Typography variant="h4" className="text-text font-header normal-case font-semibold">
                    <span className="text-dust">Pair Device - </span>
                    <span className="text-text">{device?.name ?? ""}</span>
                </Typography>
                            
                <input
                    ref={keyRef}
                    type="password"
                    placeholder="Pairing Key"
                    value={keyInput}
                    onChange={(e) => setkeyInput(e.target.value)}
                    onFocus={handleFocus}
                    onClick={handleClick}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyUp}
                    className='w-full h-10 opacity-1 text-text bg-ink border border-3 border-ash rounded-md p-2 my-4 font-body
                    focus:outline-none focus:border-primary focus:ring-primary-ash'
                />

                {capsLockEnabled && (
                    <div className="w-full bg-orange/20 border border-orange rounded-md p-3 mb-2 flex items-center gap-2">
                        <ExclamationTriangleIcon className="h-6 w-6 text-orange" />
                        <Typography variant="h6" className="text-orange text-sm">
                            Caps Lock is enabled - Please disable to continue.
                        </Typography>
                    </div>
                )}

                <Button
                    ref={keyRef}
                    onClick={computeSecret}
                    loading={isLoading.toString()}
                    disabled={keyInput.trim().length < 44 || !pktCharacteristic || isLoading || capsLockEnabled}
                    className='w-full h-10 my-4 bg-primary text-text hover:bg-primary-ash focus:bg-primary-focus active:bg-primary-active
                     border-none flex items-center justify-center size-sm'>

                    <KeyIcon className={`h-7 w-7 mr-2  ${isLoading? "hidden":""}`} />
                    <Spinner className={`h-7 w-7 mr-2  ${isLoading? "":"hidden"}`} />

                    {/* Paste to Device */}
                    <Typography variant="h6" className={`font-header text-text normal-case font-semibold ${isLoading? "hidden":""}`}>Pair</Typography>
                </Button>


                <Typography variant="h6" className={`text-text text-sm text-center my-2`}>
                        How to Pair your ToothPaste Device:
                </Typography>

                <div className="bg-ash rounded-lg p-4 my-2 gap-2 flex flex-col justify-center items-center">


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

