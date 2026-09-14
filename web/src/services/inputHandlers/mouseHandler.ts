import { createMouseStream } from '../packetService/packetFunctions';

export interface MouseFrame {
    x: number;
    y: number;
}

export type SendEncrypted = (payload: unknown, prefix?: number) => void | Promise<void>;

/**
 * Mouse input handler service
 * Handles all mouse-related packet creation and sending
 * Pure backend logic - no UI updates
 */
export const mouseHandler = {
    /**
     * Send a mouse movement and click report
     */
    sendMouseReport(frames: MouseFrame[] = [], leftClick = 0, rightClick = 0, scrollDelta = 0, sendEncrypted: SendEncrypted) {
        // createMouseStream's JS signature infers leftClick/rightClick as boolean (from its
        // `= false` defaults), but every real caller here passes a numeric click state (0/1/2)
        // which it then coerces via Number(). Cast to bypass that mismatched inference without
        // changing the value passed through; revisit once packetFunctions.js is typed (Phase 2).
        const mousePacket = createMouseStream(frames, leftClick as unknown as boolean, rightClick as unknown as boolean, scrollDelta);
        sendEncrypted(mousePacket);
    },

    /**
     * Send a single mouse click
     */
    sendMouseClick(leftClick = 0, rightClick = 0, sendEncrypted: SendEncrypted) {
        this.sendMouseReport([], leftClick, rightClick, 0, sendEncrypted);
    },

    /**
     * Send mouse scroll event
     */
    sendMouseScroll(scrollDelta = 0, sendEncrypted: SendEncrypted) {
        this.sendMouseReport([], 0, 0, scrollDelta, sendEncrypted);
    }
};
