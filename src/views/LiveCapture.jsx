import React, {
    useEffect,
    useRef,
    useState,
    useContext,
    useCallback,
} from "react";

import { Button, Typography } from "@material-tailwind/react";
import { ECDHContext } from "../context/ECDHContext";
import { BLEContext } from "../context/BLEContext";
import "../components/CustomTyping/CustomTyping.css"; // We'll define animations here
import Keyboard from "../components/Keyboard/Keyboard";


export default function LiveCapture() {
    const [buffer, setBuffer] = useState(""); // what user is typing
    const lastSentBuffer = useRef(""); // tracks last sent buffer
    const bufferRef = useRef("");
    const debounceTimeout = useRef(null);
    const specialEvents = useRef([]); // store special keys pressed but not modifying buffer

    const { pktCharacteristic, status, readyToReceive, sendEncrypted } = useContext(BLEContext);
    const { createEncryptedPackets } = useContext(ECDHContext);
    const inputRef = useRef(null);
    const DEBOUNCE_INTERVAL_MS = 50;

    // Mouse Vars
    const lastPos = useRef({ x: 0, y: 0 });
    const isTracking = useRef(true);
    const ctrlPressed = useRef(false);
    const lastReportTime = useRef(0);
    const REPORT_INTERVAL_MS = 200;

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
        if (
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom
        ) {
            lastPos.current = { x: e.clientX, y: e.clientY };
            isTracking.current = true;
        }
    }

    // When a pointer moves
    function onPointerMove(e) {
        if (ctrlPressed.current) return;

        // Get bounding rect once (you can optimize by caching it elsewhere)
        const rect = inputRef.current.getBoundingClientRect();

        // Check if pointer is inside the div bounds
        const inside =
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom;

        if (!inside) {
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
    function sendMouseReport(x, y, LClick, RClick){
        
        const flag = 2; // Flag to indicate mouse packet
        const numInts = 4;

        // Allocate a buffer and have two views of the same address space
        const buffer = new ArrayBuffer(1 + numInts * 4); // 1 flag byte + 4 ints * 4 bytes each
        const view = new DataView(buffer);

        view.setUint8(0, flag); // set flag at first byte

        // set int32 values starting at offset 1
        view.setInt32(1,  x, true);
        view.setInt32(5,  y, true);

        const keycode = new Uint8Array(buffer);
        console.log('Moved mouse by :(', x, y, ")");
        sendEncrypted(keycode);
    }



    // Send only recent characters while displaying the whole input
    const sendDiff = useCallback(async () => {
        var keycode = new Uint8Array(8); // Payload = DATA_TYPE+[KEYCODES(6)]
        keycode[0] = 1;     // Byte 0
            
        const current = bufferRef.current;
        const previous = lastSentBuffer.current;

        let payload = "";


        if (current.length > previous.length) {
            payload += current.slice(previous.length);

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
                        keycode[1] = 0xDA;
                        break;
                    case "ArrowDown":
                        keycode[1] = 0xD9;
                        break;
                    case "ArrowLeft":
                        keycode[1] = 0xD8;
                        break;
                    case "ArrowRight":
                        keycode[1] = 0xD7;
                        break;
                    // add other special keys as needed
                }
            }
            // If the payload is not null
            if (keycode[1] !== 0){
                console.log("Sending keycode")
                sendEncrypted(keycode);
                keycode[1] = 0;    
            }
            specialEvents.current = [];
        }

        if (payload.length === 0) {
            return;
        }

        // Update lastSentBuffer early to avoid duplicate sends
        lastSentBuffer.current = current;

        sendEncrypted(payload); // Send the input
    }, [
        createEncryptedPackets,
        pktCharacteristic,
        readyToReceive,
    ]);

    // Polling logic: send latest buffer every N ms if changed
    const scheduleSend = useCallback(() => {
        if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
        }
        debounceTimeout.current = setTimeout(() => {
            sendDiff();
        }, DEBOUNCE_INTERVAL_MS);
    }, [sendDiff]);

    // Handle each keypress and reset the timer 
    const handleKeyDown = (e) => {
        e.preventDefault();
        const isCtrl = e.ctrlKey || e.metaKey;
        const isAlt = e.altKey;

        const buffer = bufferRef.current;

        if (isCtrl && !["Control"].includes(e.key)) { 
            console.log("Shortcut detected: Ctrl + ", e.key);

            var keypress = null;
            if (e.key === "Backspace") keypress = '\b';
            else keypress = e.key;
            
            console.log("Sending: Ctrl +", keypress);

            var keycode = new Uint8Array(8); // Payload = DATA_TYPE+[KEYCODES(6)]
            keycode[0] = 1;   // Byte 0
            keycode[1] = 0x80;  // Byte 1
            keycode[2] = keypress.charCodeAt(0);  // Byte 2
            keycode[4] = 0;    // Byte 3
            keycode[5] = 0;    // Byte 3
            keycode[6] = 0;    // Byte 3
            keycode[7] = 0;    // Byte 3

            sendEncrypted(keycode);
            return;
        }

        else{
            if (e.key === "Backspace") {
                if (buffer.length === 0) {
                    specialEvents.current.push("Backspace");
                    scheduleSend();
                } else {
                    const newBuffer = buffer.slice(0, -1);
                    bufferRef.current = newBuffer;
                    setBuffer(newBuffer);
                    scheduleSend();
                }
                return;
            }

            if (e.key === "Enter") {
                if (buffer.length === 0) {
                    specialEvents.current.push("Enter");
                    scheduleSend();
                } else {
                    const newBuffer = buffer + "\n";
                    bufferRef.current = newBuffer;
                    setBuffer(newBuffer);
                    scheduleSend();
                }
                return;
            }

            if (e.key.startsWith("Arrow")) {
                // Always enqueue arrow key events — they don't change buffer
                specialEvents.current.push(e.key);
                scheduleSend();
                return;
            }

            if (e.key === "Tab") {
                e.preventDefault(); // Stops focus from jumping to the next element

                const newBuffer = bufferRef.current + "\t"; // Tab character is \t
                bufferRef.current = newBuffer;
                setBuffer(newBuffer);

                scheduleSend(); // Your existing debounce/send logic
                return;
            }
            
            if (e.key === "Control") {
                ctrlPressed.current = true;
            }

            if (e.key.length === 1) {
                // Regular characters
                const newBuffer = buffer + e.key;
                bufferRef.current = newBuffer;
                setBuffer(newBuffer);
                scheduleSend();
                return;
            }
        }
    };

    const handleKeyUp = (e) => {
      if (e.key === 'Control') {
        ctrlPressed.current = false;
      }
    }

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    return (
        
        <div className="flex flex-col flex-1 w-full p-4 bg-background text-text">
            
            <Typography variant="h2" className="text-text">
                Start Typing
            </Typography>

            <Typography variant="h5" className="text-hover">
                It just works.....
            </Typography>


            
            <Keyboard listenerRef={inputRef} deviceStatus={status}></Keyboard>


            <div className="flex flex-col flex-1 my-4">
                <div
                    ref={inputRef}
                    tabIndex={0}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyUp}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerCancel}
                    onPointerEnter={onPointerEnter}
                    className="flex flex-1 w-full p-4 rounded-xl transition-all border border-hover focus:border-shelf 
                                bg-transparent text-hover text-4xl outline-none focus:outline-none whitespace-pre-wrap font-sans overflow-y-auto">
                    
                    Type Here
                    <span className="" />
                </div>
            </div>
        </div>
    );
}
