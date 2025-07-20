import React, { useEffect, useState, useRef } from "react";
import { Button } from "@material-tailwind/react";
const keys = [
  [ // Row 0
    { eventCode: "Escape", label: "ESC", width: "w-12 mr-14" },
    { eventCode: "F1", label: "F1" }, { eventCode: "F2", label: "F2" }, { eventCode: "F3", label: "F3" },
    { eventCode: "F4", label: "F4", width: "w-12 mr-8" }, { eventCode: "F5", label: "F5" }, { eventCode: "F6", label: "F6" }, { eventCode: "F7", label: "F7" },
    { eventCode: "F8", label: "F8", width: "w-12 mr-8" }, { eventCode: "F9", label: "F9" }, { eventCode: "F10", label: "F10" }, { eventCode: "F11", label: "F11" },
    { eventCode: "F12", label: "F12" } // Backspace
  ],

  [ // Row 1
    { eventCode: "Backquote", label: "~" }, { eventCode: "Digit1", label: "1" }, { eventCode: "Digit2", label: "2" }, { eventCode: "Digit3", label: "3" },
    { eventCode: "Digit4", label: "4" }, { eventCode: "Digit5", label: "5" }, { eventCode: "Digit6", label: "6" }, { eventCode: "Digit7", label: "7" },
    { eventCode: "Digit8", label: "8" }, { eventCode: "Digit9", label: "9" }, { eventCode: "Digit0", label: "0" }, { eventCode: "Minus", label: "-" },
    { eventCode: "Equal", label: "=" }, { eventCode: "Backspace", label: "↼", width: "w-24" }, // Backspace
  ],

  [ // Row 2
    { eventCode: "Tab", label: "Tab", width: "w-16" }, { eventCode: "KeyQ", label: "Q" }, { eventCode: "KeyW", label: "W" },
    { eventCode: "KeyE", label: "E" }, { eventCode: "KeyR", label: "R" }, { eventCode: "KeyT", label: "T" }, { eventCode: "KeyY", label: "Y" },
    { eventCode: "KeyU", label: "U" }, { eventCode: "KeyI", label: "I" }, { eventCode: "KeyO", label: "O" }, { eventCode: "KeyP", label: "P" },
    { eventCode: "BracketLeft", label: "[" }, { eventCode: "BracketRight", label: "]" }, { eventCode: "Backslash", label: "\\", width: "w-20" } // Backslash
  ],

  [ // Row 3
    { eventCode: "CapsLock", label: "Caps", width: "w-24" },
    { eventCode: "KeyA", label: "A" }, { eventCode: "KeyS", label: "S" }, { eventCode: "KeyD", label: "D" }, { eventCode: "KeyF", label: "F" },
    { eventCode: "KeyG", label: "G" }, { eventCode: "KeyH", label: "H" }, { eventCode: "KeyJ", label: "J" }, { eventCode: "KeyK", label: "K" },
    { eventCode: "KeyL", label: "L" }, { eventCode: "Semicolon", label: ";" }, { eventCode: "Quote", label: "'" }, { eventCode: "Enter", label: "↩", width: "w-28" } // Enter
  ],

  [ // Row 4
    { eventCode: "ShiftLeft", label: "SHIFT", width: "w-32" }, { eventCode: "KeyZ", label: "Z" }, { eventCode: "KeyX", label: "X" },
    { eventCode: "KeyC", label: "C" }, { eventCode: "KeyV", label: "V" }, { eventCode: "KeyB", label: "B" }, { eventCode: "KeyN", label: "N" }, { eventCode: "KeyM", label: "M" },
    { eventCode: "Comma", label: "," }, { eventCode: "Period", label: "." }, { eventCode: "Slash", label: "/" }, { eventCode: "ShiftRight", label: "SHIFT", width: "w-36" },
    // { eventCode: "ArrowUp", label: "↑", width: "w-20" },
  ],

  [ // Row 5
    { eventCode: "ControlLeft", label:"CTRL", width: "w-20" }, { eventCode: "MetaLeft", label: "WIN", width: "w-20" }, { eventCode: "AltLeft", label: "ALT", width: "w-20" },
    { eventCode: "Space", label:"_", width: "w-[310px]" },
    { eventCode: "AltRight", label: "ALT", width: "w-20" }, { eventCode: "MetaRight", label: "WIN", width: "w-20" }, { eventCode: "ControlRight", label:"CTRL", width: "w-20" },
    // { eventCode: "ArrowLeft", label: "←", width: "w-20" }, { eventCode: "ArrowDown", label: "↓", width: "w-20" }, { eventCode: "ArrowRight", label:"→", width: "w-20" },
  ],
];

