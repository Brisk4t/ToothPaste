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
                    className="flex flex-1 w-full p-4 rounded-xl transition-all border border-hover focus:border-shelf 
                                bg-transparent text-hover text-4xl outline-none focus:outline-none whitespace-pre-wrap font-sans overflow-y-auto">
                    
                    Type Here
                    <span className="" />
                </div>
            </div>
        </div>
    );
}
