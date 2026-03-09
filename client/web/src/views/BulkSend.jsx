import React, { useState, useContext, useRef, useEffect, useCallback } from 'react';
import { Button, Typography, Tabs } from "@material-tailwind/react";
import { Textarea } from "@material-tailwind/react";
import { BLEContext } from '../context/BLEContext';
import { HomeIcon, PaperAirplaneIcon, ClipboardIcon, InformationCircleIcon, SparklesIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { keyboardHandler } from '../services/inputHandlers/keyboardHandler';
import DuckyscriptEditor from '../components/duckyscript/DuckyscriptEditor';
import { parseDuckyscript, executeDuckyscript } from '../services/duckyscript/DuckyscriptParser';
import { DuckyscriptContext } from '../context/DuckyscriptContext';



export default function BulkSend() {
    const [input, setInput] = useState('');
    const [selectedScript, setSelectedScript] = useState(null);
    const { status, sendEncrypted } = useContext(BLEContext);
    const { isUnlocked, scripts } = useContext(DuckyscriptContext);
    const editorRef = useRef(null);


    const sendString = useCallback(async () => {
        if (!input) return;

        try {
            keyboardHandler.sendKeyboardString(input, sendEncrypted);
        } 
        
        catch (error) { 
            console.error(error); 
        }
    }, [input, sendEncrypted]);

    const sendDuckyscript = useCallback(async () => {
        if (!selectedScript) return;

        try {
            console.log('[BulkSend] Executing duckyscript:', selectedScript.name);
            
            // Parse the script content to get AST
            const parseResult = parseDuckyscript(selectedScript.content);
            
            if (!parseResult.isValid) {
                console.error('[BulkSend] Script has parse errors:', parseResult.errors);
                alert('Script has errors:\n' + parseResult.errors.map(e => `Line ${e.line}: ${e.message}`).join('\n'));
                return;
            }
            
            // Helper function for async delay
            const delayFn = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            
            // Helper function to send string via keyboardHandler
            const sendStringFn = async (text) => {
                return new Promise((resolve, reject) => {
                    try {
                        keyboardHandler.sendKeyboardString(text, sendEncrypted);
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                });
            };
            
            // Execute the AST
            await executeDuckyscript(parseResult.ast, sendStringFn, delayFn);
            
        } 
        
        catch (error) { 
            console.error('[BulkSend] Duckyscript execution error:', error);
            alert('Error executing script: ' + error.message);
        }
    }, [selectedScript, sendEncrypted]);

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
        <div className="flex flex-col flex-1 w-full p-6 bg-transparent text-text z-10">
            <div id="bulk-send-container" className="flex flex-col flex-1 mt-5">
                <Tabs defaultValue="text" className="flex flex-col flex-1">
                    <Tabs.List className="w-full bg-ink rounded-lg p-1">
                        <Tabs.Trigger className="w-full text-text data-[state=active]:text-text" value="text">
                            <div className="flex items-center gap-2">
                                <ClipboardIcon className="h-4 w-4" />
                                Text
                            </div>
                        </Tabs.Trigger>
                        <Tabs.Trigger className="w-full text-text data-[state=active]:text-text" value="duckyscript">
                            <div className="flex items-center gap-2">
                                <SparklesIcon className="h-4 w-4" />
                                Duckyscript
                            </div>
                        </Tabs.Trigger>
                        <Tabs.TriggerIndicator className="bg-ash rounded" />
                    </Tabs.List>

                    <Tabs.Panel value="text" className="flex flex-col flex-1 gap-4">
                        <Textarea
                            className={`flex-1 resize-none bg-ink border-2 focus:border-ash outline-none text-text font-body
                                ${status===1?'hover:border-primary border-primary':'hover:border-secondary border-secondary'} `}
                            ref={editorRef}
                            value={input}
                            placeholder="Type or paste text here..."
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleShortcut}
                        />
                        <div className="flex text-text">
                            <InformationCircleIcon className="h-4 w-4 mr-2 stroke-2" />
                            <Typography type="small">
                                Press Ctrl+Alt+Enter to send the text, or click the button below.
                            </Typography>
                        </div>
                        <Button
                            onClick={sendString}
                            disabled={status !== 1}
                            className='bg-primary disabled:bg-ash disabled:border-secondary text-text active:bg-primary-active flex items-center justify-center size-lg '>
                            <ClipboardIcon className="h-7 w-7 mr-4" />
                            <Typography type="h5" className="text-text font-header normal-case font-semibold">Paste to Device</Typography>
                        </Button>
                    </Tabs.Panel>

                    <Tabs.Panel value="duckyscript" className="flex flex-col flex-1 gap-4 relative">
                        {!isUnlocked && (
                            <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center z-50 backdrop-blur-sm">
                                <div className="flex flex-col items-center gap-2">
                                    <LockClosedIcon className="h-8 w-8 text-dust" />
                                    <Typography type="h6" className="text-dust font-semibold">
                                        Storage is Locked
                                    </Typography>
                                    <Typography type="small" className="text-dust/70">
                                        Unlock in the Authentication tab to access duckyscripts
                                    </Typography>
                                </div>
                            </div>
                        )}
                        <div className={`flex flex-col flex-1 gap-4 min-h-0 ${isUnlocked ? '' : 'pointer-events-none opacity-50'}`}>
                            <div className="flex text-orange">
                                <InformationCircleIcon className="h-4 w-4 mr-2 stroke-2" />
                                <Typography type="small">
                                    The DuckyScript module is a work-in-progress. Features might not be fully functional.
                                </Typography>
                            </div>
                            <div className="flex-1 min-h-0 overflow-auto">
                                <DuckyscriptEditor onScriptSelected={setSelectedScript} />
                            </div>
                            
                            {selectedScript && (
                                <div className="bg-ash rounded p-3 flex flex-col gap-3">
                                    <div>
                                        <Typography type="small" className="text-dust font-semibold mr-4">
                                            Selected Script: {selectedScript.name}
                                        </Typography>
                                        <Typography type="small" className="text-text">
                                            Lines: {selectedScript.lineCount} | Est. Time: {Math.round(selectedScript.estimatedTime)}ms
                                        </Typography>
                                    </div>
                                    <Button
                                        onClick={sendDuckyscript}
                                        disabled={status !== 1 || !isUnlocked}
                                        className='bg-primary disabled:bg-ash disabled:border-secondary text-text active:bg-primary-active flex items-center justify-center size-lg'>
                                        <SparklesIcon className="h-7 w-7 mr-4" />
                                        <Typography type="h5" className="text-text font-header normal-case font-semibold">Execute Script</Typography>
                                    </Button>
                                </div>
                            )}
                        </div>
                    </Tabs.Panel>
                </Tabs>
            </div>
        </div>
    )

}