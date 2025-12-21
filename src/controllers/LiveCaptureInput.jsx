import { useRef, useState, useEffect, useCallback, useContext } from 'react';
import { BLEContext } from "../context/BLEContext.jsx";
import { ECDHContext } from "../context/ECDHContext.jsx";

import * as ToothPacketPB from '../controllers/toothpacket/toothpacket_pb.js';
const KeyboardPacket = new ToothPacketPB.proto.toothpaste.KeyboardPacket();


import {HIDMap} from "./HIDMap.js"
import { createKeyboardPacket, createKeyCodePacket } from './PacketFunctions.js';


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
                console.log("Sending keycode");
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

        // var keyboardPayload = new KeyboardPacket();
        // keyboardPayload.setMessage(payload);
        // keyboardPayload.setLength(payload.length);


        var packet = createKeyboardPacket(payload);
        sendEncrypted(packet); // Send the final payload


        console.log("Current:", current);
        console.log("Previous:", previous);

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
        // TODO: Handle Combos in a function
        // TODO: Handle just modifiers (hold ctrl to stop tracking cursor)
        // TODO: 
        // Input: "", <Backspace>, "" -> "abc" 
        // Send: "abcd", Send 'Backspace', "\b"

        console.log("Keydown event: ", e.key, "Code: ", e.code);

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
        // Control combo
        const isCtrl = e.ctrlKey || e.metaKey;
        if (isCtrl && e.key !== "Control"){
            if(commandPassthrough){
                e.preventDefault();
                sendKeyCode(e, "Control");
                return true;
            }

            else{
                return true; // Default behaviour: paste data from host clipboard
            }
        }

        // Alt Combo
        if (e.altKey && e.key !== "Alt"){
            if(commandPassthrough){
                e.preventDefault();
                sendKeyCode(e, "Alt");
                return true;
            }

            else{
                return true;// Default behaviour: paste data from host clipboard
            }
        }
        
        if (e.shiftKey && e.key !== "Shift"){
            if(commandPassthrough){
                e.preventDefault();
                sendKeyCode(e, "Shift");
                return true;
            }

            else{
                return true;// Default behaviour: paste data from host clipboard
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
                return (sendKeyCode(e, null));
        }
    }

    // Helper: handle non-printing inputs directly as keycodes (Currently does not work with system shortcuts like alt+tab)
    function sendKeyCode(e, modifierKey, anotherModifierKey) {
        let modifierByte = modifierKey? HIDMap[modifierKey] : 0; // Get the modifier's code from HIDMap, if it doesnt exist there is no modifier in the keycode
        let anotherModifierByte = anotherModifierKey? HIDMap[anotherModifierKey] : 0; // Get the modifier's code from HIDMap, if it doesnt exist there is no modifier in the keycode
        let keypress = HIDMap[e.key]? HIDMap[e.key] : e.key; // Check if the key is a HIDMap character, otherwise the key is a printing character
        let keypressCode = typeof(keypress) === 'string'? keypress.charCodeAt(0) : keypress;

        console.log("Keypress, modifier: ", keypress, modifierByte, anotherModifierByte);
        if(!(modifierByte || HIDMap[e.key])) return false; // If there is no modifier and the key is not in the HIDMap command edits buffer, handle in sendDiff

        let keycode = new Uint8Array(8);
        keycode[0] = modifierByte;
        keycode[1] = anotherModifierByte;
        keycode[2] = keypressCode;

        console.log("Creating Packet From: ", keycode);
        var keyCodePacket = createKeyCodePacket(keycode);
        sendEncrypted(keyCodePacket);
        
        return true;
    }

    // When a key is released
    const handleKeyUp = (e) => {
        //console.log("Keyup event: ", e.key, "Code: ", e.code);
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
        console.log("Touch input event handled in beforeInput: ", event.data);
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
        console.log("Composition started++++++++++++++");
        isComposingRef.current = true;
        
        console.log("Event target value: ", event.target.value);
        console.log("Last input value: ", lastCompositionRef.current);
 

    };

    // When composition ends it contains a CORRECTED word, which is presumably the final word typed
    function handleCompositionEnd(event) {
        console.log("Composition ended with data: ", event.data);
        
        var lastInput = (lastCompositionRef.current).trim(); 
        var isPartialComplete = (lastInput !== ""); // If the last input is not a character, we assume fully autofilled word

        if (lastInput !== event.data.trim())  { // If the buffer doesnt match the composition end, autocorrect changed the word
            console.log("Autocorrect / Autocomplete triggered")

            if(isPartialComplete){
                console.log("Partial word autofilled / autocorrected");
                sendKeyCode({key: "Backspace"}, 0x80); // Delete the word typed word (ctrl + backspace)
            }
            updateBufferAndSend(bufferRef.current + event.data); // Add the new word
        }
        
        console.log("");
        
        //inputRef.current.value = " "; // Clear the input field (add a space to avoid auto capitalizing every word)
        lastCompositionRef.current = "";
        lastInputRef.current = inputRef.current.value; // Update last input value to the new word
        isComposingRef.current = false;
    };
    
    function handleOnChange(event) {
        console.log("Input changed: ", event.target.value);
        console.log("Last input value: ", lastInputRef.current);

        // If the onChange event is fired but input size has shrunk, backspace was pressed
        if (lastInputRef.current.length > event.target.value.length) {
            console.log("Handling backspace for input change");
            handleSpecialKey({key:"Backspace"}, bufferRef.current);
            lastCompositionRef.current = lastCompositionRef.current.slice(0, -1); // Keep the lastinput buffer updated
        }

        lastInputRef.current = event.target.value; // Update last input value to the current input
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
