import React, { useEffect, useRef, useState, useContext, useCallback, useMemo } from "react";

import { Button, Typography } from "@material-tailwind/react";
import { CursorArrowRaysIcon, CursorArrowRippleIcon, PowerIcon, ArrowUpOnSquareStackIcon, PlayPauseIcon, ChevronDoubleUpIcon, ChevronDoubleDownIcon, ForwardIcon, BackwardIcon, CommandLineIcon, LockOpenIcon, EllipsisVerticalIcon} from "@heroicons/react/24/outline";
import { BLEContext } from "../context/BLEContext";
import Keyboard from "../components/Keyboard/Keyboard";
import Touchpad from "../components/Touchpad/Touchpad";
import { useInputController } from "../services/LiveCaptureInput";
import { IconToggleButton, MediaToggleButton } from "../components/shared/buttons";

import { createConsumerControlPacket, createMouseJigglePacket } from "../services/PacketFunctions";
import { mouseHandler } from "../services/inputHandlers/mouseHandler";
import { keyboardHandler } from "../services/inputHandlers/keyboardHandler";

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
    const mobileInputRef = useRef(null); // Ref for mobile input

    // Contexts
    const { status, sendEncrypted } = useContext(BLEContext);

    // Mouse Vars
    const mouseStartPos = useRef(null);
    const isMouseTracking = useRef(false);
    const REPORT_INTERVAL_MS = 100;
    const [captureMouse, setCaptureMouse] = useState(false);

    // Touch Vars
    const touchStartPos = useRef(null);
    const isTouching = useRef(false);
    const lastTapTime = useRef(0);
    const lastTapPos = useRef(null);
    const DOUBLE_TAP_THRESHOLD = 300; // ms
    const DOUBLE_TAP_DISTANCE = 50; // pixels

    

    const displacementList = useRef([]);

    // Mouse polling logic - wrapped in useEffect to prevent memory leaks in React 19
    useEffect(() => {
        const intervalId = setInterval(() => {
            //if (captureMouse && (tDisplacement.current.x !== 0 || tDisplacement.current.y !== 0)) {
            if (displacementList.current.length > 0) {
                //sendMouseReport(tDisplacement.current.x, tDisplacement.current.y, false, false);
                sendMouseReport(false, false);
            }
        }, REPORT_INTERVAL_MS);

        return () => clearInterval(intervalId);
    }, [captureMouse, sendMouseReport]);

    // On click logic
    function onMouseDown(e) {
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

    function onMouseUp(e) {
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
    function onPointerMove(e) {
        if (!isFocused || !captureMouse) return; // Only capture when focused and enabled

        const rect = inputRef.current.getBoundingClientRect();
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
        const displacementX = e.clientX - mouseStartPos.current.x;
        const displacementY = e.clientY - mouseStartPos.current.y;
        displacementList.current.push({ x: displacementX, y: displacementY });
        
        // Update start position for next calculation
        mouseStartPos.current = { x: e.clientX, y: e.clientY };
    }


    function onWheel(e) {
        if (!isFocused || !captureMouse) return; // Only capture when focused and enabled  
        e.preventDefault(); // Prevent page scrolling

        var reportDelta  = -e.deltaY * 0.01; // Scale down the scroll delta
        mouseHandler.sendMouseScroll(reportDelta, sendEncrypted);
    }

    // Touch event handlers for mobile touchpad
    function onTouchStart(e) {
        const touch = e.touches[0];
        const currentTime = Date.now();
        const currentPos = { x: touch.clientX, y: touch.clientY };
        
        // Check if this is a double tap
        const timeSinceLastTap = currentTime - lastTapTime.current;
        const distanceFromLastTap = lastTapPos.current 
            ? Math.sqrt(
                Math.pow(currentPos.x - lastTapPos.current.x, 2) + 
                Math.pow(currentPos.y - lastTapPos.current.y, 2)
              )
            : Infinity;
        
        if (timeSinceLastTap < DOUBLE_TAP_THRESHOLD && distanceFromLastTap < DOUBLE_TAP_DISTANCE) {
            // Double tap detected - send left click
            if (captureMouse) {
                mouseHandler.sendMouseClick(1, 0, sendEncrypted); // Left click down
                setTimeout(() => mouseHandler.sendMouseClick(2, 0, sendEncrypted), 50); // Left click up
            }
            lastTapTime.current = 0; // Reset to prevent triple tap
        } else {
            // Normal tap - prepare for potential movement
            touchStartPos.current = currentPos;
            lastTapTime.current = currentTime;
            lastTapPos.current = currentPos;
        }
        
        isTouching.current = true;
    }

    function onTouchMove(e) {
        if (!captureMouse || !isTouching.current || !touchStartPos.current) return;
        e.preventDefault();

        const touch = e.touches[0];
        const displacementX = touch.clientX - touchStartPos.current.x;
        const displacementY = touch.clientY - touchStartPos.current.y;

        // Add displacement to list for batched reporting
        displacementList.current.push({ x: displacementX, y: displacementY });
        
        // Update position for next calculation
        touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    }

    function onTouchEnd(e) {
        isTouching.current = false;
        touchStartPos.current = null;
    }

    // Make a mouse packet and send it
    function sendMouseReport(LClick, RClick, scrollDelta=0) {
        const mouseFrames = displacementList.current.slice(0, 8);
        mouseHandler.sendMouseReport(mouseFrames, LClick, RClick, scrollDelta, sendEncrypted);
        displacementList.current = []; // reset list
    }

    // Helper function to send keyboard shortcuts
    function sendKeyboardShortcut(keySequence) {
        keyboardHandler.sendKeyboardShortcut(keySequence, sendEncrypted);
    }

    // Toggle capturing and sending mouse data
    function CaptureMouseButton() {
        const handleToggle = () => setCaptureMouse((prev) => !prev);

        return (
            <IconToggleButton
                title="Enable / Disable mouse capture"
                toggled={captureMouse}
                onClick={handleToggle}
                Icon={CursorArrowRaysIcon}
                hoverText="Enable / Disable mouse capture"
                connectionStatus={status}
            />
        );
    }

    // Toggle how pasting and other command shortcuts are handled
    function CommandPassthroughButton() {
        const handleToggle = () => setCommandPassthrough((prev) => !prev);
        return (
            <IconToggleButton
                title="Capture Shortcuts"
                toggled={commandPassthrough}
                onClick={handleToggle}
                Icon={ArrowUpOnSquareStackIcon}
                hoverText="Capture Shortcuts (e.g. Ctrl+V)"
                connectionStatus={status}
            />
        );
    }

    // Toggle how pasting and other command shortcuts are handled
    function MouseJiggleButton() {
        const handleToggle = () => {
            const mouseJigglePacket = createMouseJigglePacket(!jiggling);
            sendEncrypted(mouseJigglePacket);
            setJiggling((prev) => !prev);
        };

        return (
            <IconToggleButton
                title="Start / Stop Mouse Jiggling"
                toggled={jiggling}
                onClick={handleToggle}
                Icon={CursorArrowRippleIcon}
                hoverText="Start / Stop Mouse Jiggling"
                connectionStatus={status}
            />
        );
    }

    // Collapsible shortcuts menu
    function ShortcutsMenuButton() {
        const [isMenuOpen, setIsMenuOpen] = useState(false);
        const shortcuts = [
            { label: "Ctrl+A", keys: ["Control", "a"] },
            { label: "Ctrl+C", keys: ["Control", "c"] },
            { label: "Ctrl+V", keys: ["Control", "v"] },
            { label: "Ctrl+X", keys: ["Control", "x"] },
            { label: "Delete", keys: ["Delete"] },
            { label: "Ctrl+Z", keys: ["Control", "z"] },
            { label: "Ctrl+Y", keys: ["Control", "y"] },
            { label: "Ctrl+S", keys: ["Control", "s"] },
            { label: "Alt+Tab", keys: ["Alt", "Tab"] },
            { label: "Esc", keys: ["Escape"] },
            { label: "Ctrl+Alt+Del", keys: ["Control", "Alt", "Delete"] },
            { label: "Ctrl+Shift+Esc", keys: ["Control", "Shift", "Escape"] },
            { label: "Win+V", keys: ["Meta", "v"] },
            { label: "Win+Shift+S", keys: ["Meta", "Shift", "s"] },
            { label: "Enter", keys: ["Enter"] },
        ];

        return (
            <div className="relative">
                <IconToggleButton
                    title="Shortcuts Menu"
                    toggled={isMenuOpen}
                    onClick={() => setIsMenuOpen((prev) => !prev)}
                    Icon={EllipsisVerticalIcon}
                    hoverText="Shortcuts"
                    connectionStatus={status}
                />
                {isMenuOpen && (
                    <div className="absolute right-0 top-12 rounded-lg z-50 w-48 max-h-80 overflow-y-auto p-2 border-2 border-hover" style={{ scrollbarColor: "#555 transparent" }}>
                        <div className="flex flex-col gap-2">
                            {shortcuts.map((shortcut, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => {
                                        sendKeyboardShortcut(shortcut.keys);
                                        setIsMenuOpen(false);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm font-medium bg-shelf text-text rounded-lg border border-hover hover:bg-white hover:text-shelf transition-colors"
                                >
                                    {shortcut.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    function sendControlCode(controlCode, hold = false) {
        const arr = new ArrayBuffer(10);
        var view = new DataView(arr);

        // view.setUint8(0, 4); // first byte = flag
        view.setUint16(0, controlCode, true); // next two bytes = control code

        var controlPacket = createConsumerControlPacket(controlCode);
        sendEncrypted(controlPacket);

        if (!hold) {
            // If not holding, send a "key release" after a short delay
            const releaseArr = new ArrayBuffer(10);
            var releaseView = new DataView(releaseArr);
            releaseView.setUint8(0, 4); // first byte = flag
            releaseView.setUint16(1, 0, true); // next two bytes = control code
        }
    }   

    // Vertical dropdown with media control buttons (Play/Pause, Vol+, Vol-, Next, Prev)
    function LeftButtonColumn() {
        return (
            <div className="flex flex-col space-y-2">
                <div>
                    <MediaToggleButton
                        title="Play / Pause media"
                        onClick={() => {sendControlCode(0x00CD)}}
                        Icon={PlayPauseIcon}
                        expandDirection="right"
                        connectionStatus={status}
                        />
                </div>
                <div>
                    <MediaToggleButton
                        title="Volume Up"
                        onClick={() => {sendControlCode(0x00E9)}}
                        Icon={ChevronDoubleUpIcon}
                        expandDirection="right"
                        connectionStatus={status}
                        />
                </div>
                <div>
                    <MediaToggleButton
                        title="Volume Down"
                        onClick={() => {sendControlCode(0x00EA)}}
                        Icon={ChevronDoubleDownIcon}
                        expandDirection="right"
                        connectionStatus={status}
                        />
                </div>
                <div>
                    <MediaToggleButton
                        title="Next"
                        onClick={() => {sendControlCode(0x00B5)}}
                        Icon={ForwardIcon}
                        expandDirection="right"
                        connectionStatus={status}
                        />
                </div>
                <div>
                    <MediaToggleButton
                        title="Previous"
                        onClick={() => {sendControlCode(0x00B6)}}
                        Icon={BackwardIcon}
                        expandDirection="right"
                        connectionStatus={status}
                        />
                </div>
                <div>
                    <MediaToggleButton 
                        title="Press 'Power' button"
                        Icon={PowerIcon} 
                        onClick={() => sendControlCode(0x0030)}
                        expandDirection="right"
                        connectionStatus={status}
                    />
                </div>
            </div>
        );
    }

    // Vertical dropdown with media control buttons (Play/Pause, Vol+, Vol-, Next, Prev)
    function RightButtonColumn() {
        return (
            <div className="flex flex-col space-y-2">
                <div>
                    <CaptureMouseButton />
                </div>
                <div>
                    <CommandPassthroughButton />
                </div>
                <div>
                    <MouseJiggleButton />
                </div>
                <div>
                    <ShortcutsMenuButton />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col flex-1 w-full p-4 bg-background text-text">
            {/* <Typography type="h4" className="text-text">
                Send Keystrokes to the 'ToothPaste in real(ish) time
            </Typography> */}

            {/* <Typography type="h 5" className="text-hover">
                It just works.....
            </Typography> */}

            <div className="hidden md:block">
                <Keyboard listenerRef={inputRef} deviceStatus={status}></Keyboard>
            </div>

            {/* Mobile Input Area - Visible only on small screens */}
            <div className="md:hidden flex flex-row my-4 rounded-lg transition-all border border-hover min-h-12 bg-shelf focus-within:bg-background relative group">
                <Typography
                    type="h5"
                    className="flex items-center justify-center opacity-70 pointer-events-none select-none text-white p-4 whitespace-pre-wrap font-light absolute inset-0 z-0 group-focus-within:hidden"
                    aria-hidden="true"
                >
                    <div className="flex items-center gap-2">
                        Tap to focus keyboard
                        <CommandLineIcon className="h-6 w-6 text-white opacity-50"/>
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
                            mobileInputRef.current.value = "";
                        }}
                        // IME event handlers
                        onChange={(e) => {
                            handleOnChange(e);
                            mobileInputRef.current.value = "";
                        }}
                        className="absolute inset-0 opacity-0 cursor-text pointer-events-auto"
                    ></input>

                    {/* Event routing overlay div */}
                    <div
                        className="absolute inset-0 rounded-xl z-5 pointer-events-none"
                    />
                </div>

                {/* Autofill input for password managers */}
                {/* <div className="relative w-10 h-12 flex items-center justify-center border-l border-hover bg-hover focus-within:bg-background">
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
            <div className="hidden md:flex flex-col flex-1 my-4 rounded-xl transition-all border border-hover focus-within:border-shelf bg-shelf focus-within:bg-background relative group ">         
                <div className="absolute top-2 left-2 z-10">
                    <LeftButtonColumn />
                </div>
                
                <div className="absolute top-2 right-2 z-10">
                    <RightButtonColumn />
                </div>

                <Typography
                    type="h5"
                    className="flex items-center justify-center opacity-70 pointer-events-none select-none text-white p-4 whitespace-pre-wrap font-light absolute inset-0 z-0 group-focus-within:hidden"
                    aria-hidden="true"
                >
                    Click here to start sending keystrokes in real time (kinda...)
                </Typography>

                <Typography
                    type="h5"
                    className=" hidden group-focus-within:flex opacity-70 items-center justify-center pointer-events-none select-none text-white p-4 whitespace-pre-wrap font-light absolute inset-0 z-0 "
                    aria-hidden="true"
                >
                    Capturing inputs...
                </Typography>

                {/* Hidden input for event capture */}
                <input
                    id="live-capture-input"
                    ref={inputRef}
                    autoCapitalize="none"
                    type="text"
                    inputMode="text"
                    name="user_input"
                    autoComplete="off"
                    spellCheck="false"
                    data-lpignore="true"

                    // Focus handlers
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    // Keyboard event handlers
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyUp}
                    onPaste={handlePaste}
                    // Mouse event handlers
                    onMouseDown={onMouseDown}
                    onMouseUp={onMouseUp}
                    onPointerMove={onPointerMove}
                    onPointerCancel={onPointerCancel}
                    onBeforeInput={handleOnBeforeInput}
                    onWheel={onWheel}
                    onContextMenu={(e) => e.preventDefault()}
                    // IME event handlers
                    onChange={handleOnChange}
                    onCompositionStart={handleCompositionStart}
                    onCompositionUpdate={() => {}}
                    onCompositionEnd={handleCompositionEnd}
                    className="absolute inset-0 opacity-0 cursor-text pointer-events-auto"
                ></input>

                {/* Event routing overlay div */}
                <div
                    className="absolute inset-0 rounded-xl z-5 pointer-events-none"
                />
            </div>

            {/* Mobile Touchpad Layout - Visible only on small screens */}
            <Touchpad
                captureMouse={captureMouse}
                commandPassthrough={commandPassthrough}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onSendMouseClick={sendMouseReport}
                onSendKeyboardShortcut={sendKeyboardShortcut}
                leftButtonColumn={<LeftButtonColumn />}
                rightButtonColumn={<RightButtonColumn />}
                shortcuts={[
                    [
                        { label: "Ctrl+A", keys: ["Control", "a"] },
                        { label: "Ctrl+C", keys: ["Control", "c"] },
                        { label: "Ctrl+V", keys: ["Control", "v"] },
                        { label: "Ctrl+X", keys: ["Control", "x"] },
                        { label: "Delete", keys: ["Delete"] },
                    ],
                    [
                        { label: "Ctrl+Z", keys: ["Control", "z"] },
                        { label: "Ctrl+Y", keys: ["Control", "y"] },
                        { label: "Ctrl+S", keys: ["Control", "s"] },
                        { label: "Alt+Tab", keys: ["Alt", "Tab"] },
                        { label: "Esc", keys: ["Escape"] },
                    ],
                    [
                        { label: "Ctrl+Alt+Del", keys: ["Control", "Alt", "Delete"] },
                        { label: "Ctrl+Shift+Esc", keys: ["Control", "Shift", "Escape"] },
                        { label: "Win+V", keys: ["Meta", "v"] },
                        { label: "Win+Shift+S", keys: ["Meta", "Shift", "s"] },
                        { label: "Enter", keys: ["Enter"] },
                    ],
                ]}
            />
        </div>
    );
}
