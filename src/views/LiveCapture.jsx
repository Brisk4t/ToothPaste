import React, { useEffect, useRef, useState, useContext, useCallback } from "react";

import { Button, IconButton, Typography } from "@material-tailwind/react";
import { CursorArrowRaysIcon } from "@heroicons/react/24/outline";
import { ECDHContext } from "../context/ECDHContext";
import { BLEContext } from "../context/BLEContext";
import "../components/CustomTyping/CustomTyping.css"; // We'll define animations here
import Keyboard from "../components/Keyboard/Keyboard";

import { ReactComponent as AppleLogo } from "../assets/appleLogo.svg";
import { ReactComponent as WindowsLogo } from "../assets/windowsLogo.svg";

export default function LiveCapture() {
    const [buffer, setBuffer] = useState(""); // Holds the full input to render (not needed for current implementation)
    const bufferRef = useRef(""); // Tracks the current input buffer
    const lastSentBuffer = useRef(""); // tracks last sent buffer
    const inputRef = useRef(null);

    const [macMode, setMacMode] = useState(false); // Does WIN key send WIN or COMMAND key

    const debounceTimeout = useRef(null); // Holds the promise to send the buffer data after DEBOUNCE_INTERVAL_MS
    const specialEvents = useRef([]); // store special keys pressed but not modifying buffer

    // Contexts
    const { pktCharacteristic, status, readyToReceive, sendEncrypted } = useContext(BLEContext);
    const { createEncryptedPackets } = useContext(ECDHContext);
    const DEBOUNCE_INTERVAL_MS = 50;

    // Mouse Vars
    const lastPos = useRef({ x: 0, y: 0 });
    const isTracking = useRef(true);
    const ctrlPressed = useRef(false);
    const lastReportTime = useRef(0);
    const REPORT_INTERVAL_MS = 200;
    const [captureMouse, setCaptureMouse] = useState(false);

    // On click logic
    function onPointerDown(e) {
        e.target.setPointerCapture(e.pointerId);
        isTracking.current = true;
        lastPos.current = { x: e.clientX, y: e.clientY };
    }

    function onPointerUp(e) {
        // isTracking.current = false;
    }

    function onPointerCancel() {
        isTracking.current = false;
    }

    // When a pointer enters the div
    function onPointerEnter(e) {
        const rect = inputRef.current.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
            lastPos.current = { x: e.clientX, y: e.clientY };
            isTracking.current = true;
        }
    }

    // When a pointer moves
    function onPointerMove(e) {
        if (!captureMouse) return;

        // Get bounding rect once (you can optimize by caching it elsewhere)
        const rect = inputRef.current.getBoundingClientRect();

        // Check if pointer is inside the div bounds
        const inside =
            e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;

        if (!inside && ctrlPressed.current) {
            // Pointer outside div but pointer capture means we still get events
            // Stop tracking so next movement inside resets lastPos
            isTracking.current = false;
            return;
        }

        // If not tracking yet (e.g. pointer re-entered), reset lastPos
        if (!isTracking.current) {
            lastPos.current = { x: e.clientX, y: e.clientY };
            isTracking.current = true;
            return;
        }

        // Calculate deltas based on last known position
        const deltaX = e.clientX - lastPos.current.x;
        const deltaY = e.clientY - lastPos.current.y;

        lastPos.current = { x: e.clientX, y: e.clientY };

        const accelDeltaX = deltaX * 100; // your acceleration factor
        const accelDeltaY = deltaY * 100;

        const now = e.timeStamp || performance.now();

        if (now - lastReportTime.current >= REPORT_INTERVAL_MS) {
            sendMouseReport(accelDeltaX, accelDeltaY, false, false);
            lastReportTime.current = now;
        }
    }

    // Make a keycode packet and send it
    function sendMouseReport(x, y, LClick, RClick) {
        const flag = 2; // Flag to indicate mouse packet
        const numInts = 4;

        // Allocate a buffer and have two views of the same address space
        const buffer = new ArrayBuffer(1 + numInts * 4); // 1 flag byte + 4 ints * 4 bytes each
        const view = new DataView(buffer);

        view.setUint8(0, flag); // set flag at first byte

        // set int32 values starting at offset 1
        view.setInt32(1, x, true);
        view.setInt32(5, y, true);

        const keycode = new Uint8Array(buffer);
        console.log("Moved mouse by :(", x, y, ")");
        sendEncrypted(keycode);
    }

    // Send only recent characters while displaying the whole input
    const sendDiff = useCallback(async () => {
        var keycode = new Uint8Array(8); // Payload for special characters
        keycode[0] = 1; // DATA_TYPE is TEXT

        const current = bufferRef.current; // Current text data (new data + last sent data)
        const previous = lastSentBuffer.current; // Last sent text data

        let payload = "";

        // If data was added, add a slice of the new buffer that is the size of the difference to the payload
        if (current.length > previous.length) {
            payload += current.slice(previous.length);

            // If data was removed, add n backspaces to the payload where n is the difference in length
        } else if (current.length < previous.length) {
            const numDeleted = previous.length - current.length;
            payload += "\b".repeat(numDeleted);
        }

        // Append special events payloads
        if (specialEvents.current.length > 0) {
            for (const ev of specialEvents.current) {
                switch (ev) {
                    case "Backspace":
                        payload += "\b";
                        break;
                    case "Enter":
                        payload += "\n";
                        break;
                    case "Tab":
                        payload += "\t";
                        break;
                    case "ArrowUp":
                        keycode[1] = 0xda;
                        break;
                    case "ArrowDown":
                        keycode[1] = 0xd9;
                        break;
                    case "ArrowLeft":
                        keycode[1] = 0xd8;
                        break;
                    case "ArrowRight":
                        keycode[1] = 0xd7;
                        break;
                    // add other special keys as needed
                }
            }
            // If the payload is not null
            if (keycode[1] !== 0) {
                console.log("Sending keycode");
                sendEncrypted(keycode);
                keycode[1] = 0;
            }
            specialEvents.current = []; // Clear the special events after sending
        }

        if (payload.length === 0) {
            return;
        }

        // Update lastSentBuffer early to avoid duplicate sends
        lastSentBuffer.current = current;

        sendEncrypted(payload); // Send the input
    }, [createEncryptedPackets, pktCharacteristic, readyToReceive]);

    // Polling logic: send latest buffer every N ms unless the timout is reset
    const scheduleSend = useCallback(() => {
        // If schedulesSend is called while another timeout is running, reset it
        if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
        }

        // Schedule the sendDiff function after DEBOUNCE_INTERVAL_MS
        debounceTimeout.current = setTimeout(() => {
            sendDiff();
        }, DEBOUNCE_INTERVAL_MS);
    }, [sendDiff]);

    // Handle each keypress and reset the timer
    function updateBufferAndSend(newBuffer) {
        bufferRef.current = newBuffer;
        setBuffer(newBuffer);
        scheduleSend();
    }

    // Helper: handle special key events (Backspace, Enter, Arrow, Tab)
    function handleSpecialKey(e, buffer) {
        switch (e.key) {
            case "Backspace":
                if (buffer.length === 0) {
                    specialEvents.current.push("Backspace");
                    scheduleSend();
                } else {
                    updateBufferAndSend(buffer.slice(0, -1));
                }
                return true;
            case "Enter":
                if (buffer.length === 0) {
                    specialEvents.current.push("Enter");
                    scheduleSend();
                } else {
                    updateBufferAndSend(buffer + "\n");
                }
                return true;
            case "Tab":
                e.preventDefault();
                updateBufferAndSend(buffer + "\t");
                return true;
            default:
                if (e.key.startsWith("Arrow")) {
                    specialEvents.current.push(e.key);
                    scheduleSend();
                    return true;
                }
                return false;
        }
    }


    // Helper: handle Ctrl/Alt shortcuts
    function handleModifierShortcut(e, modifierByte) {
        let keypress = e.key === "Backspace" ? "\b" : e.key;
        let keycode = new Uint8Array(8);
        keycode[0] = 1;
        keycode[1] = modifierByte;
        keycode[2] = keypress.charCodeAt(0);
        sendEncrypted(keycode);
    }

    // Main keydown handler
    const handleKeyDown = (e) => {
        e.preventDefault();
        const isCtrl = e.ctrlKey || e.metaKey;
        const isAlt = e.altKey;
        const buffer = bufferRef.current;

        if (isCtrl && e.key !== "Control") { // Just Ctrl does nothing
            handleModifierShortcut(e, 0x80);
            return;
        }
        if (isAlt && e.key !== "Alt") { // Just Alt does nothing
            handleModifierShortcut(e, 0x83);
            return;
        }

        if (handleSpecialKey(e, buffer)) return; // Handle special keys first

        if (e.key === "Control") {
            ctrlPressed.current = true;
            return;
        }
        if (e.key.length === 1) {
            updateBufferAndSend(buffer + e.key);
            return true;
        }
        return false;
    };

    // When ctrl is released, start sending mouse data (if enabled)
    const handleKeyUp = (e) => {
        if (e.key === "Control") {
            ctrlPressed.current = false;
        }
    };

     // Handle inputs from touch devices / on screen keyboards
    const handleTouchInput = (e) => {
        e.preventDefault();
        console.log("Touch input detected: ", e.data);

        // All touch backspaces are handled as special events
        if (e.data === "Backspace") {
                specialEvents.current.push("Backspace");
                scheduleSend();
            return;
        }

        updateBufferAndSend(bufferRef.current + e.data); // Append the input data to the buffer and schedule send
    };

    // Toggle capturing and sending mouse data
    function CaptureMouseButton() {
        const handleToggle = () => setCaptureMouse((prev) => !prev);

        return (
            <div
                onClick={handleToggle}
                className={`border border-hover h-10 w-10 justify-between items-center p-2 rounded-lg
                        ${captureMouse ? "bg-white text-shelf" : "bg-shelf text-text"}`}
            >
                <CursorArrowRaysIcon className="h-5 w-5"></CursorArrowRaysIcon>
            </div>
        );
    }

    // Toggle between Mac and Windows mode to send command instead of windows
    function MacModeButton() {
        const handleToggle = () => setMacMode((prev) => !prev);

        return (
            <div
                onClick={handleToggle}
                className={`border border-hover h-10 w-10 justify-between items-center p-2 rounded-lg
                        ${macMode ? "bg-white text-shelf" : "bg-shelf text-white"}`}
            >
                {/* <IconButton>
                    <svg xmlns={windowsLogo} fill="white" className="h-5 w-5" />
                </IconButton> */}

                <WindowsLogo fill="currentColor" className={`${macMode ? "hidden" : ""} h-5 w-5`} />
                <AppleLogo fill="currentColor" className={`${macMode ? "" : "hidden"} h-5 w-5`} />
            </div>
        );
    }

    // Handle paste events (append pasted text to buffer)
    const onPaste = (e) => {
        e.preventDefault();
        const newBuffer = buffer + e.clipboardData.getdata("text");
        bufferRef.current = newBuffer;
        setBuffer(newBuffer);
        scheduleSend();
        return;
    };

   

    return (
        <div className="flex flex-col flex-1 w-full p-4 bg-background text-text">
            {/* <Typography variant="h4" className="text-text">
                Send Keystrokes to the 'ToothPaste in real(ish) time
            </Typography> */}

            {/* <Typography variant="h5" className="text-hover">
                It just works.....
            </Typography> */}

            <Keyboard listenerRef={inputRef} deviceStatus={status}></Keyboard>

            <div className="flex flex-col flex-1 my-4 rounded-xl transition-all border border-hover focus:border-shelf relative group ">
                <div className="absolute top-2 right-2">
                    <CaptureMouseButton />
                </div>

                <div className="absolute top-14 right-2">
                    <MacModeButton />
                </div>

                <Typography
                    variant="h1"
                    className="flex items-center justify-center pointer-events-none select-none text-gray-800 p-4 whitespace-pre-wrap font-sans absolute inset-0 z-0 group-focus-within:hidden"
                    aria-hidden="true"
                >
                    Click here to start sending keystrokes in real time (kinda...)
                </Typography>

                <Typography
                    variant="h1"
                    className=" hidden group-focus-within:flex items-center justify-center pointer-events-none select-none text-hover p-4 whitespace-pre-wrap font-sans absolute inset-0 z-0 "
                    aria-hidden="true"
                >
                    Capturing inputs...
                </Typography>

                <div
                    ref={inputRef}
                    tabIndex={0}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyUp}
                    contentEditable={true}
                    suppressContentEditableWarning={true}
                    onInput={(e) => e.preventDefault()} // stop text from being inserted
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerCancel}
                    onPointerEnter={onPointerEnter}
                    onBeforeInput={handleTouchInput}
                    onPaste={onPaste}
                    className="flex flex-1 w-full p-4 rounded-xl
                            text-hover text-4xl bg-shelf focus:bg-background focus:bg-background focus:outline-none whitespace-pre-wrap font-sans overflow-y-auto"
                >
                    <span className="" />
                </div>
            </div>
        </div>
    );
}
