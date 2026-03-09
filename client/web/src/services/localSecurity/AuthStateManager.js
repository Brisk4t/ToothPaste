/**
 * AuthStateManager.js
 * 
 * Centralized state machine for authentication flow.
 * Manages 7 distinct states and ensures single source of truth.
 */

import { 
    verifyStorageConsistency, 
    getRequiredAuthMode, 
    isUnlocked, 
    resetStorageCompletely,
    StorageConsistency,
    RequiredAuthMode,
    AuthScheme
} from './EncryptedStorage';

export const AuthState = {
    UNINITIALIZED: 'uninitialized',
    LOADING: 'loading',
    FIRST_TIME: 'first_time',                    // Virgin state, need to choose auth mode
    AWAITING_PASSWORD: 'awaiting_password',      // Locked, need password
    AWAITING_PASSWORDLESS: 'awaiting_passwordless', // Locked, need to verify passwordless
    UNLOCKED: 'unlocked',                        // Ready to connect
    CORRUPTED: 'corrupted',                      // Storage mismatch, need recovery
};

class AuthStateManager {
    constructor() {
        this.state = AuthState.UNINITIALIZED;
        this.listeners = [];
    }

    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notifyListeners() {
        this.listeners.forEach(listener => listener(this.state));
    }

    async initialize() {
        console.log("[AuthStateManager] Initializing...");
        this.state = AuthState.LOADING;
        this.notifyListeners();

        try {
            // First check if already unlocked in this session
            if (isUnlocked()) {
                console.log("[AuthStateManager] Already unlocked in session");
                this.state = AuthState.UNLOCKED;
                this.notifyListeners();
                return;
            }

            // Check storage consistency
            const consistency = await verifyStorageConsistency();
            console.log("[AuthStateManager] Storage consistency:", consistency);

            if (consistency === StorageConsistency.CORRUPTED) {
                this.state = AuthState.CORRUPTED;
            } else if (consistency === StorageConsistency.EMPTY) {
                this.state = AuthState.FIRST_TIME;
            } else {
                // Storage is valid, check what auth mode is required
                const requiredMode = await getRequiredAuthMode();
                if (requiredMode === RequiredAuthMode.UNLOCKED) {
                    this.state = AuthState.UNLOCKED;
                } else if (requiredMode === RequiredAuthMode.PASSWORD) {
                    this.state = AuthState.AWAITING_PASSWORD;
                } else if (requiredMode === RequiredAuthMode.PASSWORDLESS) {
                    this.state = AuthState.AWAITING_PASSWORDLESS;
                } else {
                    // RequiredAuthMode.CHOOSE should not happen if consistency is valid
                    // but fallback to first time just in case
                    this.state = AuthState.FIRST_TIME;
                }
            }
        } catch (error) {
            console.error("[AuthStateManager] Init error:", error);
            this.state = AuthState.CORRUPTED;
        }

        this.notifyListeners();
    }

    setState(newState) {
        this.state = newState;
        this.notifyListeners();
    }

    getState() {
        return this.state;
    }

    async attemptRecoveryFromCorruption() {
        try {
            await resetStorageCompletely();
            this.state = AuthState.FIRST_TIME;
            this.notifyListeners();
        } catch (error) {
            console.error("[AuthStateManager] Recovery failed:", error);
            throw error;
        }
    }
}

export const authStateManager = new AuthStateManager();
