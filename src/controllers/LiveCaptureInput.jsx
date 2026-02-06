import { useRef, useState, useEffect, useCallback, useContext } from 'react';
import { BLEContext } from "../context/BLEContext.jsx";
import { ECDHContext } from "../context/ECDHContext.jsx";

import * as ToothPacketPB from '../controllers/toothpacket/toothpacket_pb.js';
// const KeyboardPacket = new ToothPacketPB.proto.toothpaste.KeyboardPacket();


import {HIDMap} from "./HIDMap.js"
import { createKeyboardPacket, createKeyboardStream, createKeyCodePacket } from './PacketFunctions.js';


export function useInputController() {
    // BLE and ECDH contexts
    const { pktCharacteristic, status, readyToReceive, sendEncrypted } = useContext(BLEContext);
    const { createEncryptedPackets } = useContext(ECDHContext);
    
    // Text input handler variables
    const DEBOUNCE_INTERVAL_MS = 20; // Interval to wait before sending input data
    const inputRef = useRef(null); // The input DOM element reference
    const ctrlPressed = useRef(false); // Flag to indicate if Ctrl is pressed
    const debounceTimeout = useRef(null); // Holds the promise to send the buffer data after DEBOUNCE_INTERVAL_MS
    const specialEvents = useRef([]); // store special keys pressed but not modifying buffer
    const [commandPassthrough, setCommandPassthrough] = useState(0);
    
    // Each event within a DEBOUNCE_INTERVAL_MS period is added to a buffer
    const bufferRef = useRef(""); // Tracks the current input buffer
    const lastSentBuffer = useRef(""); // tracks last sent buffer to aggregate and send only updates, not entire buffer
    
    // Touch (IME) keyboard input variables
    const isIMERef = useRef(false); // Flag to indicate if IME is active
    const isComposingRef = useRef(false); // If there are any ghost events during the autocorrect process (compositionStart -> compositionEnd) ignore them
    const lastCompositionRef = useRef(""); // Contains a string that was later autocorrected / autocompleted (updates on compositionStart)
    const lastInputRef = useRef(""); // Last input value, compared with current input value to infer backspace and potentially other non-character inputs
  

    // Construct and send a packet using the difference between prev and current buffer (implementation allows tracking all historical data if needed later)
    const sendDiff = useCallback(async () => {
        var keycode = new Uint8Array(8); // Payload for special characters
        keycode[0] = 1; // DATA_TYPE is TEXT

        const current = bufferRef.current; // Current text data (new data + last sent data)
        const previous = lastSentBuffer.current; // Last sent text data

        let payload = "";

        // If data was added, add a slice of the new buffer that is the size of the difference to the payload
        if (current.length > previous.length) {
            payload += current.slice(previous.length);

        } 
        
        // If data was removed, add n backspaces to the payload where n is the difference in length
        else if (current.length < previous.length) {
            const numDeleted = previous.length - current.length;
            payload += "\b".repeat(numDeleted);
        }

        // Append special events payloads (TODO: redundant, need to refactor and remove)
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
            // If there are any special events that dont modify the buffer, send them as keycodes
            if (keycode[1] !== 0) {
                sendEncrypted(keycode);
                keycode[1] = 0;
            }
            specialEvents.current = []; // Clear the special events after sending / adding to payload
        }

        
        // If there is nothing to be printed, return
        if (payload.length === 0) {
            sendEncrypted(new Uint8Array(0)); // Send empty payload to ensure no reports are stuck
        }

        // Update lastSentBuffer early to avoid duplicate sends
        lastSentBuffer.current = current;

        var packetStream = createKeyboardStream(payload);
        sendEncrypted(packetStream); // Send the final payload

    }, [createEncryptedPackets, pktCharacteristic, readyToReceive]);

    // Schedule the sendDiff function to be called after a delay of DEBOUNCE_INTERVAL_MS, calling scheduleSend() again within the delay resets the timer
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

    // Update the current debounce session's buffer and reset debounce timer
    function updateBufferAndSend(newBuffer) {
        bufferRef.current = newBuffer;
        scheduleSend();
    }

    // Intercept keydown events
    function handleKeyDown(e) {
        console.log("Key down event: ", e.key, " | Ctrl: ", e.ctrlKey, " | Alt: ", e.altKey, " | Shift: ", e.shiftKey);

        // Handle inputs with modifiers (Ctrl + c, Alt + x, etc.). Don't prevent default behaviour until this point to allow selecting input modes
        if(handleCombo(e)) return;

        // Let IME fill in the input without interference
        if (!isIMERef.current) e.preventDefault(); 

        // TODO: Depending on the current input mode, we let host handle special keys or we send special keys as keycodes 
        if (handleSpecialKey(e, bufferRef.current)) return; // If the key itself is a special key (e.key === "Backspace" / "Tab" / "Ctrl" / "Arrow_" etc.)

        // If the key is a printing character ('a', 'b', '.' etc. === length 1), update the buffer and send
        if (e.key.length === 1) {
            lastInputRef.current = inputRef.current.value; // Update last input value to the current input (for IME)
            
            // Append the new key to the buffer
            updateBufferAndSend(bufferRef.current + e.key);
            return true;
        }

        return false;
    }

    // Handle inputs with modifiers (Ctrl + c, Alt + x, etc.). Don't prevent default behaviour until this point to allow selecting input modes
    function handleCombo(e){
        const modifiers = [];
        
        // Check all modifiers
        if (e.ctrlKey) modifiers.push("Control");
        if (e.altKey) modifiers.push("Alt");
        if (e.shiftKey) modifiers.push("Shift");
        if (e.metaKey) modifiers.push("Meta");
        
        // If there are modifiers and the key is not just a modifier
        if (modifiers.length > 0 && e.key !== "Control" && e.key !== "Alt" && e.key !== "Shift" && e.key !== "Meta") {
            if (commandPassthrough) {
                e.preventDefault();
                sendKeyCode(e, modifiers);
                return true;
            } else {
                return true; // Default behaviour: paste data from host clipboard
            }
        }
        
        return false;
    }

    // Helper: handle special key events (Backspace, Enter, Tab, etc.)
    function handleSpecialKey(e, buffer) {
        switch (e.key) {
            case "Backspace":
                // If the buffer is empty, backspace must be sent by itself
                if (buffer.length === 0) {
                    specialEvents.current.push("Backspace");
                    scheduleSend();
                } 
                
                // Otherwise the buffer must be edited before backspace is sent to keep track of changes
                else {
                    updateBufferAndSend(buffer.slice(0, -1));
                }

                return true;
                
            case "Enter":
                updateBufferAndSend(buffer + "\n");
                return true;

            case "Tab":                
                // No need to check buffer since tab is not a printing character
                updateBufferAndSend(buffer + "\t");
                return true;
            
            case "Control":
                ctrlPressed.current = true;
                return true;

            default:
                return (sendKeyCode(e, []));
        }
    }

    // Helper: handle non-printing inputs directly as keycodes (Supports up to 5 modifiers + key)
    function sendKeyCode(e, modifiers = []) {
        let keycode = new Uint8Array(8);
        
        // Add modifiers (up to 5) at indices 0-4
        if (Array.isArray(modifiers)) {
            for (let i = 0; i < Math.min(modifiers.length, 5); i++) {
                keycode[i] = HIDMap[modifiers[i]] || 0;
            }
        }
        
        // Add the key itself at index 5
        let keypress = HIDMap[e.key] ? HIDMap[e.key] : e.key;
        let keypressCode = typeof keypress === 'string' ? keypress.charCodeAt(0) : keypress;
        keycode[5] = keypressCode;
        
        // Check if we have valid data
        const hasModifier = Array.isArray(modifiers) && modifiers.length > 0;
        if (!(hasModifier || HIDMap[e.key])) return false;
        
        var keyCodePacket = createKeyCodePacket(keycode);
        sendEncrypted(keyCodePacket);
        
        return true;
    }

    // When a key is released
    const handleKeyUp = (e) => {
        if (e.key === "Control") {
            ctrlPressed.current = false;
        }
    };

    
    // Handle paste events (append pasted text to buffer)
    function handlePaste(e) {
        e.preventDefault();
        const newBuffer = bufferRef.current + e.clipboardData.getData("text");
        bufferRef.current = newBuffer;
        scheduleSend();
        return;
    }

    // When the input is a result of an IME non-composition event, it contains NEW data
    const handleOnBeforeInput = (event) => {
        isIMERef.current = true; // Set IME flag on beforeinput
        
        // Ignore any intermediate composition events
        if (isComposingRef.current) {
            return;
        }
        
        // Send the new data 
        updateBufferAndSend(bufferRef.current + event.data)
        lastCompositionRef.current += event.data; // Create a ref for each character in the current composition (current word)
        isIMERef.current = false; // Reset IME flag on afterinput

        // -> This will fire an onChange event for the input div 
    };

    // Composition event handlers
    function handleCompositionStart(event) {
        isComposingRef.current = true;
    };

    // When composition ends it contains a CORRECTED word, which is presumably the final word typed
    function handleCompositionEnd(event) {        
        var lastInput = (lastCompositionRef.current).trim(); 
        var isPartialComplete = (lastInput !== ""); // If the last input is not a character, we assume fully autofilled word

        if (lastInput !== event.data.trim())  { // If the buffer doesnt match the composition end, autocorrect changed the word
            console.log("Autocorrect / Autocomplete triggered")

            if(isPartialComplete){
                console.log("Partial word autofilled / autocorrected");
                sendKeyCode({key: "Backspace"}, ["Control"]); // Delete the word typed word (ctrl + backspace)
            }
            updateBufferAndSend(bufferRef.current + event.data); // Add the new word
        }        
        //inputRef.current.value = " "; // Clear the input field (add a space to avoid auto capitalizing every word)
        lastCompositionRef.current = "";
        lastInputRef.current = inputRef.current.value; // Update last input value to the new word
        isComposingRef.current = false;
    };
    
    function handleOnChange(event) {
        // If the onChange event is fired but input size has shrunk, backspace was pressed
        // if (lastInputRef.current.length > event.target.value.length) {
        //     handleSpecialKey({key:"Backspace"}, bufferRef.current);
        //     lastCompositionRef.current = lastCompositionRef.current.slice(0, -1); // Keep the lastinput buffer updated
        // }

        var packetStream = createKeyboardStream(event.target.value);
        sendEncrypted(packetStream); // Send the final payload

        //lastInputRef.current = event.target.value; // Update last input value to the current input
    }
    
    return {
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
    };
}
