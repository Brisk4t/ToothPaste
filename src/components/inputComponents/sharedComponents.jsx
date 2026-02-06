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

export const TOUCHPAD_SHORTCUTS = [
    [
        { label: "Ctrl+A", keys: ["Control", "a"] },
        { label: "Ctrl+C", keys: ["Control", "c"] },
        { label: "Ctrl+V", keys: ["Control", "v"] },
        { label: "Ctrl+X", keys: ["Control", "x"] },
        { label: "Delete", keys: ["Delete"] },
    ],
    [
        { label: "Ctrl+Z", keys: ["Control", "z"] },
        { label: "Ctrl+Y", keys: ["Control", "y"] },
        { label: "Ctrl+S", keys: ["Control", "s"] },
        { label: "Alt+Tab", keys: ["Alt", "Tab"] },
        { label: "Esc", keys: ["Escape"] },
    ],
    [
        { label: "Ctrl+Alt+Del", keys: ["Control", "Alt", "Delete"] },
        { label: "Ctrl+Shift+Esc", keys: ["Control", "Shift", "Escape"] },
        { label: "Win+V", keys: ["Meta", "v"] },
        { label: "Win+Shift+S", keys: ["Meta", "Shift", "s"] },
        { label: "Enter", keys: ["Enter"] },
    ],
];

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
                        className="absolute right-0 top-12 rounded-lg z-50 w-48 max-h-80 overflow-y-auto p-2 border-2 border-hover"
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
                                    className="w-full px-4 py-2 text-left text-sm font-medium bg-shelf text-text rounded-lg border border-hover hover:bg-white hover:text-shelf transition-colors"
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
