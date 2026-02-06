import React, { useState, useContext, useRef, useEffect, useCallback } from 'react';
import { Button, Typography } from "@material-tailwind/react";
import { Textarea } from "@material-tailwind/react";
import { BLEContext } from '../context/BLEContext';
import { HomeIcon, PaperAirplaneIcon, ClipboardIcon } from "@heroicons/react/24/outline";
import { keyboardHandler } from '../services/inputHandlers/keyboardHandler';



export default function BulkSend() {
    //const { encryptText, createEncryptedPackets } = useContext(ECDHContext);
    const [input, setInput] = useState('');
    const {status, sendEncrypted } = useContext(BLEContext);
    const editorRef = useRef(null);


    const sendString = async () => {
        if (!input) return;

        try {
            keyboardHandler.sendKeyboardString(input, sendEncrypted);
        } 
        
        catch (error) { 
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
            event.stopPropagation();
            sendString();
        }
        else if (isCtrl && isAlt && !["Control", "Alt"].includes(event.key)) {
            console.log("Shortcut detected: Ctrl + Alt +", event.key);
            event.preventDefault();
            event.stopPropagation();

            const keySequence = event.key === "Backspace" ? ["Control", "Backspace"] : ["Control", event.key];
            keyboardHandler.sendKeyboardShortcut(keySequence, sendEncrypted);
        }

    }, [sendString, sendEncrypted]);


    useEffect(() => {
        const keyListener = (e) => handleShortcut(e);
        window.addEventListener("keydown", keyListener);
        return () => window.removeEventListener("keydown", keyListener);
    }, [handleShortcut]);



    return (
        <div className="flex flex-col flex-1 w-full p-6 bg-background text-text">

            <div id="bulk-send-container" className="flex flex-col flex-1 mt-5">
                {/* <CustomTyping> </CustomTyping> */}

                {/* <RichTextArea onKeyDownCapture={handleShortcut} onChange={(text) => setInput(text)} /> */}
                <Textarea
                    className={`flex flex-1 resize-none bg-shelf border-2 focus:border-hover outline-none text-text 
                        ${status===1?'hover:border-primary border-primary':'hover:border-secondary border-secondary'} `}
                    ref={editorRef}
                    value={input}
                    size="lg"
                    placeholder="Type or paste text here..."
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleShortcut}
                />
                <Button
                    onClick={sendString}
                    disabled={status !== 1}
                    className='my-4 bg-primary disabled:bg-hover disabled:border-secondary text-text active:bg-primary-active flex items-center justify-center size-lg '>

                    <ClipboardIcon className="h-7 w-7 mr-2" />

                    {/* Paste to Device */}
                    <Typography variant="h4" className="text-text font-sans normal-case font-semibold">Paste to Device</Typography>
                </Button>
            </div>
        </div>
    )

}