import { createMouseStream } from '../packetService/packetFunctions';

/**
 * Mouse input handler service
 * Handles all mouse-related packet creation and sending
 * Pure backend logic - no UI updates
 */
export const mouseHandler = {
    /**
     * Send a mouse movement and click report
     * @param {Array} frames - Array of {x, y} displacement objects
     * @param {number} leftClick - Left click state (0, 1, or 2 for release)
     * @param {number} rightClick - Right click state (0, 1, or 2 for release)
     * @param {number} scrollDelta - Scroll wheel delta
     * @param {Function} sendEncrypted - Function to send encrypted packets
     */
    sendMouseReport(frames = [], leftClick = 0, rightClick = 0, scrollDelta = 0, sendEncrypted) {
        const mousePacket = createMouseStream(frames, leftClick, rightClick, scrollDelta);
        sendEncrypted(mousePacket);
    },

    /**
     * Send a single mouse click
     * @param {number} leftClick - Left click state
     * @param {number} rightClick - Right click state
     * @param {Function} sendEncrypted - Function to send encrypted packets
     */
    sendMouseClick(leftClick = 0, rightClick = 0, sendEncrypted) {
        this.sendMouseReport([], leftClick, rightClick, 0, sendEncrypted);
    },

    /**
     * Send mouse scroll event
     * @param {number} scrollDelta - Scroll delta value
     * @param {Function} sendEncrypted - Function to send encrypted packets
     */
    sendMouseScroll(scrollDelta = 0, sendEncrypted) {
        this.sendMouseReport([], 0, 0, scrollDelta, sendEncrypted);
    }
};