const clusterKeys = [
  [ // Navigation block
    { eventCode: "Insert", label: "Ins", width: "w-16 mt-20" },
    { eventCode: "Home", label: "Home", width: "w-16 mt-20" },
    { eventCode: "PageUp", label: "PgUp", width: "w-16 mt-20" },
  ],
  [
    { eventCode: "Delete", label: "Del", width: "w-16" },
    { eventCode: "End", label: "End", width: "w-16" },
    { eventCode: "PageDown", label: "PgDn", width: "w-16" },
  ],
  [
    { eventCode: "ArrowUp", label: "↑", width: "w-16 mt-12" },
  ],
  [
    { eventCode: "ArrowLeft", label: "←", width: "w-16" },
    { eventCode: "ArrowDown", label: "↓", width: "w-16" },
    { eventCode: "ArrowRight", label: "→", width: "w-16" },
  ],
];

const numpadKeys = [
  [ // Top row
    { eventCode: "NumLock", label: "Num", width:"w-12 mt-20"},
    { eventCode: "NumpadDivide", label: "/", width:"w-12 mt-20" },
    { eventCode: "NumpadMultiply", label: "*", width:"w-12 mt-20" },
    { eventCode: "NumpadSubtract", label: "-", width:"w-12 mt-20" },
  ],
  [
    { eventCode: "Numpad7", label: "7" },
    { eventCode: "Numpad8", label: "8" },
    { eventCode: "Numpad9", label: "9" },
    { eventCode: "NumpadSubtract", label: "-"},
  ],
  [
    { eventCode: "Numpad4", label: "4" },
    { eventCode: "Numpad5", label: "5" },
    { eventCode: "Numpad6", label: "6" },
    { eventCode: "NumpadMultiply", label: "*"},
  ],
  [
    { eventCode: "Numpad1", label: "1" },
    { eventCode: "Numpad2", label: "2" },
    { eventCode: "Numpad3", label: "3" },
    { eventCode: "NumpadDivide", label: "/"},
  ],
  [
    { eventCode: "Numpad0", label: "0"},
    { eventCode: "NumpadDecimal", label: "." },
    { eventCode: "NumpadAdd", label: "+", width: "w-[104px]" },
  ],
];


const modifierKeyCodes = [
    "ShiftLeft",
    "ShiftRight",
    "ControlLeft",
    "ControlRight",
    "AltLeft",
    "AltRight",
    "MetaLeft", // Windows key on Windows, Command key on macOS
    "MetaRight",
];

const keyLabelMap = {};
[keys, clusterKeys, numpadKeys].forEach((section) => {
    section.forEach((row) => {
        row.forEach(({ eventCode, label }) => {
            keyLabelMap[eventCode] = label || eventCode;
        });
    });
});

const MAX_HISTORY_LENGTH = 23;
const HISTORY_DURATION = 3000;
const COMBO_COOLDOWN = 200; // minimum ms before logging same combo again
const DEBOUNCE_DURATION = 300; // in ms

