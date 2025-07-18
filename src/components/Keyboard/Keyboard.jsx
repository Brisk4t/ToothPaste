import React, { useEffect, useState, useRef } from "react";

const keys = [
    [ // Row 1
        { label: "~" }, { label: "1" }, { label: "2" }, { label: "3" },
        { label: "4" }, { label: "5" }, { label: "6" }, { label: "7" },
        { label: "8" }, { label: "9" }, { label: "0" }, { label: "-" },
        { label: "=" }, { label: "←", width: "w-16" } // Backspace
    ],
    [ // Row 2
        { label: "Tab", width: "w-16" }, { label: "Q" }, { label: "W" }, { label: "E" },
        { label: "R" }, { label: "T" }, { label: "Y" }, { label: "U" },
        { label: "I" }, { label: "O" }, { label: "P" }, { label: "[" },
        { label: "]" }, { label: "\\", width: "w-16" } // Backslash
    ],
    [ // Row 3
        { label: "A" }, { label: "S" }, { label: "D" }, { label: "F" },
        { label: "G" }, { label: "H" }, { label: "J" }, { label: "K" },
        { label: "L" }, { label: ";" }, { label: "'" }, { label: "↩", width: "w-20" } // Enter
    ],
    [ // Row 4
        { label: "SHIFT", width: "w-20" }, { label: "Z" }, { label: "X" },
        { label: "C" }, { label: "V" }, { label: "B" }, { label: "N" },
        { label: "M" }, { label: "," }, { label: "." }, { label: "/" }, { label: "SHIFT", width: "w-20" }
    ],
    [ // Row 5
        { label: "CONTROL", width: "w-32" }, { label: "WIN" }, { label: "ALT" },
        { label: "SPACE", width: "w-80" },
        { label: "ALT"}, { label: "WIN" }, { label: "CONTROL", width: "w-32" },
    ],

];

const MAX_HISTORY_LENGTH = keys[0].length;
const HISTORY_DURATION = 3000;

const Keyboard = () => {
    const [activeKeys, setActiveKeys] = useState(new Set());
    const [history, setHistory] = useState([]);
    const timeoutsRef = useRef({});
    const lastComboRef = useRef(null);

    useEffect(() => {
        const handleKeyDown = (e) => {
            const key = e.key === " " ? "SPACE" : e.key.toUpperCase();

            setActiveKeys((prevKeys) => {
                const updated = new Set(prevKeys);
                updated.add(key);
                const sortedCombo = Array.from(updated).sort().join("+");

                if (sortedCombo !== lastComboRef.current) {
                    lastComboRef.current = sortedCombo;
                    const newEntry = { key: sortedCombo, id: Date.now() };
                    setHistory((prev) =>
                        [...prev, newEntry].slice(-MAX_HISTORY_LENGTH)
                    );

                    const id = newEntry.id;
                    timeoutsRef.current[id] = setTimeout(() => {
                        setHistory((prev) =>
                            prev.filter((entry) => entry.id !== id)
                        );
                        delete timeoutsRef.current[id];
                    }, HISTORY_DURATION);
                }

                return updated;
            });
        };

        const handleKeyUp = (e) => {
            const key = e.key === " " ? "SPACE" : e.key.toUpperCase();
            setActiveKeys((prevKeys) => {
                const updated = new Set(prevKeys);
                updated.delete(key);
                lastComboRef.current = null;
                return updated;
            });
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            Object.values(timeoutsRef.current).forEach(clearTimeout);
        };
    }, []);

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
                            className={`${
                                width ?? "w-12"
                            } h-12 border border-2 border-hover flex items-center justify-center text-lg rounded-lg ${
                                isKeyActive(label.toUpperCase())
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
