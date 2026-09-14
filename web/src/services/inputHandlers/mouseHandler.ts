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
        const mousePacket = createMouseStream(frames, leftClick, rightClick, scrollDelta);
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
