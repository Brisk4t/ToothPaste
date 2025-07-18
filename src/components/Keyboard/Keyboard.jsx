import React, { useEffect, useState, useRef } from "react";
import { Button } from "@material-tailwind/react";
const keys = [
    [ // Row 0
        { eventCode: "ESCAPE", label: "ESC", width: "w-14" },
        { eventCode: "F1" }, { eventCode: "F2" }, { eventCode: "F3" },
        { eventCode: "F4" }, { eventCode: "F5" }, { eventCode: "F6" }, { eventCode: "F7" },
        { eventCode: "F8" }, { eventCode: "F9" }, { eventCode: "F10" }, { eventCode: "F11" },
        { eventCode: "F12" }, { eventCode:"BACKSPACE", label: "←", width: "w-20 mr-20" } // Backspace
    ],
    [ // Row 1
        { eventCode: "~" }, { eventCode: "1" }, { eventCode: "2" }, { eventCode: "3" },
        { eventCode: "4" }, { eventCode: "5" }, { eventCode: "6" }, { eventCode: "7" },
        { eventCode: "8" }, { eventCode: "9" }, { eventCode: "0" }, { eventCode: "-" },
        { eventCode: "=" }, { eventCode:"BACKSPACE", label: "←", width: "w-20 mr-20" } // Backspace
    ],
    [ // Row 2
        { eventCode: "Tab", width: "w-16" }, { eventCode: "Q" }, { eventCode: "W" },
        { eventCode: "E" }, { eventCode: "R" }, { eventCode: "T" }, { eventCode: "Y" },
        { eventCode: "U" }, { eventCode: "I" }, { eventCode: "O" }, { eventCode: "P" },
        { eventCode: "[" }, { eventCode: "]" }, { eventCode: "\\", width: "w-16 mr-20" } // Backslash
    ],
    [ // Row 3
        { eventCode: "CAPSLOCK", label: "Caps", width: "w-24" },
        { eventCode: "A" }, { eventCode: "S" }, { eventCode: "D" }, { eventCode: "F" },
        { eventCode: "G" }, { eventCode: "H" }, { eventCode: "J" }, { eventCode: "K" },
        { eventCode: "L" }, { eventCode: ";" }, { eventCode: "'" }, { eventCode: "↩", width: "w-24 mr-20" } // Enter
    ],
    [ // Row 4
        { eventCode: "SHIFT", width: "w-32" }, { eventCode: "Z" }, { eventCode: "X" },
        { eventCode: "C" }, { eventCode: "V" }, { eventCode: "B" }, { eventCode: "N" }, { eventCode: "M" },
        { eventCode: "," }, { eventCode: "." }, { eventCode: "/" }, { eventCode: "SHIFT", width: "w-32 mr-24" },
        { eventCode: "ARROWUP", label: "↑", width: "w-20" },
    ],
    [ // Row 5
        { eventCode: "CONTROL", label:"CTRL", width: "w-20 ml-5" }, { eventCode: "WIN", width: "w-20" }, { eventCode: "ALT", width: "w-20" },
        { eventCode: "SPACE", width: "w-[300px]" },
        { eventCode: "ALT", width: "w-20" }, { eventCode: "META", label: "WIN", width: "w-20" }, { eventCode: "CONTROL", label:"CTRL", width: "w-20 mr-20" },
        { eventCode: "ARROWLEFT", label: "←", width: "w-20" }, { eventCode: "ARROWDOWN", label: "↓", width: "w-20" }, { eventCode: "ARROWRIGHT", label:"→", width: "w-20" },

    ],

];

const MAX_HISTORY_LENGTH = 23;
const HISTORY_DURATION = 3000;
const COMBO_COOLDOWN = 200; // minimum ms before logging same combo again
const DEBOUNCE_DURATION = 300; // in ms





