import { useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import Keyboard from '../../../../components/Keyboard/Keyboard';
import KeyboardMouse from '../../../../components/inputComponents/keyboardMouse';
import { ConnectionStatus } from '../../../../context/BLEContext';
import { useMockLiveCaptureInput } from './useMockLiveCaptureInput';
import MockNavbar from './MockNavbar';

interface Point {
    x: number;
    y: number;
}

interface LiveCaptureBoxProps {
    value: string;
    onValueChange: (next: string) => void;
    onCursorDelta: (dx: number, dy: number) => void;
    onRemoteClick: () => void;
}

// The Keyboard/KeyboardMouse/button-column components below are the real LiveCapture UI -
// only the transport is fake. A "connected" status is hardcoded purely for the visuals
// (no greyed-out buttons), and these no-ops stand in for the real BLE send functions so
// nothing actually leaves the browser.
const SIMULATED_STATUS = ConnectionStatus.connected;
const noopSendEncrypted = async (_payload: unknown, _prefix?: number) => {};
const noopSendKeyboardShortcut = (_keys: string[]) => {};
const noopSendMouseReport = (_leftClick: number, _rightClick: number, _scrollDelta?: number) => {};

export default function LiveCaptureBox({ value, onValueChange, onCursorDelta, onRemoteClick }: LiveCaptureBoxProps) {
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

    const mouseStartPos = useRef<Point | null>(null);
    const isMouseTracking = useRef(false);

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

            <div
                className="relative w-full aspect-[16/10] max-h-[70vh] rounded-lg border border-dust bg-background overflow-hidden"
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
                            sendEncrypted={noopSendEncrypted}
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
