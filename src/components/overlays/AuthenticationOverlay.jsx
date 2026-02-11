import React, { useState, useEffect } from 'react';
import { Button, Typography, Input } from "@material-tailwind/react";
import { ShieldCheckIcon } from '@heroicons/react/24/outline';
import { unlockWithPassword, unlockPasswordless } from '../../services/localSecurity/EncryptedStorage';
import { authStateManager, AuthState } from '../../services/localSecurity/AuthStateManager';

const AuthenticationOverlay = ({ onAuthSuccess, onClose }) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [authState, setAuthState] = useState(null);

    // Subscribe to auth state changes and get current state
    useEffect(() => {
        // Set initial state from manager (it may have already initialized)
        const currentState = authStateManager.getState();
        setAuthState(currentState);
        console.log("[AuthenticationOverlay] Initial auth state:", currentState);

        // Subscribe to future changes
        const unsubscribe = authStateManager.subscribe((newState) => {
            console.log("[AuthenticationOverlay] Auth state changed to:", newState);
            setAuthState(newState);
        });

        return unsubscribe;
    }, []);

    const handlePasswordUnlock = async () => {
        if (!password.trim()) {
            setError('Please enter a password');
            return;
        }

        try {
            setError(null);
            setIsLoading(true);
            console.log("[AuthenticationOverlay] Attempting password unlock...");

            await unlockWithPassword(password);
            console.log("[AuthenticationOverlay] Password unlock successful");
            
            // Update state
            authStateManager.setState(AuthState.UNLOCKED);
            setPassword('');
            onAuthSuccess();
        } catch (e) {
            console.error("[AuthenticationOverlay] Password unlock error:", e);
            setError(e.message || 'Unlock failed');
            setIsLoading(false);
        }
    };

    const handlePasswordlessUnlock = async () => {
        try {
            setError(null);
            setIsLoading(true);
            console.log("[AuthenticationOverlay] Attempting passwordless unlock...");

            await unlockPasswordless();
            console.log("[AuthenticationOverlay] Passwordless unlock successful");
            
            // Update state
            authStateManager.setState(AuthState.UNLOCKED);
            onAuthSuccess();
        } catch (e) {
            console.error("[AuthenticationOverlay] Passwordless unlock error:", e);
            setError(e.message || 'Unlock failed');
            setIsLoading(false);
        }
    };

    const handleSetPasswordFirstTime = async () => {
        if (!password.trim()) {
            setError('Please enter a password');
            return;
        }

        try {
            setError(null);
            setIsLoading(true);
            console.log("[AuthenticationOverlay] Setting password for first time...");

            await unlockWithPassword(password);
            console.log("[AuthenticationOverlay] First-time password setup successful");
            
            // Update state
            authStateManager.setState(AuthState.UNLOCKED);
            setPassword('');
            onAuthSuccess();
        } catch (e) {
            console.error("[AuthenticationOverlay] First-time setup error:", e);
            setError(e.message || 'Setup failed');
            setIsLoading(false);
        }
    };

    const handleRecoverFromCorruption = async () => {
        try {
            setError(null);
            setIsLoading(true);
            console.log("[AuthenticationOverlay] Recovering from corruption...");

            await authStateManager.attemptRecoveryFromCorruption();
            setPassword('');
            setIsLoading(false);
        } catch (e) {
            console.error("[AuthenticationOverlay] Recovery error:", e);
            setError('Recovery failed: ' + e.message);
            setIsLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        try {
            setError(null);
            setIsLoading(true);
            console.log("[AuthenticationOverlay] Resetting all data...");

            await authStateManager.attemptRecoveryFromCorruption();
            setPassword('');
            setIsLoading(false);
        } catch (e) {
            console.error("[AuthenticationOverlay] Reset error:", e);
            setError('Reset failed: ' + e.message);
            setIsLoading(false);
        }
    };

    // Don't render until state is determined
    if (authState === null || authState === AuthState.LOADING) {
        return null;
    }

    // Don't render if already unlocked
    if (authState === AuthState.UNLOCKED) {
        return null;
    }

    return (
        <div className="fixed inset-0 bg-hover/60 flex flex-col justify-center items-center z-[9999]" onClick={onClose}>
            <div className="bg-shelf p-5 rounded-lg w-11/12 max-w-lg flex flex-col justify-center items-center shadow-lg relative" onClick={(e) => e.stopPropagation()}>
                {/* Close Button - only show if not corrupted */}
                {authState !== AuthState.CORRUPTED && (
                    <button
                        onClick={onClose}
                        className="absolute top-2.5 right-2.5 bg-transparent border-0 text-2xl cursor-pointer text-text"
                    >
                        ×
                    </button>
                )}

                {/* FIRST TIME SETUP */}
                {authState === AuthState.FIRST_TIME && (
                    <>
                        <Typography type="h4" className="text-text font-header normal-case font-semibold text-center mb-4">
                            Welcome to ToothPaste
                        </Typography>

                        <Typography type="h6" className="text-text text-sm text-center mb-6">
                            Choose how to secure your device.
                        </Typography>

                        <Typography type="h6" className="text-text text-xs text-center mb-3">
                            Set a password to encrypt your stored data:
                        </Typography>

                        <Input
                            type="password"
                            label="Create Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSetPasswordFirstTime()}
                            disabled={isLoading}
                            className="mb-4 text-text"
                        />

                        <Button
                            onClick={handleSetPasswordFirstTime}
                            loading={isLoading.toString()}
                            disabled={isLoading || !password.trim()}
                            className='w-full min-h-10 mb-3 bg-primary text-text hover:bg-primary-hover active:bg-primary-active flex flex-wrap items-center justify-center p-2'
                        >
                            <Typography type="h6" className={`text-text font-sans normal-case font-semibold ${isLoading ? "hidden" : ""}`}>
                                Set Password and Continue
                            </Typography>
                        </Button>

                        <Typography type="h6" className="text-text text-xs text-center mb-3 border-t border-hover pt-3 mt-3">
                            Or continue without a password:
                        </Typography>

                        <Button 
                            onClick={handlePasswordlessUnlock}
                            loading={isLoading.toString()}
                            disabled={isLoading}
                            className='w-full min-h-10 flex flex-wrap items-center justify-center bg-orange border-none p-2'
                        >
                            <Typography type="h6" className={`text-text normal-case font-semibold ${isLoading ? "hidden" : ""}`}>
                                Use Passwordless Mode
                            </Typography>
                        </Button>

                        <Typography type="h6" className="text-gray-500 text-xs font-normal text-center mt-4">
                            Passwordless mode is faster, but doesn't encrypt data on this device. 
                            Your data is still End-to-End encrypted when communicating with ToothPaste.
                        </Typography>
                    </>
                )}

                {/* AWAITING PASSWORD */}
                {authState === AuthState.AWAITING_PASSWORD && (
                    <>
                        <Typography type="h4" className="text-text font-header normal-case font-semibold text-center mb-4">
                            Unlock ToothPaste
                        </Typography>

                        <Typography type="h6" className="text-text text-sm font-normal text-center mb-4">
                            Your data is encrypted with a password. Enter it to continue.
                        </Typography>

                        <Input
                            type="password"
                            label="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handlePasswordUnlock()}
                            disabled={isLoading}
                            className="mb-4 text-text"
                        />

                        <Button
                            onClick={handlePasswordUnlock}
                            loading={isLoading.toString()}
                            disabled={isLoading || !password.trim()}
                            className='w-full min-h-10 mb-3 bg-primary text-text hover:bg-primary-hover active:bg-primary-active flex flex-wrap items-center justify-center p-2'
                        >
                            <Typography type="h6" className={`text-text font-sans normal-case font-semibold ${isLoading ? "hidden" : ""}`}>
                                Unlock
                            </Typography>
                        </Button>

                        <button
                            onClick={() => {
                                setPassword('');
                                setError(null);
                                handleForgotPassword();
                            }}
                            className="text-sm text-primary hover:text-primary-hover underline mt-2"
                            disabled={isLoading}
                        >
                            Forgot Password?
                        </button>
                    </>
                )}

                {/* AWAITING PASSWORDLESS */}
                {authState === AuthState.AWAITING_PASSWORDLESS && (
                    <>
                        <Typography type="h4" className="text-text font-header normal-case font-semibold text-center mb-4">
                            Unlock ToothPaste
                        </Typography>

                        <Typography type="h6" className="text-text text-sm font-normal text-center mb-6">
                            Using passwordless mode to access your device.
                        </Typography>

                        <Button
                            onClick={handlePasswordlessUnlock}
                            loading={isLoading.toString()}
                            disabled={isLoading}
                            className='w-full min-h-10 flex flex-wrap items-center justify-center bg-primary text-text hover:bg-primary-hover border-none p-2'
                        >
                            <Typography type="h6" className={`text-text normal-case font-semibold ${isLoading ? "hidden" : ""}`}>
                                Unlock
                            </Typography>
                        </Button>
                    </>
                )}

                {/* CORRUPTED STATE */}
                {authState === AuthState.CORRUPTED && (
                    <>
                        <div className="flex justify-center mb-4">
                            <ShieldCheckIcon className="h-12 w-12 text-orange" />
                        </div>

                        <Typography type="h4" className="text-orange font-header normal-case font-semibold text-center mb-4">
                            Browser Data Corrupted
                        </Typography>

                        <Typography type="h6" className="text-text text-sm font-normal text-center mb-6">
                            Your device data appears to be corrupted. This is likely due to browser storage being partially cleared. 
                            You'll need to set up ToothPaste again.
                        </Typography>

                        <Typography type="h6" className="text-gray-400 text-xs text-center mb-6 italic">
                            <span className="text-orange">Note:</span> This will forget all paired devices and saved data.
                        </Typography>

                        <Button
                            onClick={handleRecoverFromCorruption}
                            loading={isLoading.toString()}
                            disabled={isLoading}
                            className='w-full min-h-10 bg-primary text-text hover:bg-primary-hover active:bg-primary-active flex flex-wrap items-center justify-center p-2'
                        >
                            <Typography type="h6" className={`text-text normal-case font-semibold ${isLoading ? "hidden" : ""}`}>
                                Reset and Start Fresh
                            </Typography>
                        </Button>
                    </>
                )}

                {/* ERROR MESSAGE */}
                {error && (
                    <div className="mt-4 p-3 bg-red-500/20 border border-red-500 rounded-md text-red-500 w-full text-center">
                        <Typography type="h6" className="text-sm">
                            {error}
                        </Typography>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AuthenticationOverlay;
