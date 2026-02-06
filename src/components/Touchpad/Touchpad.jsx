import React, { useState, useRef, useEffect } from "react";
import { Typography } from "@material-tailwind/react";

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
    shortcuts,
}) {
    // Keyboard shortcut button component
    function KeyboardShortcutButton({ label, keySequence, wasSwipe }) {
        const [isPressed, setIsPressed] = useState(false);

        const handlePress = () => {
            // Don't press if this was a swipe gesture
            if (wasSwipe.current) return;
            
            setIsPressed(true);
            onSendKeyboardShortcut(keySequence);
            setTimeout(() => setIsPressed(false), 100);
        };

        return (
            <button
                className={`h-14 flex justify-center items-center flex-1 transition-colors cursor-pointer select-none ${
                    isPressed ? "bg-white text-shelf" : "bg-background text-text"
                }`}
                onTouchStart={handlePress}
                onMouseDown={handlePress}
            >
                <span className="text-sm font-medium text-center px-2 line-clamp-2">{label}</span>
            </button>
        );
    }

    // Carousel row for keyboard shortcuts with custom swipe handling
    function KeyboardShortcutCarousel({ shortcuts }) {
        const [currentSlide, setCurrentSlide] = useState(0);
        const touchStartX = useRef(0);
        const touchEndX = useRef(0);
        const carouselRef = useRef(null);
        const wasSwipe = useRef(false);
        const SWIPE_THRESHOLD = 50; // minimum swipe distance in pixels

        const handleTouchStart = (e) => {
            touchStartX.current = e.touches[0].clientX;
            wasSwipe.current = false;
        };

        const handleTouchMove = (e) => {
            e.preventDefault();
            // Detect if this is a swipe by checking movement distance
            const currentX = e.touches[0].clientX;
            const diff = Math.abs(touchStartX.current - currentX);
            if (diff > SWIPE_THRESHOLD) {
                wasSwipe.current = true;
            }
        };

        const handleTouchEnd = (e) => {
            touchEndX.current = e.changedTouches[0].clientX;
            const diff = touchStartX.current - touchEndX.current;

            if (wasSwipe.current) {
                if (diff > 0) {
                    // Swiped left - go to next slide
                    setCurrentSlide((prev) => (prev + 1) % shortcuts.length);
                } else {
                    // Swiped right - go to previous slide
                    setCurrentSlide((prev) => (prev - 1 + shortcuts.length) % shortcuts.length);
                }
            }
        };

        // Use useEffect to attach non-passive touch listeners
        React.useEffect(() => {
            const carousel = carouselRef.current;
            if (!carousel) return;

            carousel.addEventListener("touchmove", handleTouchMove, { passive: false });

            return () => {
                carousel.removeEventListener("touchmove", handleTouchMove);
            };
        }, []);

        return (
            <div
                ref={carouselRef}
                className="flex flex-col bg-background border border-hover border-b-0 border-x-0 relative"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
            >
                {/* Slide container with animation */}
                <div className="flex h-14 overflow-hidden w-full">
                    <div
                        className="flex transition-transform duration-300 ease-out w-full"
                        style={{ transform: `translateX(calc(-${currentSlide} * 100%))` }}
                    >
                        {shortcuts.map((slide, slideIdx) => (
                            <div key={slideIdx} className="flex flex-shrink-0 w-full">
                                {slide.map((btn, btnIdx) => (
                                    <React.Fragment key={btnIdx}>
                                        <KeyboardShortcutButton 
                                            label={btn.label} 
                                            keySequence={btn.keys}
                                            wasSwipe={wasSwipe}
                                        />
                                        {btnIdx < slide.length - 1 && (
                                            <div className="w-px bg-hover" />
                                        )}
                                    </React.Fragment>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Slide indicators */}
                <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-1 py-1 px-2 pointer-events-none">
                    {shortcuts.map((_, idx) => (
                        <div
                            key={idx}
                            className={`h-1 w-4 rounded-full transition-colors ${
                                idx === currentSlide ? "bg-hover" : "bg-shelf"
                            }`}
                            onClick={() => setCurrentSlide(idx)}
                        />
                    ))}
                </div>
            </div>
        );
    }

    // Mobile click buttons with proper state management
    function MobileClickButtons({ captureMouse, onSendMouseClick }) {
        const [pressedButton, setPressedButton] = useState(null);

        const handleButtonPress = (buttonName, leftClick, rightClick) => {
            if (!captureMouse) return;
            setPressedButton(buttonName);
            onSendMouseClick(leftClick, rightClick);
        };

        const handleButtonRelease = (buttonName, leftClick, rightClick) => {
            if (!captureMouse) return;
            if (pressedButton === buttonName) {
                setPressedButton(null);
            }
            // Send release event
            if (buttonName === 'left') onSendMouseClick(2, 0);
            else if (buttonName === 'right') onSendMouseClick(0, 2);
        };

        const getButtonClass = (buttonName) => {
            const isPressed = pressedButton === buttonName;
            const bgColor = isPressed ? "bg-white text-shelf" : "bg-shelf text-text";
            let rounded = "";
            if (buttonName === 'left') rounded = "rounded-bl-xl";
            else if (buttonName === 'right') rounded = "rounded-br-xl";
            return `h-16 flex justify-center items-center flex-1 transition-colors cursor-pointer select-none ${bgColor} ${rounded}`;
        };

        return (
            <div className="absolute bottom-0 left-0 right-0 flex rounded-b-xl z-10 border-t border-hover">
                {/* Left Click Button - 2 parts */}
                <button
                    className={`flex-[2] ${getButtonClass('left')}`}
                    onTouchStart={() => handleButtonPress('left', 1, 0)}
                    onTouchEnd={() => handleButtonRelease('left', 1, 0)}
                    onTouchCancel={() => handleButtonRelease('left', 1, 0)}
                >
                    <span className="text-sm font-medium">Left</span>
                </button>

                {/* Divider */}
                <div className="w-px bg-hover" />

                {/* Middle Click Button - 1 part */}
                <button
                    className={`flex-[1] ${getButtonClass('mid')}`}
                    onTouchStart={() => handleButtonPress('mid', 0, 0)}
                    onTouchEnd={() => handleButtonRelease('mid', 0, 0)}
                    onTouchCancel={() => handleButtonRelease('mid', 0, 0)}
                >
                    <span className="text-sm font-medium">Mid</span>
                </button>

                {/* Divider */}
                <div className="w-px bg-hover" />

                {/* Right Click Button - 2 parts */}
                <button
                    className={`flex-[2] ${getButtonClass('right')}`}
                    onTouchStart={() => handleButtonPress('right', 0, 1)}
                    onTouchEnd={() => handleButtonRelease('right', 0, 1)}
                    onTouchCancel={() => handleButtonRelease('right', 0, 1)}
                >
                    <span className="text-sm font-medium">Right</span>
                </button>
            </div>
        );
    }

    return (
        <div className="md:hidden flex flex-col flex-1 my-4 rounded-xl transition-all border border-hover bg-shelf relative group overflow-hidden">
            <div className="absolute top-2 left-2 z-10">
                {leftButtonColumn}
            </div>
            
            <div className="absolute top-2 right-2 z-10">
                {rightButtonColumn}
            </div>

            <Typography
                type="h5"
                className="flex items-center justify-center opacity-70 pointer-events-none select-none text-white p-4 whitespace-pre-wrap font-light absolute left-0 right-0 top-1/2 -translate-y-1/2 w-full z-10 text-center"
                aria-hidden="true"
            >
                {captureMouse ? "Drag to move cursor" : "Enable Mouse Capture To Use Touchpad"}
            </Typography>

            {captureMouse && (
                <Typography
                    type="h5"
                    className="flex items-center justify-center opacity-70 pointer-events-none select-none text-white whitespace-pre-wrap font-light absolute left-0 right-0 top-1/2 translate-y-3 w-full z-10 text-center"
                    aria-hidden="true"
                >
                    Double Tap to Click
                </Typography>
            )}

            {/* Mobile touch surface */}
            <div
                className={`absolute inset-0 rounded-t-xl z-5 touch-none top-0 bottom-0 ${captureMouse ? "bg-background" : ""}`}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onTouchCancel={onTouchEnd}
            />

            {/* Keyboard Shortcuts Carousel */}
            {commandPassthrough ? (
                <div className="absolute bottom-16 left-0 right-0 z-20">
                    <KeyboardShortcutCarousel shortcuts={shortcuts} />
                </div>
            ) : (
                <Typography
                    type="small"
                    className="flex items-center justify-center opacity-70 pointer-events-none select-none text-white p-2 whitespace-pre-wrap font-light absolute bottom-16 left-0 right-0 w-full z-20 text-center"
                    aria-hidden="true"
                >
                    Enable Command Passthrough to use shortcuts
                </Typography>
            )}

            {/* Mobile Click Buttons - 2:1:2 ratio */}
            <MobileClickButtons captureMouse={captureMouse} onSendMouseClick={onSendMouseClick} />
        </div>
    );
}
