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

// Async queue utility
function createAsyncQueue() {
    const queue = [];
    let resolvers = [];

    const push = (item) => {
        if (resolvers.length > 0) {
            const resolve = resolvers.shift();
            resolve(item);
        } else {
            queue.push(item);
        }
    };

    const iterator = {
        [Symbol.asyncIterator]: async function* () {
            while (true) {
                if (queue.length > 0) {
                    yield queue.shift();
                } else {
                    const item = await new Promise((resolve) => {
                        resolvers.push(resolve);
                    });
                    yield item;
                }
            }
        },
    };

    return { push, iterator };
}

export default function LiveCapture() {
    const [buffer, setBuffer] = useState(""); // what user is typing
    const lastSentBuffer = useRef(""); // tracks last sent buffer
    const bufferRef = useRef("");
    const debounceTimeout = useRef(null);
    const specialEvents = useRef([]); // store special keys pressed but not modifying buffer

    const queueRef = useRef(createAsyncQueue());
    const processingRef = useRef(false);
    const { pktCharacteristic, status, readyToReceive, sendEncrypted } =
        useContext(BLEContext);
    const { createEncryptedPackets } = useContext(ECDHContext);
    const inputRef = useRef(null);

    const DEBOUNCE_INTERVAL_MS = 50;

    // Polling logic: send latest buffer every N ms if changed
    const sendDiff = useCallback(async () => {
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
                        payload += "[UP]";
                        break;
                    case "ArrowDown":
                        payload += "[DOWN]";
                        break;
                    case "ArrowLeft":
                        payload += "[LEFT]";
                        break;
                    case "ArrowRight":
                        payload += "[RIGHT]";
                        break;
                    // add other special keys as needed
                }
            }
            specialEvents.current = [];
        }

        if (payload.length === 0) {
            return;
        }

        // Update lastSentBuffer early to avoid duplicate sends
        lastSentBuffer.current = current;

        sendEncrypted(payload);
    }, [
        createEncryptedPackets,
        pktCharacteristic,
        readyToReceive,
    ]);

    const scheduleSend = useCallback(() => {
        if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
        }
        debounceTimeout.current = setTimeout(() => {
            sendDiff();
        }, DEBOUNCE_INTERVAL_MS);
    }, [sendDiff]);

    const handleKeyDown = (e) => {
        e.preventDefault();

        const buffer = bufferRef.current;

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

        // Ignore other keys if any
    };

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    return (
        <div className="flex flex-col max-h-screen w-full p-6 bg-background text-text">
            <Typography variant="h2" className="text-text">
                Start Typing
            </Typography>

            <Typography variant="h5" className="text-hover">
                It just works.....
            </Typography>

            <div className="flex flex-col flex-1 mt-5 min-h-0">
                <div
                    ref={inputRef}
                    tabIndex={0}
                    onKeyDown={handleKeyDown}
                    className="w-full h-full min-h-[48px] p-4 rounded-xl transition-all border border-hover focus:border-shelf 
                                bg-transparent text-text text-4xl outline-none focus:outline-none whitespace-pre-wrap font-sans overflow-y-auto">
                    
                    {buffer.split("").map((char, i) => (<span key={i}>{char}</span>))
                    }
                    <span className="custom-caret" />
                </div>
            </div>
        </div>
    );
}
