import { useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import Keyboard from '../../../../components/Keyboard/Keyboard';
import KeyboardMouse from '../../../../components/inputComponents/keyboardMouse';
import { ConnectionStatus } from '../../../../context/BLEContext';
import { EncryptedData_PacketType } from '../../../../services/packetService/toothpacket/toothpacket_pb.js';
import type { EncryptedData } from '../../../../services/packetService/toothpacket/toothpacket_pb.js';
import { useMockLiveCaptureInput } from './useMockLiveCaptureInput';
import MockNavbar from './MockNavbar';
import type { MediaOverlayState } from './MediaOverlay';

interface Point {
    x: number;
    y: number;
}

interface LiveCaptureBoxProps {
    value: string;
    onValueChange: (next: string) => void;
    onCursorDelta: (dx: number, dy: number) => void;
    onRemoteClick: () => void;
    // The media HUD is shown on the paired device (box B), not here - this just reports
    // what would be shown.
    onMediaOverlay: (state: MediaOverlayState) => void;
}

// The consumer-control HID usage codes LeftButtonColumn sends (components/inputComponents/sharedComponents.tsx).
const CONTROL_CODE = {
    playPause: 0x00cd,
    volumeUp: 0x00e9,
    volumeDown: 0x00ea,
    next: 0x00b5,
    previous: 0x00b6,
};

// The Keyboard/KeyboardMouse/button-column components below are the real LiveCapture UI -
// only the transport is fake. A "connected" status is hardcoded purely for the visuals
// (no greyed-out buttons), and sendKeyboardShortcut/sendMouseReport are no-ops so nothing
// actually leaves the browser.
const SIMULATED_STATUS = ConnectionStatus.ready;
const noopSendKeyboardShortcut = (_keys: string[]) => {};
const noopSendMouseReport = (_leftClick: number, _rightClick: number, _scrollDelta?: number) => {};

export default function LiveCaptureBox({ value, onValueChange, onCursorDelta, onRemoteClick, onMediaOverlay }: LiveCaptureBoxProps) {
    const {
        inputRef,
        ctrlPressed,
        commandPassthrough,
        setCommandPassthrough,
        handleKeyDown,
        handleKeyUp,
        handlePaste,
        handleOnBeforeInput,
        handleCompositionStart,
        handleCompositionEnd,
        handleOnChange,
    } = useMockLiveCaptureInput(value, onValueChange);

    const [captureMouse, setCaptureMouse] = useState(true);
    const [jiggling, setJiggling] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    const [volumeLevel, setVolumeLevel] = useState(50);
    const [isPlaying, setIsPlaying] = useState(true);

    const mouseStartPos = useRef<Point | null>(null);
    const isMouseTracking = useRef(false);

    // The real sendEncrypted transport, replaced with a function that just reads the packet
    // it would have sent and reports a mock OS media HUD event instead - nothing is
    // transmitted. The HUD itself renders on the paired device (box B), not here.
    async function mockSendEncrypted(payload: unknown, _prefix?: number) {
        const packet = payload as EncryptedData | undefined;
        if (packet?.packetType !== EncryptedData_PacketType.CONSUMER_CONTROL) return;
        if (packet.packetData.case !== 'consumerControlPacket') return;

        const code = packet.packetData.value.code[0];
        switch (code) {
            case CONTROL_CODE.playPause:
                setIsPlaying(prev => {
                    const next = !prev;
                    onMediaOverlay({ type: 'playpause', playing: next });
                    return next;
                });
                break;
            case CONTROL_CODE.volumeUp:
                setVolumeLevel(prev => {
                    const next = Math.min(100, prev + 10);
                    onMediaOverlay({ type: 'volume', level: next });
                    return next;
                });
                break;
            case CONTROL_CODE.volumeDown:
                setVolumeLevel(prev => {
                    const next = Math.max(0, prev - 10);
                    onMediaOverlay({ type: 'volume', level: next });
                    return next;
                });
                break;
            case CONTROL_CODE.next:
                onMediaOverlay({ type: 'track', direction: 'next' });
                break;
            case CONTROL_CODE.previous:
                onMediaOverlay({ type: 'track', direction: 'prev' });
                break;
            default:
                break;
        }
    }

    // Recycled from LiveCapture.tsx's own onMouseDown/onPointerMove: relative-displacement
    // tracking gated by focus + capture + Ctrl-to-pause - just forwarded to the paired box
    // instead of a BLE mouse report.
    function onMouseDown(e: ReactMouseEvent<HTMLInputElement>) {
        if (!isFocused) return;
        mouseStartPos.current = { x: e.clientX, y: e.clientY };
        isMouseTracking.current = true;
        if (captureMouse) onRemoteClick();
    }

    function onMouseUp(_e: ReactMouseEvent<HTMLInputElement>) {
        // No remote mouse-up effect needed for this demo.
    }

    function onPointerCancel() {
        isMouseTracking.current = false;
        mouseStartPos.current = null;
    }

    function onPointerMove(e: ReactPointerEvent<HTMLInputElement>) {
        if (!isFocused || !captureMouse || ctrlPressed.current) {
            isMouseTracking.current = false;
            return;
        }

        if (!isMouseTracking.current) {
            mouseStartPos.current = { x: e.clientX, y: e.clientY };
            isMouseTracking.current = true;
            return;
        }

        const displacementX = e.clientX - mouseStartPos.current!.x;
        const displacementY = e.clientY - mouseStartPos.current!.y;
        mouseStartPos.current = { x: e.clientX, y: e.clientY };
        onCursorDelta(displacementX, displacementY);
    }

    function onWheel(e: ReactWheelEvent<HTMLInputElement>) {
        e.preventDefault();
    }

    return (
        <div className="flex-1 flex flex-col gap-2 min-w-0">
            <div className="flex items-center justify-between px-1 flex-shrink-0">
                <span className="font-body text-sm md:text-base text-text font-medium">Your Computer</span>
                <span className="font-body text-[10px] md:text-xs text-dust">Live Capture</span>
            </div>

            {/* Size container: the capture pad's hint text (material-tailwind h5s, a fixed 24px on
                large viewports) is resized off this box's width via cqw, so it scales with the demo
                instead of overflowing it. Scoped here so the real LiveCapture page is unaffected. */}
            <div
                className="relative w-full aspect-[16/10] rounded-lg [container-type:inline-size] [&_h5]:!text-[length:clamp(10px,1.9cqw,20px)] [&_h5]:!leading-snug border-2 border-text bg-background overflow-hidden"
                style={{
                    backgroundImage:
                        'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                    backgroundSize: '25px 25px',
                }}
            >
                <div className="absolute inset-0 flex flex-col">
                    <MockNavbar />

                    <div className="flex-1 flex flex-col p-3 min-h-0">
                        <Keyboard listenerRef={inputRef} deviceStatus={SIMULATED_STATUS} />

                        <KeyboardMouse
                            inputRef={inputRef}
                            handleKeyDown={handleKeyDown}
                            handleKeyUp={handleKeyUp}
                            handlePaste={handlePaste}
                            handleOnBeforeInput={handleOnBeforeInput}
                            handleCompositionStart={handleCompositionStart}
                            handleCompositionEnd={handleCompositionEnd}
                            handleOnChange={handleOnChange}
                            captureMouse={captureMouse}
                            setCaptureMouse={setCaptureMouse}
                            commandPassthrough={commandPassthrough}
                            setCommandPassthrough={setCommandPassthrough}
                            jiggling={jiggling}
                            setJiggling={setJiggling}
                            isFocused={isFocused}
                            setIsFocused={setIsFocused}
                            status={SIMULATED_STATUS}
                            sendEncrypted={mockSendEncrypted}
                            onMouseDown={onMouseDown}
                            onMouseUp={onMouseUp}
                            onPointerCancel={onPointerCancel}
                            onPointerMove={onPointerMove}
                            onWheel={onWheel}
                            ctrlPressed={ctrlPressed}
                            sendKeyboardShortcut={noopSendKeyboardShortcut}
                            sendMouseReport={noopSendMouseReport}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
