import React, { useState, useContext, useRef, useEffect, useCallback } from 'react';
import { Button, Typography } from "@material-tailwind/react";
import { Textarea } from "@material-tailwind/react";
import { BLEContext } from '../context/BLEContext';
import { HomeIcon, PaperAirplaneIcon, ClipboardIcon } from "@heroicons/react/24/outline";
import CustomTyping from '../components/CustomTyping/CustomTyping';
import RichTextArea from '../components/CustomTextArea/RichTextArea';


export default function BulkSend() {
    //const { encryptText, createEncryptedPackets } = useContext(ECDHContext);
    const [input, setInput] = useState('');
    const {status, sendEncrypted } = useContext(BLEContext);
    const editorRef = useRef(null);


    const sendString = async () => {
        if (!input) return;

        try {
            sendEncrypted(input);
        } catch (error) { 
            console.error(error); 
        }
    };

    // Use Ctrl + Shift + Enter to send 
    const handleShortcut = useCallback((event) => {
        const isCtrl = event.ctrlKey || event.metaKey;
        const isShift = event.shiftKey;
        const isEnter = event.key === "Enter";

        if (isCtrl && isShift && isEnter) {
            console.log("Shortcut detected: Ctrl + Shift + Enter");
            event.preventDefault();
            sendString();
        }
    }, [sendString]);


    useEffect(() => {
        const keyListener = (e) => handleShortcut(e);
        window.addEventListener("keydown", keyListener);
        return () => window.removeEventListener("keydown", keyListener);
    }, [handleShortcut]);



    return (
        <div className="flex flex-col max-h-screen w-full p-6 bg-background text-text">
            <Typography variant="h2" className="text-text">
                Paste Something
            </Typography>
            <Typography variant="h5" className="text-hover">
                And the pigeons will do the rest.....
            </Typography>

            <div className="flex flex-col flex-1 mt-5 min-h-0">
                {/* <CustomTyping> </CustomTyping> */}

                <RichTextArea onChange={(text) => setInput(text)} />
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