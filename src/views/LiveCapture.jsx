import React, { useEffect, useRef, useState, useContext, useCallback, useMemo } from "react";

import { Button, Typography } from "@material-tailwind/react";
import { CursorArrowRaysIcon, CursorArrowRippleIcon, PowerIcon, ArrowUpOnSquareStackIcon, PlayPauseIcon, ChevronDoubleUpIcon, ChevronDoubleDownIcon, ForwardIcon, BackwardIcon} from "@heroicons/react/24/outline";
import { BLEContext } from "../context/BLEContext";
//import "../components/CustomTyping/CustomTyping.css"; // We'll define animations here
import Keyboard from "../components/Keyboard/Keyboard";
import { useInputController } from "../controllers/LiveCaptureInput";

import { createConsumerControlPacket, createKeyCodePacket, createMouseStream, createMouseJigglePacket } from "../controllers/PacketFunctions";

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

    // Contexts
    const { status, sendEncrypted } = useContext(BLEContext);

    // Mouse Vars
    const lastPos = useRef({ x: 0, y: 0, t: performance.now() }); // Last known position of the mouse
    const isTracking = useRef(true);
    const lastReportTime = useRef(0);
    const tDisplacement = useRef({ x: 0, y: 0 }); // Total displacement since last report
    const REPORT_INTERVAL_MS = 100;
    const SCALE_FACTOR = 1; // Scale factor for mouse movement
    const [captureMouse, setCaptureMouse] = useState(false);

    

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
        //e.target.setPointerCapture(e.pointerId);
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
        if (!captureMouse) return;

        // Get bounding rect once (you can optimize by caching it elsewhere)
        const rect = inputRef.current.getBoundingClientRect();

        // Check if pointer is inside the div bounds
        const inside =
            e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;

        if (!inside || ctrlPressed.current) {
            // Pointer outside div but pointer capture means we still get events
            // Stop tracking so next movement inside resets lastPos
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

        lastPos.current = { x: e.clientX, y: e.clientY, t: e.timeStamp }; // Update last position

        // Scale by time delta to get acceleration-like values
        const accelDeltaX = displacementX * (velocityX * SCALE_FACTOR);
        const accelDeltaY = displacementY * (velocityY * SCALE_FACTOR);

        tDisplacement.current.x += accelDeltaX;
        tDisplacement.current.y += accelDeltaY;

        displacementList.current.push(tDisplacement.current);
        tDisplacement.current = { x: 0, y: 0 }; // Reset displacement after adding to list
    }


    function onWheel(e) {
        if (!captureMouse) return;  
        e.preventDefault(); // Prevent page scrolling

        var reportDelta  = -e.deltaY * 0.01; // Scale down the scroll delta
        sendMouseReport(false, false, reportDelta);
    }

    // Make a mouse packet and send it
    function sendMouseReport(LClick, RClick, scrollDelta=0) {
        const flag = 2; // Flag to indicate mouse packet
        const mouseFrames = displacementList.current.slice(0, 8);
        const numFrames = mouseFrames.length;

        var mousePacket = createMouseStream(mouseFrames, LClick, RClick, scrollDelta);
        sendEncrypted(mousePacket);

        displacementList.current = []; // reset list
    }

    // Reusable IconToggleButton component
    function IconToggleButton({
        title, // Tooltip text
        toggled, // Set the button UI state
        onClick, // Click handler
        Icon, // Icon component
        hoverText = "", // Text to show on hover
        className = "", // Additional classes
        expandDirection = "left" // Direction to expand on hover: "left" or "right"
    }) {
        const [isHovered, setIsHovered] = React.useState(false);
        const isDisconnected = status === 0; // ConnectionStatus.disconnected

        const getButtonStyle = () => {
            const bgColor = "bg-shelf";
            const hoverBgColor = isDisconnected ? "bg-secondary" : "bg-primary"; // Background color on hover


            if (isHovered) {
                const positionClass = expandDirection === "right" ? "left-0" : "right-0";
                const flexOrder = expandDirection === "right" ? "" : "flex-row-reverse";
                return `absolute ${positionClass} top-0 w-auto px-3 ${hoverBgColor} text-white ${flexOrder}`;
            }
            return `w-10 ${toggled ? "bg-white text-shelf" : `${bgColor} text-text`}`;
        };

        return (
            <div className={`relative w-10 h-10`}>
                <div
                    title={title}
                    onClick={onClick}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                    className={`border border-hover h-10 flex justify-center items-center p-2 rounded-lg transition-all cursor-pointer ${getButtonStyle()} ${className}`}
                >
                    {Icon && <Icon className="h-5 w-5" />}
                    {isHovered && hoverText && (
                        <span className="mx-2 whitespace-nowrap text-sm font-medium">
                            {hoverText}
                        </span>
                    )}
                </div>
            </div>
        );
    }

    function MediaToggleButton({ title, onClick, Icon, expandDirection = "left" }) {
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
                hoverText={title}
                expandDirection={expandDirection}
            />
        );
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
                <div>
                    <MediaToggleButton
                        title="Play / Pause media"
                        onClick={() => {sendControlCode(0x00CD)}}
                        Icon={PlayPauseIcon}
                        expandDirection="right"
                        />
                </div>
                <div>
                    <MediaToggleButton
                        title="Volume Up"
                        onClick={() => {sendControlCode(0x00E9)}}
                        Icon={ChevronDoubleUpIcon}
                        expandDirection="right"
                        />
                </div>
                <div>
                    <MediaToggleButton
                        title="Volume Down"
                        onClick={() => {sendControlCode(0x00EA)}}
                        Icon={ChevronDoubleDownIcon}
                        expandDirection="right"
                        />
                </div>
                <div>
                    <MediaToggleButton
                        title="Next"
                        onClick={() => {sendControlCode(0x00B5)}}
                        Icon={ForwardIcon}
                        expandDirection="right"
                        />
                </div>
                <div>
                    <MediaToggleButton
                        title="Previous"
                        onClick={() => {sendControlCode(0x00B6)}}
                        Icon={BackwardIcon}
                        expandDirection="right"
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
                    <MediaToggleButton 
                        title="Power Button"
                        Icon={PowerIcon} 
                        onClick={() => sendControlCode(0x0030)} 
                    />
                </div>
                <div>
                    <MouseJiggleButton />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col flex-1 w-full p-4 bg-background text-text">
            {/* <Typography variant="h4" className="text-text">
                Send Keystrokes to the 'ToothPaste in real(ish) time
            </Typography> */}

            {/* <Typography variant="h 5" className="text-hover">
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
                    className="flex items-center justify-center opacity-70 pointer-events-none select-none text-white p-4 whitespace-pre-wrap font-sans absolute inset-0 z-0 group-focus-within:hidden"
                    aria-hidden="true"
                >
                    Click here to start sending keystrokes in real time (kinda...)
                </Typography>

                <Typography
                    variant="h1"
                    className=" hidden group-focus-within:flex opacity-70 items-center justify-center pointer-events-none select-none text-white p-4 whitespace-pre-wrap font-sans absolute inset-0 z-0 "
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
                    onWheel={onWheel}
                    onContextMenu={(e) => e.preventDefault()} // Prevent right-clicks from opening the default context menu inside this input
                    // IME event handlers
                    onChange={handleOnChange}
                    onCompositionStart={handleCompositionStart}
                    onCompositionUpdate={() => {}}
                    onCompositionEnd={handleCompositionEnd}
                    className="flex flex-1 w-full p-4 rounded-xl caret-transparent
                            text-shelf focus:text-background text-4xl bg-shelf focus:bg-background focus:outline-none whitespace-pre-wrap font-sans overflow-y-auto"
                ></input>
            </div>
        </div>
    );
}
