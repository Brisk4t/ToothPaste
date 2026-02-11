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
    onSendScroll,
    leftButtonColumn,
    rightButtonColumn,
}) {
    // Multi-touch tracking for scroll
    const lastTwoFingerDistanceRef = useRef(null);
    const touchSurfaceRef = useRef(null);
    const SCROLL_SENSITIVITY = 5; // pixels per scroll unit

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

    const getFingerDistance = (touches) => {
        if (touches.length < 2) return null;
        const dx = touches[1].clientX - touches[0].clientX;
        const dy = touches[1].clientY - touches[0].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    };

    const handleTouchStart = (e) => {
        lastTwoFingerDistanceRef.current = null;
        onTouchStart(e);
    };

    const handleTouchMove = (e) => {
        // Handle 2-finger scroll
        if (e.touches.length === 2 && onSendScroll && captureMouse) {
            e.preventDefault();
            const currentDistance = getFingerDistance(e.touches);
            
            if (lastTwoFingerDistanceRef.current !== null) {
                const delta = lastTwoFingerDistanceRef.current - currentDistance;
                const scrollAmount = Math.round(delta / SCROLL_SENSITIVITY);
                
                if (scrollAmount !== 0) {
                    onSendScroll(scrollAmount);
                }
            }
            
            lastTwoFingerDistanceRef.current = currentDistance;
        } else {
            // Single touch - normal cursor movement
            e.preventDefault();
            lastTwoFingerDistanceRef.current = null;
            onTouchMove(e);
        }
    };

    const handleTouchEnd = (e) => {
        lastTwoFingerDistanceRef.current = null;
        onTouchEnd(e);
    };

    // Attach non-passive event listeners
    useEffect(() => {
        const element = touchSurfaceRef.current;
        if (!element) return;

        element.addEventListener("touchstart", handleTouchStart, { passive: false });
        element.addEventListener("touchmove", handleTouchMove, { passive: false });
        element.addEventListener("touchend", handleTouchEnd, { passive: false });

        return () => {
            element.removeEventListener("touchstart", handleTouchStart);
            element.removeEventListener("touchmove", handleTouchMove);
            element.removeEventListener("touchend", handleTouchEnd);
        };
    }, [captureMouse, onTouchStart, onTouchMove, onTouchEnd, onSendScroll]);

    return (
        <div className="xl:hidden flex flex-col flex-1 my-4 rounded-xl transition-all border border-ash bg-ink relative group overflow-hidden">
            <div className="absolute top-2 left-2 z-10">
                {leftButtonColumn}
            </div>
            
            <div className="absolute top-2 right-2 z-10">
                {rightButtonColumn}
            </div>

            <div className="flex items-center justify-center opacity-70 pointer-events-none select-none text-text p-4 absolute left-0 right-0 top-1/2 -translate-y-1/2 w-full z-10 text-center gap-1">
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
                ref={touchSurfaceRef}
                className={`absolute inset-0 rounded-t-xl z-5 touch-none top-0 bottom-16 ${captureMouse ? "bg-background" : ""}`}
            />

            {/* Keyboard Shortcuts Carousel */}
            {commandPassthrough ? (
                <div className="absolute bottom-16 left-0 right-0 z-20">
                    <KeyboardShortcutCarousel shortcuts={TOUCHPAD_SHORTCUTS} onSendKeyboardShortcut={onSendKeyboardShortcut} />
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center text-center opacity-70 pointer-events-none select-none text-text px-2 py-1 absolute bottom-16 left-2 right-2 z-20 mb-2 gap-1"
                    >
                    <ArrowUpOnSquareStackIcon className="h-5 w-5 opacity-70 flex-shrink-0" />
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