const Keyboard = ({ listenerRef, deviceStatus}) => {
    const [activeKeys, setActiveKeys] = useState(new Set());
    const [history, setHistory] = useState([]);
    const timeoutsRef = useRef({});
    const lastComboRef = useRef(null);

    const [backgroundColor, setBackgroundColor] = useState("");
    const [showKeyboard, setShowKeyboard] = useState(false);

    const comboTimestamps = useRef({});
    const activeKeysRef = useRef(new Set());
    const keyPressTimestamps = useRef({});
    const debounceTimer = useRef(null);


    useEffect(() => {
        switch (deviceStatus) {
            case 0:
                setBackgroundColor("bg-secondary");
                break;
            case 1:
                setBackgroundColor("bg-primary");
                break;
            case 2:
                setBackgroundColor("bg-orange");
                break;
            default:
                setBackgroundColor("bg-gray");
        }
    }, [deviceStatus]);

    function ShowKeyboardButton (){
        const handleToggle = () => setShowKeyboard(prev => !prev)
            
        return(
                <Button variant="outlined" onClick={handleToggle} className={`p-3 border border-hover text-text 
                    ${showKeyboard? 
                    "bg-white text-shelf":
                    "bg-shelf "}`}
                >Keyboard</Button>
        );

    }

    // Return a list of all keys that have been pressed for >= DEBOUNCE_DURATION
    const getDebouncedKeys = () => {
        const now = Date.now();
        return [...activeKeysRef.current].filter(
            (k) => now - keyPressTimestamps.current[k] >= DEBOUNCE_DURATION
        );
    };

    // Handle keypresses
    useEffect(() => {

        // If component is not attached to anything, return
        const node = listenerRef?.current;
        if (!node) return;

        const handleKeyDown = (e) => {
            const key = e.key === " " ? "SPACE" : e.key.toUpperCase(); // Translate " " to "SPACE"

            // Only timestamp if not already held
            if (!keyPressTimestamps.current[key]) {
                keyPressTimestamps.current[key] = Date.now();
            }

            // Add a new key to active keys, ignore duplicates
            setActiveKeys((prevKeys) => {
                const updated = new Set(prevKeys);
                updated.add(key);
                activeKeysRef.current = new Set(updated);
                return updated;
            });

            // Short timeout to check for updated combo
            setTimeout(() => {
                const now = Date.now(); // Get the current time
                const validKeys = getDebouncedKeys(); // Get the list of all keys that have been pressed for >= DEBOUNCE_DURATION

                // Include this key if it just passed debounce
                if (now - keyPressTimestamps.current[key] >= DEBOUNCE_DURATION) {
                    if (!validKeys.includes(key)) validKeys.push(key);
                }

                // If there are no such keys, return
                if (validKeys.length === 0) return;


                const sortedCombo = validKeys.sort().join("+");

                // Check if a bigger combo including this combo was recently logged
                const isSubsetOfRecentCombo = Object.keys(comboTimestamps.current).some(combo => {
                    if (now - comboTimestamps.current[combo] > COMBO_COOLDOWN) return false;

                    const comboKeys = combo.split("+");

                    // Check if validKeys is a subset of comboKeys
                    return validKeys.every(k => comboKeys.includes(k)) && comboKeys.length > validKeys.length;
                });

                if (isSubsetOfRecentCombo) return; // If we're still holding down other keys this event is not logged

                const lastLogged = comboTimestamps.current[sortedCombo] || 0;

                // If COMBO_COOLDOWN has elapsed, log this as a new combo event
                if (now - lastLogged >= COMBO_COOLDOWN) {
                    comboTimestamps.current[sortedCombo] = now;

                    const newEntry = { key: sortedCombo, id: now };
                    setHistory((prev) => [...prev, newEntry].slice(-MAX_HISTORY_LENGTH));

                    const id = newEntry.id;
                    timeoutsRef.current[id] = setTimeout(() => {
                        setHistory((prev) => prev.filter((entry) => entry.id !== id));
                        delete timeoutsRef.current[id];
                    }, HISTORY_DURATION);
                }
            }, DEBOUNCE_DURATION);
        };

        const handleKeyUp = (e) => {
            const key = e.key === " " ? "SPACE" : e.key.toUpperCase();
            const pressTime = keyPressTimestamps.current[key];
            const now = Date.now();

            const wasQuickTap = pressTime && (now - pressTime < DEBOUNCE_DURATION);

            delete keyPressTimestamps.current[key];

            // Snapshot active keys *before* deleting the current key
            const tempActiveKeys = new Set(activeKeysRef.current);
            tempActiveKeys.delete(key);

            // If it's a quick tap, record the combo using remaining modifiers
            if (wasQuickTap) {
                const modifiers = [...tempActiveKeys].filter(k =>
                    ["SHIFT", "CONTROL", "ALT", "WIN"].includes(k)
                );

                const comboKeys = [...modifiers, key].sort();
                const sortedCombo = comboKeys.join("+");

                if (now - (comboTimestamps.current[sortedCombo] || 0) >= COMBO_COOLDOWN) {
                    comboTimestamps.current[sortedCombo] = now;

                    const newEntry = { key: sortedCombo, id: now };
                    setHistory((prev) => [...prev, newEntry].slice(-MAX_HISTORY_LENGTH));

                    const id = newEntry.id;
                    timeoutsRef.current[id] = setTimeout(() => {
                        setHistory((prev) => prev.filter((entry) => entry.id !== id));
                        delete timeoutsRef.current[id];
                    }, HISTORY_DURATION);
                }
            }

            // Update the actual state afterward
            setActiveKeys((prevKeys) => {
                const updated = new Set(prevKeys);
                updated.delete(key);
                activeKeysRef.current = new Set(updated); // keep ref in sync
                return updated;
            });

            // Optional: clear stale combo memory if no keys are held
            if (activeKeysRef.current.size === 0) {
                lastComboRef.current = null;
            }
        };

        node.addEventListener("keydown", handleKeyDown);
        node.addEventListener("keyup", handleKeyUp);

        return () => {
            node.removeEventListener("keydown", handleKeyDown);
            node.removeEventListener("keyup", handleKeyUp);
            Object.values(timeoutsRef.current).forEach(clearTimeout);
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    }, [listenerRef]);

    const isKeyActive = (eventCode) => activeKeys.has(eventCode);

    return (
        <div className="bg-black text-white flex flex-col items-center justify-center space-y-6">
            
            {/* Wrap both history and keyboard in a fixed-width container */}
            <div className="w-full">

                {/* Keyboard Rows */}
                <div className={`flex flex-col space-y-2 ${showKeyboard? "":"hidden"}`}>
                    {keys.map((row, rowIndex) => (
                        <div key={rowIndex} className="flex justify-center">
                            {row.map(({ eventCode, width, label }) => (
                                <div
                                    key={eventCode}
                                    className={`${width ?? "w-12"} h-12 mx-1 border-2 border-hover flex items-center justify-center text-lg rounded-lg ${rowIndex === 0?"mb-5":""}
                                        ${isKeyActive(eventCode.toUpperCase()) ? backgroundColor : "bg-black"
                                    }`}
                                >
                                    {label? label : eventCode}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>

                {/* Command History Container Styling */}
                <div className="rounded-lg bg-shelf px-2 py-2 mt-4 min-h-12 w-full max-w-full overflow-x-hidden">
                    {/* Command History Container Function*/}
                    <div className="flex flex-nowrap space-x-2">
                        <ShowKeyboardButton/>
                        {history.map((entry) => (
                            <div
                                key={entry.id}
                                className={`px-2 py-1 flex items-center justify-center text-sm font-bold rounded ${backgroundColor} animate-fadeout`}
                                style={{ animationDuration: `${HISTORY_DURATION}ms` }}
                            >
                                {entry.key}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Keyboard;
