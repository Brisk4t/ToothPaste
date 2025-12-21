import React, { useEffect, useState, useRef } from "react";
import { Button } from "@material-tailwind/react";
const keys = [
    [
        // Row 0
        { eventCode: "Escape", label: "ESC", width: "w-14" },
        { eventCode: "F1", label: "F1" },
        { eventCode: "F2", label: "F2" },
        { eventCode: "F3", label: "F3" },
        { eventCode: "F4", label: "F4" },
        { eventCode: "F5", label: "F5" },
        { eventCode: "F6", label: "F6" },
        { eventCode: "F7", label: "F7" },
        { eventCode: "F8", label: "F8" },
        { eventCode: "F9", label: "F9" },
        { eventCode: "F10", label: "F10" },
        { eventCode: "F11", label: "F11" },
        { eventCode: "F12", label: "F12" },
        { eventCode: "Backspace", label: "←", width: "w-20 mr-20" }, // Backspace
    ],

    [
        // Row 1
        { eventCode: "Backquote", label: "~" },
        { eventCode: "Digit1", label: "1" },
        { eventCode: "Digit2", label: "2" },
        { eventCode: "Digit3", label: "3" },
        { eventCode: "Digit4", label: "4" },
        { eventCode: "Digit5", label: "5" },
        { eventCode: "Digit6", label: "6" },
        { eventCode: "Digit7", label: "7" },
        { eventCode: "Digit8", label: "8" },
        { eventCode: "Digit9", label: "9" },
        { eventCode: "Digit0", label: "0" },
        { eventCode: "Minus", label: "-" },
        { eventCode: "Equal", label: "=" },
        { eventCode: "Backspace", label: "←", width: "w-20 mr-20" }, // Backspace
    ],

    [
        // Row 2
        { eventCode: "Tab", label: "Tab", width: "w-16" },
        { eventCode: "KeyQ", label: "Q" },
        { eventCode: "KeyW", label: "W" },
        { eventCode: "KeyE", label: "E" },
        { eventCode: "KeyR", label: "R" },
        { eventCode: "KeyT", label: "T" },
        { eventCode: "KeyY", label: "Y" },
        { eventCode: "KeyU", label: "U" },
        { eventCode: "KeyI", label: "I" },
        { eventCode: "KeyO", label: "O" },
        { eventCode: "KeyP", label: "P" },
        { eventCode: "BracketLeft", label: "[" },
        { eventCode: "BracketRight", label: "]" },
        { eventCode: "Backslash", label: "\\", width: "w-16 mr-20" }, // Backslash
    ],

    [
        // Row 3
        { eventCode: "CapsLock", label: "Caps", width: "w-24" },
        { eventCode: "KeyA", label: "A" },
        { eventCode: "KeyS", label: "S" },
        { eventCode: "KeyD", label: "D" },
        { eventCode: "KeyF", label: "F" },
        { eventCode: "KeyG", label: "G" },
        { eventCode: "KeyH", label: "H" },
        { eventCode: "KeyJ", label: "J" },
        { eventCode: "KeyK", label: "K" },
        { eventCode: "KeyL", label: "L" },
        { eventCode: "Semicolon", label: ";" },
        { eventCode: "Quote", label: "'" },
        { eventCode: "Enter", label: "↩", width: "w-24 mr-20" }, // Enter
    ],

    [
        // Row 4
        { eventCode: "ShiftLeft", label: "SHIFT", width: "w-32" },
        { eventCode: "KeyZ", label: "Z" },
        { eventCode: "KeyX", label: "X" },
        { eventCode: "KeyC", label: "C" },
        { eventCode: "KeyV", label: "V" },
        { eventCode: "KeyB", label: "B" },
        { eventCode: "KeyN", label: "N" },
        { eventCode: "KeyM", label: "M" },
        { eventCode: "Comma", label: "," },
        { eventCode: "Period", label: "." },
        { eventCode: "Slash", label: "/" },
        { eventCode: "ShiftRight", label: "SHIFT", width: "w-32 mr-24" },
        { eventCode: "ArrowUp", label: "↑", width: "w-20" },
    ],

    [
        // Row 5
        { eventCode: "ControlLeft", label: "CTRL", width: "w-20 ml-5" },
        { eventCode: "MetaLeft", label: "WIN", width: "w-20" },
        { eventCode: "AltLeft", label: "ALT", width: "w-20" },
        { eventCode: "Space", label: "_", width: "w-[300px]" },
        { eventCode: "AltRight", label: "ALT", width: "w-20" },
        { eventCode: "MetaRight", label: "WIN", width: "w-20" },
        { eventCode: "ControlRight", label: "CTRL", width: "w-20 mr-20" },
        { eventCode: "ArrowLeft", label: "←", width: "w-20" },
        { eventCode: "ArrowDown", label: "↓", width: "w-20" },
        { eventCode: "ArrowRight", label: "→", width: "w-20" },
    ],
];

const MAX_HISTORY_LENGTH = 23;
const HISTORY_DURATION = 3000;
const COMBO_COOLDOWN = 200; // minimum ms before logging same combo again
const DEBOUNCE_DURATION = 500; // in ms

const Keyboard = ({ keyhistoryref, deviceStatus }) => {
    const [activeKeys, setActiveKeys] = useState(new Set());
    const keyPressTimeStamps = useRef(new Map());

    const MODIFIER_KEYS = new Set([
        "ShiftLeft",
        "ShiftRight",
        "ControlLeft",
        "ControlRight",
        "AltLeft",
        "AltRight",
        "MetaLeft",
        "MetaRight",
    ]);
    const heldModifiersAtPress = useRef(new Map());

    const [history, setHistory] = useState([]);

    const [backgroundColor, setBackgroundColor] = useState("");
    const [showKeyboard, setShowKeyboard] = useState(false);

    const keyLabelMap = {};
    keys.flat().forEach(({ eventCode, label }) => {
        keyLabelMap[eventCode] = label || eventCode;
    });

    // Change the key background based on device state
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

    // Button to show or hide the keyboard preview
    function ShowKeyboardButton() {
        const handleToggle = () => setShowKeyboard((prev) => !prev);

        return (
            <Button
                variant="outline"
                onClick={handleToggle}
                className={`p-3 border border-hover text-text 
                    ${showKeyboard ? "bg-white text-shelf" : "bg-shelf "}`}
            >
                Keyboard
            </Button>
        );
    }

    const keysToDisplay = React.useMemo(() => {
        if (!keyhistoryref) return [];
        return keyhistoryref
            .split(/[\+,]/) // split by plus or comma
            .map((k) => k.trim())
            .filter((k) => k.length > 0);
    }, [keyhistoryref]);

    // List to track the pressed buttons to highlight them
    const isKeyActive = (eventCode) => activeKeys.has(eventCode);

    return (
        <div className="w-full">
            {/* Command History Container Styling */}
            <div className="rounded-lg bg-shelf px-2 py-2 mt-4 min-h-12 w-full max-w-full overflow-x-hidden">
                {/* Command History Container Function*/}
                <div className="flex flex-nowrap space-x-2 items-center">
                <div className="shrink-0">
                    <ShowKeyboardButton />
                </div>
                    <div className="flex flex-nowrap overflow-x-hidden space-x-2">
                        {(keyhistoryref ? keyhistoryref.split(",") : []).map((keyStr, i) => (
                        <div
                            key={i}
                            className={`px-2 py-1 flex items-center justify-center text-sm font-bold rounded ${backgroundColor} animate-fadeout`}
                            style={{ animationDuration: `${HISTORY_DURATION}ms` }}
                        >
                            {keyStr.trim()}
                        </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Keyboard;
