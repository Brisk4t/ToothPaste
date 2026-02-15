import React from "react";
import {
    PowerIcon,
    PlayPauseIcon,
    ChevronDoubleUpIcon,
    ChevronDoubleDownIcon,
    ForwardIcon,
    BackwardIcon,
    CursorArrowRaysIcon,
    ArrowUpOnSquareStackIcon,
    CursorArrowRippleIcon,
    EllipsisVerticalIcon,
} from "@heroicons/react/24/outline";
import { MediaToggleButton, IconToggleButton } from "../shared/buttons";
import { keyboardHandler } from "../../services/inputHandlers/keyboardHandler";
import { createMouseJigglePacket } from "../../services/packetService/packetFunctions";

// Shortcut definitions
export const SHORTCUTS_MENU = [
    { label: "Ctrl+A", keys: ["Control", "a"] },
    { label: "Ctrl+C", keys: ["Control", "c"] },
    { label: "Ctrl+V", keys: ["Control", "v"] },
    { label: "Ctrl+X", keys: ["Control", "x"] },
    { label: "Delete", keys: ["Delete"] },
    { label: "Ctrl+Z", keys: ["Control", "z"] },
    { label: "Ctrl+Y", keys: ["Control", "y"] },
    { label: "Ctrl+S", keys: ["Control", "s"] },
    { label: "Alt+Tab", keys: ["Alt", "Tab"] },
    { label: "Esc", keys: ["Escape"] },
    { label: "Ctrl+Alt+Del", keys: ["Control", "Alt", "Delete"] },
    { label: "Ctrl+Shift+Esc", keys: ["Control", "Shift", "Escape"] },
    { label: "Win+V", keys: ["Meta", "v"] },
    { label: "Win+Shift+S", keys: ["Meta", "Shift", "s"] },
    { label: "Enter", keys: ["Enter"] },
];

// Key composition buttons for building custom key combos
export const KEY_COMPOSER_BUTTONS = [
    // Modifiers
    { label: "Ctrl", key: "Control", type: "modifier" },
    { label: "Shift", key: "Shift", type: "modifier" },
    { label: "Alt", key: "Alt", type: "modifier" },
    { label: "Win", key: "Meta", type: "modifier" },
    // Navigation
    { label: "↑", key: "ArrowUp", type: "navigation" },
    { label: "↓", key: "ArrowDown", type: "navigation" },
    { label: "←", key: "ArrowLeft", type: "navigation" },
    { label: "→", key: "ArrowRight", type: "navigation" },
    // Common keys
    { label: "Home", key: "Home", type: "common" },
    { label: "End", key: "End", type: "common" },
    { label: "PgUp", key: "PageUp", type: "common" },
    { label: "PgDn", key: "PageDown", type: "common" },
    { label: "Del", key: "Delete", type: "common" },
    { label: "Esc", key: "Escape", type: "common" },
    { label: "Tab", key: "Tab", type: "common" },
    { label: "Enter", key: "Enter", type: "common" },
];

/**
 * Key composition component that allows users to build custom key combinations
 * by selecting modifier and navigation keys, then sending them
 * Uses carousel-style swiping to limit buttons per slide
 */
