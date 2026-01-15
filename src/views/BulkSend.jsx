import React, { useState, useContext, useRef, useEffect, useCallback } from 'react';
import { Button, Typography } from "@material-tailwind/react";
import { Textarea } from "@material-tailwind/react";
import { BLEContext } from '../context/BLEContext';
import { HomeIcon, PaperAirplaneIcon, ClipboardIcon } from "@heroicons/react/24/outline";
import CustomTyping from '../components/CustomTyping/CustomTyping';
import RichTextArea from '../components/RichTextArea/RichTextArea';
import { createKeyboardPacket } from '../controllers/PacketFunctions.js';



export default function BulkSend() {
    //const { encryptText, createEncryptedPackets } = useContext(ECDHContext);
    const [input, setInput] = useState('');
    const {status, sendEncrypted } = useContext(BLEContext);
    const editorRef = useRef(null);


    const sendString = async () => {
        if (!input) return;

        try {
            var packet = createKeyboardPacket(input);
            sendEncrypted(packet);
        } catch (error) { 
            console.error(error); 
        }
    };

    // Use Ctrl + Shift + Enter to send 
    const handleShortcut = useCallback((event) => {
        const isCtrl = event.ctrlKey || event.metaKey;
        const isAlt = event.altKey;
        const isEnter = event.key === "Enter";

        if (isCtrl && isAlt && isEnter) {
            console.log("Shortcut detected: Ctrl + Alt + Enter");
            event.preventDefault();
            event.stopPropagation(); // stop bubbling to native input handlers
            sendString();
        }
        
        else if (isCtrl && isAlt && !["Control", "Alt"].includes(event.key)) {
            console.log("Shortcut detected: Ctrl + Alt +", event.key);
            event.preventDefault();
            event.stopPropagation(); // stop bubbling to native input handlers

            var keypress = null;
            if (event.key === "Backspace") keypress = '\b';
            else keypress = event.key;
            
            console.log("Sending: Ctrl +", keypress);

            var keycode = new Uint8Array(7); // Payload = DATA_TYPE+[KEYCODES(6)]
            keycode[0] = 1;   // Byte 0
            keycode[1] = 0x80;  // Byte 1
            keycode[2] = keypress.charCodeAt(0);  // Byte 2
            keycode[3] = 0;    // Byte 3

            sendEncrypted(keycode);
        }

    }, [sendString]);


    useEffect(() => {
        const keyListener = (e) => handleShortcut(e);
        window.addEventListener("keydown", keyListener);
        return () => window.removeEventListener("keydown", keyListener);
    }, [handleShortcut]);



    return (
        <div className="flex flex-col flex-1 w-full p-6 bg-background text-text">

            <div className="flex flex-col flex-1 mt-5">
                {/* <CustomTyping> </CustomTyping> */}

                <RichTextArea onKeyDownCapture={handleShortcut} onChange={(text) => setInput(text)} />
                <Button
                    onClick={sendString}
                    disabled={status !== 1}
                    className='my-4 bg-primary text-text hover:bg-primary-hover focus:bg-primary-focus active:bg-primary-active flex items-center justify-center size-lg disabled:bg-hover'>

                    <ClipboardIcon className="h-7 w-7 mr-2" />

                    {/* Paste to Device */}
                    <Typography variant="h4" className="text-text font-sans normal-case font-semibold">Paste to Device</Typography>
                </Button>
            </div>
        </div>
    )

}