const Keyboard = ({ listenerRef, deviceStatus }) => {
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

    function ShowKeyboardButton() {
        const handleToggle = () => setShowKeyboard((prev) => !prev);

        return (
            <Button
                variant="outlined"
                onClick={handleToggle}
                className={`p-3 border border-hover text-text 
                    ${showKeyboard ? "bg-white text-shelf" : "bg-shelf "}`}
            >
                Keyboard
            </Button>
        );
    }

    // Return a list of all keys that have been pressed for >= DEBOUNCE_DURATION
    const getDebouncedKeys = () => {
        const now = Date.now();
        return [...activeKeysRef.current].filter((k) => now - keyPressTimestamps.current[k] >= DEBOUNCE_DURATION);
    };

    // Handle keypresses
    useEffect(() => {
        // If component is not attached to anything, return
        const node = listenerRef?.current;
        if (!node) return;

        const handleKeyDown = (e) => {
            const key = e.code; // Translate " " to "SPACE"

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

                const sortedCombo = validKeys
                    .map((code) => keyLabelMap[code] || code)
                    .sort()
                    .join("+");

                // Check if a bigger combo including this combo was recently logged
                const isSubsetOfRecentCombo = Object.keys(comboTimestamps.current).some((combo) => {
                    if (now - comboTimestamps.current[combo] > COMBO_COOLDOWN) return false;

                    const comboKeys = combo.split("+");

                    // Check if validKeys is a subset of comboKeys
                    return validKeys.every((k) => comboKeys.includes(k)) && comboKeys.length > validKeys.length;
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
            const key = e.code;
            const pressTime = keyPressTimestamps.current[key];
            const now = Date.now();

            const wasQuickTap = pressTime && now - pressTime < DEBOUNCE_DURATION;

            delete keyPressTimestamps.current[key];

            // Snapshot active keys *before* deleting the current key
            const tempActiveKeys = new Set(activeKeysRef.current);
            tempActiveKeys.delete(key);

            // If it's a quick tap, record the combo using remaining modifiers
            if (wasQuickTap) {
                const modifiers = [...tempActiveKeys].filter((k) => modifierKeyCodes.includes(k));

                const comboKeys = [...modifiers, key].sort();
                const sortedCombo = comboKeys.map((k) => keyLabelMap[k] || k).join("+");

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
                {/* Keyboard Layouts */}
                <div className={`flex flex-row justify-center space-x-8 flex-[2] ${showKeyboard ? "" : "hidden"}`}>
                    {/* TKL keys */}
                    <div className="flex flex-col space-y-2">
                        {keys.map((row, rowIndex) => (
                            <div key={rowIndex} className="flex justify-center">
                                {row.map(({ eventCode, width, label }) => (
                                    <div
                                        key={eventCode}
                                        className={`${
                                            width ?? "w-12"
                                        } h-12 mx-1 border-2 border-hover flex items-center justify-center text-lg rounded-lg ${
                                            rowIndex === 0 ? "mb-5" : ""
                                        } ${isKeyActive(eventCode) ? backgroundColor : "bg-black"}`}
                                    >
                                        {label}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>

                    {/* Cluster keys */}
                    <div className="flex flex-col space-y-2 hidden lg:block">
                        {clusterKeys.map((row, rowIndex) => (
                            <div key={rowIndex} className="flex justify-center">
                                {row.map(({ eventCode, width, label }) => (
                                    <div
                                        key={eventCode}
                                        className={`${
                                            width ?? "w-12"
                                        } h-12 mx-1 border-2 border-hover flex items-center justify-center text-lg rounded-lg ${
                                            isKeyActive(eventCode) ? backgroundColor : "bg-black"
                                        }`}
                                    >
                                        {label}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>

                    {/* Numpad keys */}
                    <div className="flex flex-col space-y-2 hidden xl:block">
                        {numpadKeys.map((row, rowIndex) => (
                            <div key={rowIndex} className="flex justify-center">
                                {row.map(({ eventCode, width, label }) => (
                                    <div
                                        key={eventCode}
                                        className={`${
                                            width ?? "w-12"
                                        } h-12 mx-1 border-2 border-hover flex items-center justify-center text-lg rounded-lg ${
                                            isKeyActive(eventCode) ? backgroundColor : "bg-black"
                                        }`}
                                    >
                                        {label}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Command History Container Styling */}
                <div className="rounded-lg bg-shelf px-2 py-2 mt-4 min-h-12 w-full max-w-full overflow-x-hidden">
                    {/* Command History Container Function */}
                    <div className="flex flex-nowrap space-x-2">
                        <ShowKeyboardButton />
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
