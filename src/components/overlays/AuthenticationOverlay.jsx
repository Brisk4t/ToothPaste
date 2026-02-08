import React, { useState, useEffect } from 'react';
import { Button, Typography } from "@material-tailwind/react";
import { ShieldCheckIcon } from '@heroicons/react/24/outline';
import { unlock, isUnlocked } from '../../services/EncryptedStorage';

const AuthenticationOverlay = ({ onAuthSuccess, onClose }) => {
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [hasChecked, setHasChecked] = useState(false);

    // Check if already unlocked on mount
    useEffect(() => {
        setHasChecked(true);
    }, []);

    // If already unlocked, auto-succeed
    useEffect(() => {
        if (hasChecked && isUnlocked()) {
            onAuthSuccess();
        }
    }, [hasChecked, onAuthSuccess]);

    // Unlock storage
    const handleUnlock = async () => {
        try {
            setError(null);
            setIsLoading(true);
            console.log("[AuthenticationOverlay] Starting unlock...");

            await unlock();
            console.log("[AuthenticationOverlay] Unlock successful");
            setIsLoading(false);
            onAuthSuccess();
        } catch (e) {
            console.error("[AuthenticationOverlay] Unlock error:", e);
            setError('Unlock failed: ' + e.message);
            setIsLoading(false);
        }
    };

    if (!hasChecked) {
        return null;
    }

    return (
        <div className="fixed inset-0 bg-hover/60 flex flex-col justify-center items-center z-[9999]" onClick={onClose}>
            <div className="bg-shelf p-5 rounded-lg w-11/12 max-w-lg flex flex-col justify-center items-center shadow-lg relative" onClick={(e) => e.stopPropagation()}>
                {/* Close Button*/}
                <button
                    onClick={onClose}
                    className="absolute top-2.5 right-2.5 bg-transparent border-0 text-2xl cursor-pointer text-text"
                >
                    ×
                </button>

                <ShieldCheckIcon className="h-12 w-12 text-primary mb-4" />

                <Typography variant="h4" className="text-text font-sans normal-case font-semibold text-center mb-4">
                    Unlock Storage
                </Typography>

                <Typography variant="h6" className="text-text text-sm text-center mb-6">
                    Click the button below to unlock encrypted storage and access your device keys.
                </Typography>

                <div className="bg-hover rounded-lg p-4 mb-6 w-full">
                    <Typography variant="h6" className="text-text text-md text-center">
                        Your device keys are encrypted locally using an encryption key derived from a hardcoded insecure key (development only).
                    </Typography>
                </div>

                <Button
                    onClick={handleUnlock}
                    loading={isLoading.toString()}
                    disabled={isLoading}
                    className='w-full h-10 mb-4 bg-primary text-text hover:bg-primary-hover focus:bg-primary-focus active:bg-primary-active flex items-center justify-center size-sm'
                >
                    <ShieldCheckIcon className={`h-7 w-7 mr-2 ${isLoading ? "hidden" : ""}`} />
                    <Typography variant="h6" className={`text-text font-sans normal-case font-semibold ${isLoading ? "hidden" : ""}`}>
                        Unlock
                    </Typography>
                </Button>

                {error && (
                    <div className="mt-4 p-3 bg-red-500/20 border border-red-500 rounded-md text-red-500 w-full text-center">
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AuthenticationOverlay;
