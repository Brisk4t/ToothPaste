import { createKeyboardStream, createKeyCodePacket } from '../PacketFunctions';
import { HIDMap } from './HIDMap';

/**
 * Keyboard input handler service
 * Handles all keyboard-related packet creation and sending
 * Pure backend logic - no UI updates
 */
export const keyboardHandler = {
    /**
     * Send keyboard string input
     * @param {string} input - Text to send
     * @param {Function} sendEncrypted - Function to send encrypted packets
     */
    sendKeyboardString(input, sendEncrypted) {
        const packets = createKeyboardStream(input);
        sendEncrypted(packets);
    },

    /**
     * Send keyboard key code with optional modifiers
     * @param {string} key - The key to send
     * @param {Array<string>} modifiers - Array of modifier keys (e.g., ['Control', 'Shift'])
     * @param {Function} sendEncrypted - Function to send encrypted packets
     */
    sendKeyCode(key, modifiers = [], sendEncrypted) {
        const keycode = new Uint8Array(8);

        // Add modifiers (up to 5) at indices 0-4
        if (Array.isArray(modifiers)) {
            for (let i = 0; i < Math.min(modifiers.length, 5); i++) {
                keycode[i] = HIDMap[modifiers[i]] || 0;
            }
        }

        // Add the key itself at index 5
        const keypress = HIDMap[key] || key;
        const keypressCode = typeof keypress === 'string' ? keypress.charCodeAt(0) : keypress;
        keycode[5] = keypressCode;

        // Only send if we have valid data
        const hasModifier = Array.isArray(modifiers) && modifiers.length > 0;
        if (hasModifier || HIDMap[key]) {
            const keyCodePacket = createKeyCodePacket(keycode);
            sendEncrypted(keyCodePacket);
            return true;
        }

        return false;
    },

    /**
     * Send special key (Backspace, Enter, Tab, Escape, etc.)
     * @param {string} specialKey - The special key name
     * @param {Array<string>} modifiers - Optional modifier keys
     * @param {Function} sendEncrypted - Function to send encrypted packets
     */
    sendSpecialKey(specialKey, modifiers = [], sendEncrypted) {
        return this.sendKeyCode(specialKey, modifiers, sendEncrypted);
    },

    /**
     * Send a keyboard shortcut (combination of keys)
     * @param {Array<string>} keySequence - Array of keys to send in sequence
     * @param {Function} sendEncrypted - Function to send encrypted packets
     */
    sendKeyboardShortcut(keySequence, sendEncrypted) {
        if (!Array.isArray(keySequence) || keySequence.length === 0) {
            return false;
        }

        // Separate modifiers from the main key
        const modifiers = [];
        const keys = [];

        for (const key of keySequence) {
            if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
                modifiers.push(key);
            } else {
                keys.push(key);
            }
        }

        // Send each key with the collected modifiers
        for (const key of keys) {
            this.sendKeyCode(key, modifiers, sendEncrypted);
        }

        return true;
    }
};