export function KeyComposer({ onSendKeyboardShortcut }) {
    const [selectedKeys, setSelectedKeys] = React.useState([]);
    const [currentSlide, setCurrentSlide] = React.useState(0);
    const pointerStart = React.useRef({ x: 0, y: 0 });
    const composerRef = React.useRef(null);
    const wasSwipe = React.useRef(false);
    const SWIPE_THRESHOLD = 50;
    const ASPECT_RATIO = 2;
    const BUTTONS_PER_SLIDE = 5;

    // Organize buttons into slides
    const buttonSlides = React.useMemo(() => {
        const slides = [];
        for (let i = 0; i < KEY_COMPOSER_BUTTONS.length; i += BUTTONS_PER_SLIDE) {
            slides.push(KEY_COMPOSER_BUTTONS.slice(i, i + BUTTONS_PER_SLIDE));
        }
        return slides;
    }, []);

    const toggleKey = (key) => {
        setSelectedKeys(prev => {
            if (prev.includes(key)) {
                return prev.filter(k => k !== key);
            } else {
                return [...prev, key];
            }
        });
    };

    const clearKeys = () => {
        setSelectedKeys([]);
    };

    const sendCombination = () => {
        if (selectedKeys.length > 0) {
            onSendKeyboardShortcut(selectedKeys);
            clearKeys();
        }
    };

    const getDisplayLabel = (key) => {
        const button = KEY_COMPOSER_BUTTONS.find(b => b.key === key);
        return button?.label || key;
    };

    const compositionDisplay = selectedKeys.length > 0 
        ? selectedKeys.map(getDisplayLabel).join("+")
        : "No keys selected";

    const handlePointerDown = (e) => {
        pointerStart.current = {
            x: e.clientX || e.touches?.[0].clientX,
            y: e.clientY || e.touches?.[0].clientY
        };
        wasSwipe.current = false;
    };

    const handlePointerMove = (e) => {
        const currentX = e.clientX || e.touches?.[0].clientX;
        const currentY = e.clientY || e.touches?.[0].clientY;
        
        const deltaX = Math.abs(currentX - pointerStart.current.x);
        const deltaY = Math.abs(currentY - pointerStart.current.y);
        
        if (deltaX > SWIPE_THRESHOLD && deltaX > deltaY * ASPECT_RATIO) {
            wasSwipe.current = true;
        }
    };

    const handlePointerUp = (e) => {
        const endX = e.clientX || e.changedTouches?.[0].clientX;
        const diff = pointerStart.current.x - endX;

        if (wasSwipe.current) {
            if (diff > 0) {
                // Swiped left - go to next slide
                setCurrentSlide((prev) => (prev + 1) % buttonSlides.length);
            } else {
                // Swiped right - go to previous slide
                setCurrentSlide((prev) => (prev - 1 + buttonSlides.length) % buttonSlides.length);
            }
        }
    };

    // Attach pointer listeners
    React.useEffect(() => {
        const composer = composerRef.current;
        if (!composer) return;

        composer.addEventListener("pointerdown", handlePointerDown);
        composer.addEventListener("pointermove", handlePointerMove);
        composer.addEventListener("pointerup", handlePointerUp);

        return () => {
            composer.removeEventListener("pointerdown", handlePointerDown);
            composer.removeEventListener("pointermove", handlePointerMove);
            composer.removeEventListener("pointerup", handlePointerUp);
        };
    }, [buttonSlides.length]);

    return (
        <div 
            ref={composerRef}
            className="flex flex-col bg-background border border-ash border-b-0 border-x-0 relative select-none"
            style={{ touchAction: 'pan-y' }}
        >
            {/* Key Composer Buttons Carousel */}
            <div className="flex min-h-14 w-full overflow-hidden">
                <div
                    className="flex transition-transform duration-300 ease-out w-full"
                    style={{ transform: `translateX(calc(-${currentSlide} * 100%))` }}
                >
                    {buttonSlides.map((slide, slideIdx) => (
                        <div key={slideIdx} className="flex flex-shrink-0 w-full overflow-hidden">
                            {slide.map((button, btnIdx) => (
                                <React.Fragment key={button.key}>
                                    <button
                                        onClick={() => toggleKey(button.key)}
                                        className={`min-h-14 flex justify-center items-center flex-1 min-w-0 transition-colors cursor-pointer select-none overflow-hidden ${
                                            selectedKeys.includes(button.key)
                                                ? "bg-primary text-white"
                                                : "bg-background text-text hover:bg-white hover:text-ink"
                                        }`}
                                    >
                                        <span className="text-sm font-medium text-center px-1 line-clamp-1">{button.label}</span>
                                    </button>
                                    
                                    {btnIdx < slide.length - 1 && (
                                        <div className="w-px bg-ash" />
                                    )}
                                </React.Fragment>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* Slide indicators */}
            {buttonSlides.length > 1 && (
                <div className="absolute top-0 right-2 flex gap-1 py-1 pointer-events-none">
                    {buttonSlides.map((_, idx) => (
                        <div
                            key={idx}
                            className={`h-1 w-2 rounded-full transition-colors ${
                                idx === currentSlide ? "bg-ash" : "bg-ink"
                            }`}
                        />
                    ))}
                </div>
            )}

            {/* Composition Display with Controls */}
            <div className="flex border-t border-ash rounded-b-xl">
                <div className="flex-1 flex items-center justify-center px-3 py-2 bg-background text-text font-mono text-sm overflow-x-auto whitespace-nowrap">
                    {compositionDisplay}
                </div>
                <div className="w-px bg-ash" />
                <button
                    onClick={sendCombination}
                    disabled={selectedKeys.length === 0}
                    className={`h-12 px-4 flex justify-center items-center font-medium transition-colors ${
                        selectedKeys.length > 0
                            ? "bg-primary text-white hover:bg-blue-700 cursor-pointer"
                            : "bg-ash text-text cursor-not-allowed opacity-50"
                    }`}
                >
                    Send
                </button>
                <div className="w-px bg-ash" />
                <button
                    onClick={clearKeys}
                    className="h-12 px-4 flex justify-center items-center font-medium bg-background text-text hover:bg-white hover:text-ink transition-colors"
                >
                    Clear
                </button>
            </div>
        </div>
    );
}

export function LeftButtonColumn({ status, sendEncrypted }) {
    return (
        <div className="flex flex-col space-y-2">
            <div>
                <MediaToggleButton
                    title="Play / Pause media"
                    onClick={() => {
                        keyboardHandler.sendControlCode(0x00cd, sendEncrypted);
                    }}
                    Icon={PlayPauseIcon}
                    expandDirection="right"
                    connectionStatus={status}
                />
            </div>
            <div>
                <MediaToggleButton
                    title="Volume Up"
                    onClick={() => {
                        keyboardHandler.sendControlCode(0x00e9, sendEncrypted);
                    }}
                    Icon={ChevronDoubleUpIcon}
                    expandDirection="right"
                    connectionStatus={status}
                />
            </div>
            <div>
                <MediaToggleButton
                    title="Volume Down"
                    onClick={() => {
                        keyboardHandler.sendControlCode(0x00ea, sendEncrypted);
                    }}
                    Icon={ChevronDoubleDownIcon}
                    expandDirection="right"
                    connectionStatus={status}
                />
            </div>
            <div>
                <MediaToggleButton
                    title="Next"
                    onClick={() => {
                        keyboardHandler.sendControlCode(0x00b5, sendEncrypted);
                    }}
                    Icon={ForwardIcon}
                    expandDirection="right"
                    connectionStatus={status}
                />
            </div>
            <div>
                <MediaToggleButton
                    title="Previous"
                    onClick={() => {
                        keyboardHandler.sendControlCode(0x00b6, sendEncrypted);
                    }}
                    Icon={BackwardIcon}
                    expandDirection="right"
                    connectionStatus={status}
                />
            </div>
            <div>
                <MediaToggleButton
                    title="Press 'Power' button"
                    Icon={PowerIcon}
                    onClick={() => keyboardHandler.sendControlCode(0x0030, sendEncrypted)}
                    expandDirection="right"
                    connectionStatus={status}
                />
            </div>
        </div>
    );
}

export function RightButtonColumn({
    captureMouse,
    setCaptureMouse,
    commandPassthrough,
    setCommandPassthrough,
    jiggling,
    setJiggling,
    status,
    sendEncrypted,
    sendKeyboardShortcut,
}) {
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);

    function CaptureMouseButton() {
        const handleToggle = () => setCaptureMouse((prev) => !prev);

        return (
            <IconToggleButton
                title="Enable / Disable mouse capture"
                toggled={captureMouse}
                onClick={handleToggle}
                Icon={CursorArrowRaysIcon}
                hoverText="Enable / Disable mouse capture"
                connectionStatus={status}
            />
        );
    }

    function CommandPassthroughButton() {
        const handleToggle = () => setCommandPassthrough((prev) => !prev);
        return (
            <IconToggleButton
                title="Capture Shortcuts"
                toggled={commandPassthrough}
                onClick={handleToggle}
                Icon={ArrowUpOnSquareStackIcon}
                hoverText="Capture Shortcuts (e.g. Ctrl+V)"
                connectionStatus={status}
            />
        );
    }

    function MouseJiggleButton() {
        const handleToggle = () => {
            const mouseJigglePacket = createMouseJigglePacket(!jiggling);
            sendEncrypted(mouseJigglePacket);
            setJiggling((prev) => !prev);
        };

        return (
            <IconToggleButton
                title="Start / Stop Mouse Jiggling"
                toggled={jiggling}
                onClick={handleToggle}
                Icon={CursorArrowRippleIcon}
                hoverText="Start / Stop Mouse Jiggling"
                connectionStatus={status}
            />
        );
    }

    function ShortcutsMenuButton() {
        return (
            <div className="relative">
                <IconToggleButton
                    title="Shortcuts Menu"
                    toggled={isMenuOpen}
                    onClick={() => setIsMenuOpen((prev) => !prev)}
                    Icon={EllipsisVerticalIcon}
                    hoverText="Shortcuts"
                    connectionStatus={status}
                />
                {isMenuOpen && (
                    <div
                        className="absolute right-0 top-12 rounded-lg z-50 w-48 max-h-80 overflow-y-auto p-2 border-2 border-ash"
                        style={{ scrollbarColor: "#555 transparent" }}
                    >
                        <div className="flex flex-col gap-2">
                            {SHORTCUTS_MENU.map((shortcut, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => {
                                        sendKeyboardShortcut(shortcut.keys);
                                        setIsMenuOpen(false);
                                    }}
                                    className="w-full font-header px-4 py-2 text-left text-sm font-medium bg-ink text-text rounded-lg border border-ash hover:bg-white hover:text-ink transition-colors"
                                >
                                    {shortcut.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col space-y-2">
            <div>
                <CaptureMouseButton />
            </div>
            <div>
                <CommandPassthroughButton />
            </div>
            <div>
                <MouseJiggleButton />
            </div>
            <div>
                <ShortcutsMenuButton />
            </div>
        </div>
    );
}
