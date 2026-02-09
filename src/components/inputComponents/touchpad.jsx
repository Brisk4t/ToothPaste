import React, { useState, useRef, useEffect } from "react";
import { Typography } from "@material-tailwind/react";
import { KeyboardShortcutButton, KeyboardShortcutCarousel, ClickButtonGroup } from "../shared/buttons";
import { TOUCHPAD_SHORTCUTS } from "./sharedComponents";
import { ArrowUpOnSquareStackIcon, CursorArrowRaysIcon } from "@heroicons/react/24/outline";

export default function Touchpad({
    captureMouse,
    commandPassthrough,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onSendMouseClick,
    onSendKeyboardShortcut,
    leftButtonColumn,
    rightButtonColumn,
}) {
    // Mouse button configuration and handlers
    const MOUSE_BUTTONS = [
        { id: 'left', label: 'Left', flex: 2, rounded: 'rounded-bl-xl' },
        { id: 'mid', label: 'Mid', flex: 1, rounded: '' },
        { id: 'right', label: 'Right', flex: 2, rounded: 'rounded-br-xl' }
    ];

    const MOUSE_PRESS_MAP = {
        'left': [1, 0],
        'mid': [0, 0],
        'right': [0, 1]
    };

    const MOUSE_RELEASE_MAP = {
        'left': [2, 0],
        'mid': [0, 0],
        'right': [0, 2]
    };

    const handleMouseButtonPress = (buttonId) => {
        if (!captureMouse) return;
        const [leftClick, rightClick] = MOUSE_PRESS_MAP[buttonId];
        onSendMouseClick(leftClick, rightClick);
    };

    const handleMouseButtonRelease = (buttonId) => {
        if (!captureMouse) return;
        const [leftClick, rightClick] = MOUSE_RELEASE_MAP[buttonId];
        onSendMouseClick(leftClick, rightClick);
    };

    return (
        <div className="xl:hidden flex flex-col flex-1 my-4 rounded-xl transition-all border border-hover bg-shelf relative group overflow-hidden">
            <div className="absolute top-2 left-2 z-10">
                {leftButtonColumn}
            </div>
            
            <div className="absolute top-2 right-2 z-10">
                {rightButtonColumn}
            </div>

            <div className="flex items-center justify-center opacity-70 pointer-events-none select-none text-text p-4 whitespace-pre-wrap absolute left-0 right-0 top-1/2 -translate-y-1/2 w-full z-10 text-center gap-1">
                <CursorArrowRaysIcon className="h-10 w-10 opacity-70 text-text" />
                <Typography
                    type="h6"
                    className="font-light"
                    aria-hidden="true"
                >
                    {captureMouse ? "Drag to move cursor" : "Enable Mouse Capture To Use Touchpad"}
                </Typography>
            </div>

            {captureMouse && (
                <Typography
                    type="h6"
                    className="flex items-center justify-center mt-2 opacity-70 pointer-events-none select-none text-text whitespace-pre-wrap font-light absolute left-0 right-0 top-1/2 translate-y-3 w-full z-10 text-center"
                    aria-hidden="true"
                >
                    Double Tap to Click
                </Typography>
            )}

            {/* Mobile touch surface */}
            <div
                className={`absolute inset-0 rounded-t-xl z-5 touch-none top-0 bottom-16 ${captureMouse ? "bg-background" : ""}`}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onTouchCancel={onTouchEnd}
            />

            {/* Keyboard Shortcuts Carousel */}
            {commandPassthrough ? (
                <div className="absolute bottom-16 left-0 right-0 z-20">
                    <KeyboardShortcutCarousel shortcuts={TOUCHPAD_SHORTCUTS} onSendKeyboardShortcut={onSendKeyboardShortcut} />
                </div>
            ) : (
                <div className="flex items-center justify-center opacity-70 pointer-events-none select-none text-text p-2 whitespace-pre-wrap absolute bottom-16 left-0 right-0 w-full z-20 mb-2"
                    >
                    <ArrowUpOnSquareStackIcon className="h-6 w-6 opacity-70 mr-2" />
                    <Typography
                        type="small"
                        className="font-light"
                        aria-hidden="true"
                    >
                        Enable Command Passthrough to use shortcuts
                    </Typography>
                </div>
            )}

            {/* Mobile Click Buttons - 2:1:2 ratio */}
            <ClickButtonGroup
                buttons={MOUSE_BUTTONS}
                onButtonPress={handleMouseButtonPress}
                onButtonRelease={handleMouseButtonRelease}
            />
        </div>
    );
}
