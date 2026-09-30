import { useEffect, useRef, useState, useContext } from "react";
import type { MouseEvent, PointerEvent, WheelEvent } from "react";

import { Typography } from "@material-tailwind/react";
import { CommandLineIcon } from "@heroicons/react/24/outline";
import { BLEContext } from "../context/BLEContext";
import Keyboard from "../components/Keyboard/Keyboard";
import Touchpad from "../components/inputComponents/touchpad";
import KeyboardMouse from "../components/inputComponents/keyboardMouse";
import { LeftButtonColumn, RightButtonColumn } from "../components/inputComponents/sharedComponents";
import { useInputController } from "../services/inputHandlers/liveCaptureHooks";

import { mouseHandler } from "../services/inputHandlers/mouseHandler";
import { keyboardHandler } from "../services/inputHandlers/keyboardHandler";

interface Point {
    x: number;
    y: number;
}

export default function LiveCapture() {
    // Input controller hooks
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
    } = useInputController();

    const [macMode, setMacMode] = useState(false); // Does WIN key send WIN or COMMAND key
    const [jiggling, setJiggling] = useState(false);
    const [isFocused, setIsFocused] = useState(false); // Track if input is focused
    const [isAutofillFocused, setIsAutofillFocused] = useState(false); // Track if autofill input is focused
    const mobileInputRef = useRef<HTMLInputElement | null>(null); // Ref for mobile input

    // Contexts
    const { status, sendEncrypted } = useContext(BLEContext)!;

    // Mouse Vars
    const mouseStartPos = useRef<Point | null>(null);
    const isMouseTracking = useRef(false);
    const REPORT_INTERVAL_MS = 100;
    const [captureMouse, setCaptureMouse] = useState(false);

    // Touch Vars
    const touchStartPos = useRef<Point | null>(null);
    const isTouching = useRef(false);
    const gestureStartPos = useRef<Point | null>(null); // Where the finger first landed
    const gestureStartTime = useRef(0);
    const gestureMoved = useRef(false); // Finger travelled past TAP_MOVE_TOLERANCE, so it's a drag
    const gestureMultiTouch = useRef(false); // A second finger joined, so it's a scroll
    const TAP_MAX_DURATION = 250; // ms - longer presses aren't taps
    const TAP_MOVE_TOLERANCE = 10; // pixels - finger jitter within this still counts as a tap



    const displacementList = useRef<Point[]>([]);

    // Mouse polling logic - wrapped in useEffect to prevent memory leaks in React 19
    useEffect(() => {
        const intervalId = setInterval(() => {
            //if (captureMouse && (tDisplacement.current.x !== 0 || tDisplacement.current.y !== 0)) {
            if (displacementList.current.length > 0) {
                //sendMouseReport(tDisplacement.current.x, tDisplacement.current.y, false, false);
                sendMouseReport(0, 0);
            }
        }, REPORT_INTERVAL_MS);

        return () => clearInterval(intervalId);
    }, [captureMouse, sendMouseReport]);

    // On click logic
    function onMouseDown(e: MouseEvent<HTMLInputElement>) {
        if (!isFocused) return; // Only capture when focused
        mouseStartPos.current = { x: e.clientX, y: e.clientY };
        isMouseTracking.current = true;

        if (captureMouse) {
            if (e.button == 0) mouseHandler.sendMouseClick(1, 0, sendEncrypted); // Send left click
            if (e.button == 2) {
                e.preventDefault();
                mouseHandler.sendMouseClick(0, 1, sendEncrypted);
            }
        }
    }

    function onMouseUp(e: MouseEvent<HTMLInputElement>) {
        if (!isFocused) return; // Only capture when focused
        if (e.button == 0) mouseHandler.sendMouseClick(2, 0, sendEncrypted); // Send left click
        if (e.button == 2) {
            e.preventDefault();
            mouseHandler.sendMouseClick(0, 2, sendEncrypted);
        }
    }

    function onPointerCancel() {
        isMouseTracking.current = false;
        mouseStartPos.current = null;
    }

    // When a pointer moves
    function onPointerMove(e: PointerEvent<HTMLInputElement>) {
        if (!isFocused || !captureMouse) return; // Only capture when focused and enabled

        const rect = inputRef.current!.getBoundingClientRect();
        const inside =
            e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;

        if (!inside || ctrlPressed.current) {
            isMouseTracking.current = false;
            return;
        }

        // If not tracking yet, start tracking
        if (!isMouseTracking.current) {
            mouseStartPos.current = { x: e.clientX, y: e.clientY };
            isMouseTracking.current = true;
            return;
        }

        // Calculate displacement and add to list
        const displacementX = e.clientX - mouseStartPos.current!.x;
        const displacementY = e.clientY - mouseStartPos.current!.y;
        displacementList.current.push({ x: displacementX, y: displacementY });

        // Update start position for next calculation
        mouseStartPos.current = { x: e.clientX, y: e.clientY };
    }


    function onWheel(e: WheelEvent<HTMLInputElement>) {
        if (!isFocused || !captureMouse) return; // Only capture when focused and enabled  
        e.preventDefault(); // Prevent page scrolling

        var reportDelta = -e.deltaY * 0.01; // Scale down the scroll delta
        mouseHandler.sendMouseScroll(reportDelta, sendEncrypted);
    }

    // Handle scroll from touch pinch gesture
    function onTouchScroll(scrollAmount: number) {
        if (!captureMouse) return;
        const reportDelta = scrollAmount * 0.01; // Scale touch scroll amount to report delta
        mouseHandler.sendMouseScroll(reportDelta, sendEncrypted);
    }

    // Touch event handlers for mobile touchpad.
    // Works like a laptop touchpad: each tap sends one click, so two quick taps reach the
    // host as a double click. A tap is one finger, lifted quickly, that barely moved.
    function onTouchStart(e: TouchEvent) {
        if (e.touches.length > 1) {
            gestureMultiTouch.current = true; // Second finger down: a scroll, never a tap
            return;
        }

        const touch = e.touches[0];
        const currentPos = { x: touch.clientX, y: touch.clientY };
        touchStartPos.current = currentPos;
        gestureStartPos.current = currentPos;
        gestureStartTime.current = Date.now();
        gestureMoved.current = false;
        gestureMultiTouch.current = false;
        isTouching.current = true;
    }

    function onTouchMove(e: TouchEvent) {
        if (!captureMouse || !isTouching.current || !touchStartPos.current) return;
        e.preventDefault();

        const touch = e.touches[0];

        // Hold the cursor still until the finger clearly leaves its landing spot, so jitter
        // during a tap doesn't nudge the cursor (which would also break double-click detection)
        if (!gestureMoved.current) {
            const distanceFromStart = Math.hypot(
                touch.clientX - gestureStartPos.current!.x,
                touch.clientY - gestureStartPos.current!.y
            );
            if (distanceFromStart < TAP_MOVE_TOLERANCE) return;
            gestureMoved.current = true;
        }

        // touchStartPos is still the landing spot on the first move past the tolerance,
        // so the held-back distance is sent here in one go
        const displacementX = touch.clientX - touchStartPos.current.x;
        const displacementY = touch.clientY - touchStartPos.current.y;

        // Add displacement to list for batched reporting
        displacementList.current.push({ x: displacementX, y: displacementY });

        // Update position for next calculation
        touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    }

    function onTouchEnd(e: TouchEvent) {
        if (e.touches.length > 0) return; // Wait until every finger is lifted

        const isTap =
            e.type === "touchend" && // A cancelled touch is never a tap
            isTouching.current &&
            !gestureMoved.current &&
            !gestureMultiTouch.current &&
            Date.now() - gestureStartTime.current <= TAP_MAX_DURATION;

        isTouching.current = false;
        touchStartPos.current = null;
        gestureStartPos.current = null;

        if (isTap && captureMouse) {
            mouseHandler.sendMouseClick(1, 0, sendEncrypted); // Left click down
            setTimeout(() => mouseHandler.sendMouseClick(2, 0, sendEncrypted), 50); // Left click up
        }
    }

    // Make a mouse packet and send it
    function sendMouseReport(LClick: number, RClick: number, scrollDelta = 0) {
        const mouseFrames = displacementList.current.slice(0, 8);
        mouseHandler.sendMouseReport(mouseFrames, LClick, RClick, scrollDelta, sendEncrypted);
        displacementList.current = []; // reset list
    }

    // Helper function to send keyboard shortcuts
    function sendKeyboardShortcut(keySequence: string[]) {
        keyboardHandler.sendKeyboardShortcut(keySequence, sendEncrypted);
    }

    return (
        <div className="flex flex-col flex-1 w-full p-0 md:p-4 bg-transparent text-text z-10">
            <div className="hidden xl:block">
                <Keyboard listenerRef={inputRef} deviceStatus={status}></Keyboard>
            </div>

            {/* Mobile Input Area - Visible only on small screens */}
            <div className="xl:hidden flex flex-row mt-4 mb-1 rounded-lg transition-all border border-ash min-h-12 bg-ink focus-within:bg-background relative group opacity-50">
                <Typography
                    type="h5"
                    className="flex items-center justify-center opacity-70 pointer-events-none select-none text-white p-4 whitespace-pre-wrap font-light absolute inset-0 z-0 group-focus-within:hidden"
                    aria-hidden="true"
                >
                    <div className="flex items-center gap-2">
                        Tap to focus keyboard
                        <CommandLineIcon className="h-6 w-6 text-white opacity-50" />
                    </div>
                </Typography>

                <Typography
                    type="h5"
                    className="hidden group-focus-within:flex opacity-70 items-center justify-center pointer-events-none select-none text-white p-4 whitespace-pre-wrap font-light absolute inset-0 z-0"
                    aria-hidden="true"
                >
                    {isAutofillFocused ? "Waiting for Password Manager..." : "Capturing inputs..."}
                </Typography>

                <div className="flex-1 flex flex-col justify-center items-center">
                    {/* Mobile input for keyboard capture */}
                    <input
                        id="mobile-capture-input"
                        autoCapitalize="none"
                        type="password"
                        inputMode="text"
                        name="user_input"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck="false"
                        ref={mobileInputRef}

                        // Focus handlers
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        // Keyboard event handlers
                        onKeyDown={(e) => {
                            // Default to backspace for unidentified keys to handle mobile keyboard quirks
                            handleKeyDown(e);
                            mobileInputRef.current!.value = "";
                        }}
                        // IME event handlers
                        onChange={(e) => {
                            handleOnChange(e);
                            mobileInputRef.current!.value = "";
                        }}
                        className="absolute inset-0 opacity-0 cursor-text pointer-events-auto"
                    ></input>

                    {/* Event routing overlay div */}
                    <div
                        className="absolute inset-0 rounded-xl z-5 pointer-events-none"
                    />
                </div>

                {/* Autofill input for password managers */}
                {/* <div className="relative w-10 h-12 flex items-center justify-center border-l border-ash bg-ash focus-within:bg-background">
                    <LockOpenIcon className="h-6 w-6 text-white opacity-50 absolute pointer-events-none z-0" />
                    <input
                        id="mobile-autofill-input"
                        type="password"
                        name="autofill_helper"
                        autoComplete="on"
                        spellCheck="false"

                        onFocus={() => setIsAutofillFocused(true)}
                        onBlur={() => setIsAutofillFocused(false)}
                        onKeyDown={handleKeyDown}
                        onKeyUp={handleKeyUp}
                        onPaste={handlePaste}
                        onBeforeInput={handleOnBeforeInput}
                        onChange={handleOnChange}
                        onCompositionStart={handleCompositionStart}
                        onCompositionEnd={handleCompositionEnd}
                        className="absolute inset-0 opacity-0 cursor-text pointer-events-auto"
                        placeholder=""
                    ></input>
                </div> */}
            </div>

            {/* Desktop Layout - Hidden on small screens */}
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
                status={status}
                sendEncrypted={sendEncrypted}
                onMouseDown={onMouseDown}
                onMouseUp={onMouseUp}
                onPointerCancel={onPointerCancel}
                onPointerMove={onPointerMove}
                onWheel={onWheel}
                ctrlPressed={ctrlPressed}
                sendKeyboardShortcut={sendKeyboardShortcut}
                sendMouseReport={sendMouseReport}
            />

            {/* Mobile Touchpad Layout - Visible only on small screens */}
            <Touchpad
                captureMouse={captureMouse}
                commandPassthrough={commandPassthrough}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onSendMouseClick={sendMouseReport}
                onSendKeyboardShortcut={sendKeyboardShortcut}
                onSendScroll={onTouchScroll}
                leftButtonColumn={<LeftButtonColumn status={status} sendEncrypted={sendEncrypted} />}
                rightButtonColumn={<RightButtonColumn
                    captureMouse={captureMouse}
                    setCaptureMouse={setCaptureMouse}
                    commandPassthrough={commandPassthrough}
                    setCommandPassthrough={setCommandPassthrough}
                    jiggling={jiggling}
                    setJiggling={setJiggling}
                    status={status}
                    sendEncrypted={sendEncrypted}
                    sendKeyboardShortcut={sendKeyboardShortcut}
                />}
            />
        </div>
    );
}
