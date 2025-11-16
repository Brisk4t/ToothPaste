import React, { useEffect, useRef, useState, useContext, useCallback } from "react";

import { Button, Typography } from "@material-tailwind/react";
import { CursorArrowRaysIcon, PowerIcon, ArrowUpOnSquareStackIcon, PlayPauseIcon, ChevronDoubleUpIcon, ChevronDoubleDownIcon, ForwardIcon, BackwardIcon} from "@heroicons/react/24/outline";
import { BLEContext } from "../context/BLEContext";
import "../components/CustomTyping/CustomTyping.css"; // We'll define animations here
import Keyboard from "../components/Keyboard/Keyboard";
import { useInputController } from "../controllers/LiveCaptureInput";

import { ReactComponent as AppleLogo } from "../assets/appleLogo.svg";
import { ReactComponent as WindowsLogo } from "../assets/windowsLogo.svg";
import { createConsumerControlPacket, createKeyCodePacket, createMouseStream } from "../controllers/PacketFunctions";

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
    const REPORT_INTERVAL_MS = 100;
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
    }, REPORT_INTERVAL_MS);

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

        var mousePacket = createMouseStream(mouseFrames, LClick, RClick);
        sendEncrypted(mousePacket);

        console.log("Mouse packet to send: ", mousePacket);
        displacementList.current = []; // reset list
    }

    // Reusable IconToggleButton component
    function IconToggleButton({
        title,
        toggled,
        onClick,
        Icon,
        className = ""
    }) {
        return (
            <div
                title={title}
                onClick={onClick}
                className={`border border-hover h-10 w-10 flex justify-center items-center p-2 rounded-lg transition-colors cursor-pointer ${
                    toggled ? "bg-white text-shelf" : "bg-shelf text-text"
                } ${className}`}
            >
                {Icon && <Icon className="h-5 w-5" />}
            </div>
        );
    }

    function MediaToggleButton({ title, onClick, Icon }) {
        const [toggled, setToggled] = React.useState(false);

        const handleClick = () => {
            setToggled(true);
            onClick();
            setTimeout(() => setToggled(false), 100); // 150ms visual feedback
        };

        return (
            <IconToggleButton
                title={title}
                toggled={toggled}
                onClick={handleClick}
                Icon={Icon}
            />
        );
}

    // Toggle capturing and sending mouse data
    function CaptureMouseButton() {
        const handleToggle = () => setCaptureMouse((prev) => !prev);

        return (
            <IconToggleButton
                title="Enable / Disable sending mouse movement"
                toggled={captureMouse}
                onClick={handleToggle}
                Icon={CursorArrowRaysIcon}
            />
        );
    }

    // Toggle how pasting and other command shortcuts are handled
    function CommandPassthroughButton() {
        const handleToggle = () => setCommandPassthrough((prev) => !prev);
        return (
            <IconToggleButton
                title="When this is enabled shortcuts like Ctrl+V are sent as is, when disabled Ctrl+V pastes the data in your clipboard as text"
                toggled={commandPassthrough}
                onClick={handleToggle}
                Icon={ArrowUpOnSquareStackIcon}
            />
        );
    }

    function sendControlCode(controlCode, hold = false) {
        const arr = new ArrayBuffer(10);
        var view = new DataView(arr);



        // view.setUint8(0, 4); // first byte = flag
        view.setUint16(0, controlCode, true); // next two bytes = control code

        var keycode = new Uint8Array(arr);

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
                
                    <MediaToggleButton
                        title="Play / Pause media"
                        onClick={() => {sendControlCode(0x00CD)}}
                        Icon={PlayPauseIcon}
                        />
                
                    <MediaToggleButton
                        title="Volume Up"
                        onClick={() => {sendControlCode(0x00E9)}}
                        Icon={ChevronDoubleUpIcon}
                        />
                
                    <MediaToggleButton
                        title="Volume Down"
                        onClick={() => {sendControlCode(0x00EA)}}
                        Icon={ChevronDoubleDownIcon}
                        />
                
                    <MediaToggleButton
                        title="Next"
                        onClick={() => {sendControlCode(0x00B5)}}
                        Icon={ForwardIcon}
                        />
                
                    <MediaToggleButton
                        title="Previous"
                        onClick={() => {sendControlCode(0x00B6)}}
                        Icon={BackwardIcon}
                        />
            </div>
        );
    }

    // Vertical dropdown with media control buttons (Play/Pause, Vol+, Vol-, Next, Prev)
    function RightButtonColumn() {
        return (
            <div className="flex flex-col space-y-2">
                <CaptureMouseButton />
                <CommandPassthroughButton />
                <MediaToggleButton 
                    title="Power Button"
                    Icon={PowerIcon} 
                    onClick={() => sendControlCode(0x0030)} 
                />

            </div>
        );
    }

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
                <div className="absolute top-2 left-2">
                    <LeftButtonColumn />
                </div>
                
                <div className="absolute top-2 right-2">
                    <RightButtonColumn />
                </div>



                <Typography
                    variant="h1"
                    className="flex items-center justify-center opacity-70 pointer-events-none select-none text-gray-800 p-4 whitespace-pre-wrap font-sans absolute inset-0 z-0 group-focus-within:hidden"
                    aria-hidden="true"
                >
                    Click here to start sending keystrokes in real time (kinda...)
                </Typography>

                <Typography
                    variant="h1"
                    className=" hidden group-focus-within:flex opacity-70 items-center justify-center pointer-events-none select-none text-gray-800 p-4 whitespace-pre-wrap font-sans absolute inset-0 z-0 "
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
