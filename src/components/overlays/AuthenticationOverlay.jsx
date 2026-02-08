import React, { useState, useEffect } from 'react';
import { Button, Typography, Input } from "@material-tailwind/react";
import { ShieldCheckIcon } from '@heroicons/react/24/outline';
import { unlockWithPassword, unlockPasswordless, isUnlocked, getRequiredAuthMode } from '../../services/EncryptedStorage';

const AuthenticationOverlay = ({ onAuthSuccess, onClose }) => {
    const [mode, setMode] = useState(null); // 'choose' | 'password' | 'passwordless' | null (loading)
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [hasChecked, setHasChecked] = useState(false);

    // Determine required auth mode on mount
    useEffect(() => {
        const initAuthMode = async () => {
            const requiredMode = await getRequiredAuthMode();
            setMode(requiredMode);
            setHasChecked(true);  // Only mark as checked after auth mode is determined
        };
        initAuthMode();
    }, []);

    // If already unlocked, auto-succeed
    useEffect(() => {
        if (hasChecked && isUnlocked()) {
            onAuthSuccess();
        }
    }, [hasChecked, onAuthSuccess]);

    // Unlock with password
    const handlePasswordUnlock = async () => {
        try {
            if (!password.trim()) {
                setError('Please enter a password');
                return;
            }
            
            setError(null);
            setIsLoading(true);
            console.log("[AuthenticationOverlay] Starting password-based unlock...");

            await unlockWithPassword(password);
            console.log("[AuthenticationOverlay] Password-based unlock successful");
            setIsLoading(false);
            onAuthSuccess();
        } catch (e) {
            console.error("[AuthenticationOverlay] Password unlock error:", e);
            setError('Unlock failed: ' + e.message);
            setIsLoading(false);
        }
    };

    // Unlock passwordless (insecure mode)
    const handlePasswordlessUnlock = async () => {
        try {
            setError(null);
            setIsLoading(true);
            console.log("[AuthenticationOverlay] Starting passwordless unlock...");

            await unlockPasswordless();
            console.log("[AuthenticationOverlay] Passwordless unlock successful");
            setIsLoading(false);
            onAuthSuccess();
        } catch (e) {
            console.error("[AuthenticationOverlay] Passwordless unlock error:", e);
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

                {mode === 'choose' && (
                    <>
                        <Typography type="h4" className="text-text font-sans normal-case font-semibold text-center mb-4">
                            Unlock Storage
                        </Typography>

                        <Typography type="h6" className="text-text text-sm text-center mb-6">
                            Choose how you'd like to unlock your encrypted storage.
                        </Typography>

                        <Button
                            onClick={() => setMode('password')}
                            className='w-full h-10 mb-3 bg-primary text-text hover:bg-primary-hover focus:bg-primary-focus active:bg-primary-active flex items-center justify-center'
                        >
                            <Typography type="h6" className="text-text font-sans normal-case font-semibold">
                                Unlock with Password
                            </Typography>
                        </Button>

                        <Button
                            onClick={() => setMode('passwordless')}
                            className='w-full h-10 mb-3 text-primary border-2 border-primary hover:bg-primary/10 flex items-center justify-center rounded'
                        >
                            <Typography type="h6" className="text-primary font-sans normal-case font-semibold">
                                Unlock Passwordless (Dev Mode)
                            </Typography>
                        </Button>

                        <Typography type="h6" className="text-primary text-xs text-center mt-4">
                            Passwordless mode uses a hardcoded insecure key. Development only.
                        </Typography>
                    </>
                )}

                {mode === 'password' && (
                    <>
                        <Typography type="h4" className="text-text font-sans normal-case font-semibold text-center mb-4">
                            Enter Password
                        </Typography>

                        <Typography type="h6" className="text-text text-sm text-center mb-4">
                            Your password will be hashed with Argon2 to derive the encryption key.
                        </Typography>

                        <Input
                            type="password"
                            label="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handlePasswordUnlock()}
                            disabled={isLoading}
                            className="mb-4"
                        />

                        <Button
                            onClick={handlePasswordUnlock}
                            loading={isLoading.toString()}
                            disabled={isLoading || !password.trim()}
                            className='w-full h-10 mb-3 bg-primary text-text hover:bg-primary-hover focus:bg-primary-focus active:bg-primary-active flex items-center justify-center'
                        >
                            <ShieldCheckIcon className={`h-7 w-7 mr-2 ${isLoading ? "hidden" : ""}`} />
                            <Typography type="h6" className={`text-text font-sans normal-case font-semibold ${isLoading ? "hidden" : ""}`}>
                                Unlock
                            </Typography>
                        </Button>
                    </>
                )}

                {mode === 'passwordless' && (
                    <>
                        <Typography type="h4" className="text-text font-sans normal-case font-semibold text-center mb-4">
                            Unlock Passwordless
                        </Typography>

                        <div className="bg-orange-500/20 border border-orange-500 rounded-lg p-4 mb-4 w-full">
                            <Typography type="h6" className="text-orange-500 text-sm text-center font-semibold">
                                ⚠️ Development Mode Only
                            </Typography>
                            <Typography type="h6" className="text-orange-500 text-xs text-center mt-2">
                                This mode uses a hardcoded insecure key. Do not use in production.
                            </Typography>
                        </div>

                        <Button
                            onClick={handlePasswordlessUnlock}
                            loading={isLoading.toString()}
                            disabled={isLoading}
                            className='w-full h-10 mb-3 bg-primary text-text hover:bg-primary-hover focus:bg-primary-focus active:bg-primary-active flex items-center justify-center'
                        >
                            <ShieldCheckIcon className={`h-7 w-7 mr-2 ${isLoading ? "hidden" : ""}`} />
                            <Typography type="h6" className={`text-text font-sans normal-case font-semibold ${isLoading ? "hidden" : ""}`}>
                                Unlock
                            </Typography>
                        </Button>

                        <Button
                            onClick={() => setMode('choose')}
                            className='w-full h-10 text-primary border-2 border-primary hover:bg-primary/10 disabled:border-hover disabled:text-hover flex items-center justify-center rounded'
                            disabled={isLoading}
                        >
                            <Typography type="h6" className="text-primary font-sans normal-case font-semibold">
                                Back
                            </Typography>
                        </Button>
                    </>
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
