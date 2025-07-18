import { list } from "@material-tailwind/react";
import React, { useEffect, useState, useRef } from "react";

const keys = [
    [ // Row 1
        { label: "ESC" },
        { label: "~" }, { label: "1" }, { label: "2" }, { label: "3" },
        { label: "4" }, { label: "5" }, { label: "6" }, { label: "7" },
        { label: "8" }, { label: "9" }, { label: "0" }, { label: "-" },
        { label: "=" }, { label: "←", width: "w-16" } // Backspace
    ],
    [ // Row 2
        { label: "Tab", width: "w-16" }, { label: "Q" }, { label: "W" },
        { label: "E" }, { label: "R" }, { label: "T" }, { label: "Y" },
        { label: "U" }, { label: "I" }, { label: "O" }, { label: "P" },
        { label: "[" }, { label: "]" }, { label: "\\", width: "w-16" } // Backslash
    ],
    [ // Row 3
        { label: "A" }, { label: "S" }, { label: "D" }, { label: "F" },
        { label: "G" }, { label: "H" }, { label: "J" }, { label: "K" },
        { label: "L" }, { label: ";" }, { label: "'" }, { label: "↩", width: "w-20" } // Enter
    ],
    [ // Row 4
        { label: "SHIFT", width: "w-20" }, { label: "Z" }, { label: "X" },
        { label: "C" }, { label: "V" }, { label: "B" }, { label: "N" }, { label: "M" },
        { label: "," }, { label: "." }, { label: "/" }, { label: "SHIFT", width: "w-20" }
    ],
    [ // Row 5
        { label: "CONTROL", width: "w-32" }, { label: "WIN" }, { label: "ALT" },
        { label: "SPACE", width: "w-80" },
        { label: "ALT" }, { label: "WIN" }, { label: "CONTROL", width: "w-32" },
    ],

];

const MAX_HISTORY_LENGTH = keys[0].length;
const HISTORY_DURATION = 3000;
const COMBO_COOLDOWN = 200; // minimum ms before logging same combo again
const DEBOUNCE_DURATION = 300; // in ms

const Keyboard = ({listenerRef}) => {
    const [activeKeys, setActiveKeys] = useState(new Set());
    const [history, setHistory] = useState([]);
    const timeoutsRef = useRef({});
    const lastComboRef = useRef(null);

    const comboTimestamps = useRef({});
    const activeKeysRef = useRef(new Set());
    const keyPressTimestamps = useRef({});
    const debounceTimer = useRef(null);


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

    const isKeyActive = (label) => activeKeys.has(label);

    return (
        <div className="bg-black text-white flex flex-col items-center justify-center space-y-6">
            {/* Command History */}
            <div className="flex space-x-2 overflow-hidden">
                {history.map((entry) => (
                    <div
                        key={entry.id}
                        style={{ animationDuration: `${HISTORY_DURATION}ms` }}
                        className="px-2 py-1 flex items-center justify-center text-sm font-bold rounded border border-gray-500 bg-primary animate-fadeout"
                    >
                        {entry.key}
                    </div>
                ))}
            </div>

            {/* Keyboard Rows */}
            {keys.map((row, rowIndex) => (
                <div key={rowIndex} className="flex space-x-2">
                    {row.map(({ label, width }) => (
                        <div
                            key={label}
                            className={`${width ?? "w-12"
                                } h-12 border border-2 border-hover flex items-center justify-center text-lg rounded-lg ${isKeyActive(label.toUpperCase())
                                    ? "bg-primary"
                                    : "bg-black"
                                }`}
                        >
                            {label}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
};

export default Keyboard;
