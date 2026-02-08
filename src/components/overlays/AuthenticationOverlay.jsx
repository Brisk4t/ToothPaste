import React, { useState, useEffect, useRef } from 'react';
import { Button, Typography } from "@material-tailwind/react";
import { ShieldCheckIcon } from '@heroicons/react/24/outline';
import { registerWebAuthnCredential, authenticateWithWebAuthn, isAuthenticated, credentialsExist } from '../../services/EncryptedStorage';

const AuthenticationOverlay = ({ onAuthSuccess, onClose }) => {
    const [mode, setMode] = useState(null); // 'login' | 'register' | 'loading'
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [hasCredentials, setHasCredentials] = useState(false);
    const [hasChecked, setHasChecked] = useState(false);

    // Check if credentials exist on mount
    useEffect(() => {
        const checkCredentials = async () => {
            try {
                const exists = await credentialsExist();
                setHasCredentials(exists);
                setMode(exists ? 'login' : 'register');
                setHasChecked(true);
            } catch (e) {
                console.error("[AuthenticationOverlay] Error checking credentials:", e);
                setMode('register');
                setHasChecked(true);
            }
        };

        checkCredentials();
    }, []);

    // If already authenticated, auto-succeed
    useEffect(() => {
        if (hasChecked && isAuthenticated()) {
            onAuthSuccess();
        }
    }, [hasChecked, onAuthSuccess]);

    // Create a new passkey
    const handleRegister = async () => {
        try {
            setError(null);
            setIsLoading(true);
            console.log("[AuthenticationOverlay] Starting registration...");

            // Optionally prompt for display name
            const displayName = prompt("Enter a display name for your account:", "ToothPaste User");
            if (displayName === null) {
                // User cancelled
                console.log("[AuthenticationOverlay] User cancelled registration");
                setIsLoading(false);
                return;
            }

            // Make the call to the service function to handle WebAuthn registration
            await registerWebAuthnCredential(displayName || "ToothPaste User");
            
            // TODO: After registration, automatically authenticate to establish session

            handleLogin(); // Call the login function to authenticate immediately after registration
        } catch (e) {
            console.error("[AuthenticationOverlay] Registration error:", e);
            setError('Registration failed: ' + e.message);
            setIsLoading(false);
        }
    };

    // Authenticate with existing passkey
    const handleLogin = async () => {
        try {
            setError(null);
            setIsLoading(true);

            // Call the service function to handle WebAuthn authentication
            await authenticateWithWebAuthn();
            console.log("[AuthenticationOverlay] Authentication successful");
            setIsLoading(false);
            onAuthSuccess();
        } catch (e) {
            console.error("[AuthenticationOverlay] Authentication error:", e);
            setError('Authentication failed: ' + e.message);
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
                    {mode === 'login' ? 'Authenticate with Passkey' : 'Register Passkey'}
                </Typography>

                <Typography variant="h6" className="text-text text-sm text-center mb-6">
                    {mode === 'login' 
                        ? 'Use your registered security key or biometric to authenticate.'
                        : 'Register a security key or biometric passkey to secure your device keys.'}
                </Typography>

                <div className="bg-hover rounded-lg p-4 mb-6 w-full">
                    <Typography variant="h6" className="text-text text-md text-center">
                        {mode === 'login'
                            ? 'Click the button below and follow your device\'s authentication prompt.'
                            : 'Click the button below to register a new passkey with your device.'}
                    </Typography>
                </div>

                <Button
                    onClick={mode === 'login' ? handleLogin : handleRegister}
                    loading={isLoading.toString()}
                    disabled={isLoading}
                    className='w-full h-10 mb-4 bg-primary text-text hover:bg-primary-hover focus:bg-primary-focus active:bg-primary-active flex items-center justify-center size-sm'
                >
                    <ShieldCheckIcon className={`h-7 w-7 mr-2 ${isLoading ? "hidden" : ""}`} />
                    <Typography variant="h6" className={`text-text font-sans normal-case font-semibold ${isLoading ? "hidden" : ""}`}>
                        {mode === 'login' ? 'Authenticate' : 'Register'}
                    </Typography>
                </Button>

                {hasCredentials && mode === 'register' && (
                    <Button
                        onClick={() => setMode('login')}
                        variant="outlined"
                        className='w-full h-10 text-primary border-primary hover:bg-primary/10'
                    >
                        <Typography variant="h6" className="text-primary font-sans normal-case font-semibold">
                            Already have a passkey? Login
                        </Typography>
                    </Button>
                )}

                {mode === 'register' && !hasCredentials && (
                    <Typography variant="h6" className="text-primary text-sm text-center mt-4">
                        Your device keys will be encrypted and stored locally on your browser. No one else can access them without your passkey.
                    </Typography>
                )}

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
