import React, { useEffect, useRef, useState, useContext, useCallback } from "react";

import { Button, Typography } from "@material-tailwind/react";
import { CursorArrowRaysIcon, ArrowUpOnSquareStackIcon } from "@heroicons/react/24/outline";
import { BLEContext } from "../context/BLEContext";
import "../components/CustomTyping/CustomTyping.css"; // We'll define animations here
import Keyboard from "../components/Keyboard/Keyboard";
import { useInputController } from "../controllers/LiveCaptureInput";

import { ReactComponent as AppleLogo } from "../assets/appleLogo.svg";
import { ReactComponent as WindowsLogo } from "../assets/windowsLogo.svg";

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

    // Contexts
    const { status, sendEncrypted } = useContext(BLEContext);

    // Mouse Vars
    const lastPos = useRef({ x: 0, y: 0, t: performance.now() }); // Last known position of the mouse
    const isTracking = useRef(true);
    const lastReportTime = useRef(0);
    const tDisplacement = useRef({ x: 0, y: 0 }); // Total displacement since last report
    const REPORT_INTERVAL_MS = 200;
    const SCALE_FACTOR = 0.2; // Scale factor for mouse movement
    const [captureMouse, setCaptureMouse] = useState(false);

    const displacementList = useRef([]);

    // Mouse polling logic
    setInterval(() => {
        //if (captureMouse && (tDisplacement.current.x !== 0 || tDisplacement.current.y !== 0)) {
        if (displacementList.current.length > 0) {
            //console.log("Sending mouse report: ", tDisplacement.current);
            console.log("Sending mouse report: ", displacementList.current);
            //sendMouseReport(tDisplacement.current.x, tDisplacement.current.y, false, false);
            sendMouseReport(false, false);
        }
    }, 200);

    // On click logic
    function onMouseDown(e) {
        //e.target.setPointerCapture(e.pointerId);
        console.log("Mousedown fired with button: ", e.button);
        isTracking.current = true;
        lastPos.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };

        if (captureMouse) {
            if (e.button == 0) sendMouseReport(1, 0); // Send left click
            if (e.button == 2) {
                e.preventDefault();
                sendMouseReport(0, 1);
            }
        }
    }

    function onMouseUp(e) {
        console.log("Mouseup fired with button: ", e.button);

        if (e.button == 0) sendMouseReport(2, 0); // Send left click
        if (e.button == 2) {
            e.preventDefault();
            sendMouseReport(0, 2);
        }
    }

    function onPointerCancel() {
        isTracking.current = false;
    }

    // When a pointer enters the div
    function onPointerEnter(e) {
        const rect = inputRef.current.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
            lastPos.current = { x: e.clientX, y: e.clientY, t: performance.now() };
            isTracking.current = true;
        }
    }

    // When a pointer moves
    function onPointerMove(e) {
        //console.log("Pointer move event: ", e.clientX, e.clientY);

        if (!captureMouse) return;

        // Get bounding rect once (you can optimize by caching it elsewhere)
        const rect = inputRef.current.getBoundingClientRect();

        // Check if pointer is inside the div bounds
        const inside =
            e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;

        if (!inside || ctrlPressed.current) {
            // Pointer outside div but pointer capture means we still get events
            // Stop tracking so next movement inside resets lastPos
            console.log("Pointer outside div or ctrl pressed, stopping tracking");
            tDisplacement.current = { x: 0, y: 0 }; // Reset displacement
            isTracking.current = false;
            return;
        }

        // If not tracking yet (e.g. pointer re-entered), reset lastPos
        if (!isTracking.current) {
            lastPos.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
            isTracking.current = true;
            return;
        }

        // Calculate displacement based on last known position
        const displacementX = e.clientX - lastPos.current.x;
        const displacementY = e.clientY - lastPos.current.y;
        const dt = e.timeStamp - lastPos.current.t;

        const velocityX = Math.abs(displacementX / dt); // Velocity in X direction
        const velocityY = Math.abs(displacementY / dt); // Velocity in Y direction

        console.log("Displacement: ", displacementX, displacementY, "Time delta: ", dt);

        lastPos.current = { x: e.clientX, y: e.clientY, t: e.timeStamp }; // Update last position

        // Scale by time delta to get acceleration-like values
        const accelDeltaX = displacementX * (velocityX * SCALE_FACTOR);
        const accelDeltaY = displacementY * (velocityY * SCALE_FACTOR);

        //console.log("Last position: ", lastPos.current);
        //console.log("Mouse moved by: ", accelDeltaX, accelDeltaY);

        tDisplacement.current.x += accelDeltaX;
        tDisplacement.current.y += accelDeltaY;

        displacementList.current.push(tDisplacement.current);
        tDisplacement.current = { x: 0, y: 0 }; // Reset displacement after adding to list
    }

    // Make a mouse packet and send it
    function sendMouseReport(LClick, RClick) {
        const flag = 2; // Flag to indicate mouse packet
        const mouseFrames = displacementList.current.slice(0, 8);
        const numFrames = mouseFrames.length;

        // Add 2 padding bytes to align int32 frames on 4-byte boundary
        const headerSize = 2; // flag + numFrames
        const padding = (4 - (headerSize % 4)) % 4; // padding to next multiple of 4
        const buffer = new ArrayBuffer(headerSize + padding + numFrames * 2 * 4 + 8);
        const view = new DataView(buffer);

        let offset = 0;

        view.setUint8(offset++, flag); // first byte = flag
        view.setUint8(offset++, numFrames); // second byte = frame count

        // insert padding
        offset += padding;

        console.log("Mouse frames to send: ", mouseFrames);

        // Set int32 x/y frames
        for (let i = 0; i < numFrames; i++) {
            view.setInt32(offset, mouseFrames[i].x, true);
            offset += 4;
            view.setInt32(offset, mouseFrames[i].y, true);
            offset += 4;
        }

        // Set left/right clicks
        view.setInt32(offset, LClick, true);
        offset += 4;
        view.setInt32(offset, RClick, true);

        const keycode = new Uint8Array(buffer);
        console.log("Mouse packet as uint8: ", keycode);

        sendEncrypted(keycode);
        displacementList.current = []; // reset list
    }

    // Toggle capturing and sending mouse data
    function CaptureMouseButton() {
        const handleToggle = () => setCaptureMouse((prev) => !prev);

        return (
            <div
                title="Enable / Disable sending mouse movement"
                onClick={handleToggle}
                className={`border border-hover h-10 w-10 justify-between items-center p-2 rounded-lg
                        ${captureMouse ? "bg-white text-shelf" : "bg-shelf text-text"}`}
            >
                <CursorArrowRaysIcon className="h-5 w-5"></CursorArrowRaysIcon>
            </div>
        );
    }

    // Toggle between Mac and Windows mode to send command instead of windows
    function CommandPassthroughButton() {
        const handleToggle = () => setCommandPassthrough((prev) => !prev);

        return (
            <div
                title="When this is enabled shortcuts like Ctrl+V are sent as is, when disabled Ctrl+V pastes the data in your clipboard as text"
                onClick={handleToggle}
                className={`border border-hover h-10 w-10 justify-between items-center p-2 rounded-lg
                        ${commandPassthrough ? "bg-white text-shelf" : "bg-shelf text-text"}`}
            >
                {/* <IconButton>
                    <svg xmlns={windowsLogo} fill="white" className="h-5 w-5" />
                </IconButton> */}

                <ArrowUpOnSquareStackIcon className="h-5 w-5"></ArrowUpOnSquareStackIcon>
            </div>
        );
    }

    // function MacModeButton() {
    //     const handleToggle = () => setMacMode((prev) => !prev);

    //     return (
    //         <div
    //             onClick={handleToggle}
    //             className={`border border-hover h-10 w-10 justify-between items-center p-2 rounded-lg
    //                     ${macMode ? "bg-white text-shelf" : "bg-shelf text-white"}`}
    //         >
    //             {/* <IconButton>
    //                 <svg xmlns={windowsLogo} fill="white" className="h-5 w-5" />
    //             </IconButton> */}

    //             <WindowsLogo fill="currentColor" className={`${macMode ? "hidden" : ""} h-5 w-5`} />
    //             <AppleLogo fill="currentColor" className={`${macMode ? "" : "hidden"} h-5 w-5`} />
    //         </div>
    //     );
    // }

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
                    <CommandPassthroughButton />
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
                    className=" hidden group-focus-within:flex items-center justify-center pointer-events-none select-none text-gray-800 p-4 whitespace-pre-wrap font-sans absolute inset-0 z-0 "
                    aria-hidden="true"
                >
                    Capturing inputs...
                </Typography>

                {/* <div
                    ref={inputRef}
                    tabIndex={0}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyUp}
                    contentEditable={true}
                    suppressContentEditableWarning={true}
                    onInput={handleInput} // mock a keydown event by slicing the input buffer and then clearing it
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerCancel}
                    onPointerEnter={onPointerEnter}
                    onBeforeInput={handleOnBeforeInput}
                    onPaste={onPaste}
                    
                    onCompositionStart = {handleCompositionStart}
                    onCompositionUpdate={handleCompositionUpdate}
                    onCompositionEnd = {handleCompositionEnd} // prevent composition events from modifying the buffer


                    className="flex flex-1 w-full p-4 rounded-xl
                            text-hover text-4xl bg-shelf focus:bg-background focus:bg-background focus:outline-none whitespace-pre-wrap font-sans overflow-y-auto"
                >
                    <span className="" />
                </div> */}

                <input
                    ref={inputRef}
                    autoCapitalize="none"
                    type="text"
                    inputMode="text"
                    name="user_input"
                    autoComplete="off"
                    spellCheck="false"
                    data-lpignore="true"
                    //{...{ autocapitalize: "none" }} // forces lowercase HTML attribute

                    // Keyboard event handlers
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyUp}
                    onPaste={handlePaste}
                    // Mouse event handlers
                    onMouseDown={onMouseDown} // When a mouse button is pressed
                    onMouseUp={onMouseUp} // When a mouse button is released
                    onPointerMove={onPointerMove}
                    onPointerCancel={onPointerCancel}
                    onPointerEnter={onPointerEnter}
                    onBeforeInput={handleOnBeforeInput}
                    onContextMenu={(e) => e.preventDefault()} // Prevent right-clicks from opening the default context menu inside this input
                    // IME event handlers
                    onChange={handleOnChange}
                    onCompositionStart={handleCompositionStart}
                    onCompositionUpdate={() => {}}
                    onCompositionEnd={handleCompositionEnd}
                    className="flex flex-1 w-full p-4 rounded-xl caret-transparent
                            text-background text-4xl bg-shelf focus:bg-background focus:bg-background focus:outline-none whitespace-pre-wrap font-sans overflow-y-auto"
                ></input>
            </div>
        </div>
    );
}
