import React, { useState, useRef } from "react";

/**
 * Factory for creating a keyboard shortcut button
 * Used in carousels for touch-based shortcut input
 */
export function KeyboardShortcutButton({ label, keySequence, wasSwipe, onSendKeyboardShortcut }) {
    const [isPressed, setIsPressed] = useState(false);
    const touchStartRef = useRef({ x: 0, y: 0 });
    const isSwiping = useRef(false);
    const MOVEMENT_THRESHOLD = 15; // pixels of movement before considering it a swipe

    const handleTouchStart = (e) => {
        touchStartRef.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY
        };
        isSwiping.current = false;
    };

    const handleTouchMove = (e) => {
        const deltaX = Math.abs(e.touches[0].clientX - touchStartRef.current.x);
        const deltaY = Math.abs(e.touches[0].clientY - touchStartRef.current.y);
        
        if (deltaX > MOVEMENT_THRESHOLD || deltaY > MOVEMENT_THRESHOLD) {
            isSwiping.current = true;
        }
    };

    const handlePress = () => {
        // Don't press if this was a swipe gesture or carousel swipe
        if (isSwiping.current || wasSwipe.current) return;
        
        setIsPressed(true);
        onSendKeyboardShortcut(keySequence);
        setTimeout(() => setIsPressed(false), 100);
    };

    return (
        <button
            className={`min-h-14 flex justify-center items-center flex-1 min-w-0 transition-colors cursor-pointer select-none overflow-hidden ${
                isPressed ? "bg-white text-ink" : "bg-background text-text"
            }`}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handlePress}
            onMouseDown={handlePress}
        >
            <span className="text-sm font-medium text-center px-2 line-clamp-2 break-words">{label}</span>
        </button>
    );
}

/**
 * Factory for creating a keyboard shortcut carousel with swipe navigation
 */
export function KeyboardShortcutCarousel({ shortcuts, onSendKeyboardShortcut }) {
    const [currentSlide, setCurrentSlide] = useState(0);
    const pointerStart = useRef({ x: 0, y: 0 });
    const carouselRef = useRef(null);
    const wasSwipe = useRef(false);
    const SWIPE_THRESHOLD = 50; // minimum horizontal swipe distance in pixels
    const ASPECT_RATIO = 2; // require horizontal movement to be 2x larger than vertical

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
        
        // Only consider it a horizontal swipe if X movement >> Y movement
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
                setCurrentSlide((prev) => (prev + 1) % shortcuts.length);
            } else {
                // Swiped right - go to previous slide
                setCurrentSlide((prev) => (prev - 1 + shortcuts.length) % shortcuts.length);
            }
        }
    };

    // Attach pointer listeners
    React.useEffect(() => {
        const carousel = carouselRef.current;
        if (!carousel) return;

        carousel.addEventListener("pointerdown", handlePointerDown);
        carousel.addEventListener("pointermove", handlePointerMove);
        carousel.addEventListener("pointerup", handlePointerUp);

        return () => {
            carousel.removeEventListener("pointerdown", handlePointerDown);
            carousel.removeEventListener("pointermove", handlePointerMove);
            carousel.removeEventListener("pointerup", handlePointerUp);
        };
    }, [shortcuts.length]);

    return (
        <div
            ref={carouselRef}
            className="flex flex-col bg-background border border-ash border-b-0 border-x-0 relative select-none"
            style={{ touchAction: 'pan-y' }}
        >
            {/* Slide container with animation */}
            <div className="flex min-h-14 w-full">
                <div
                    className="flex transition-transform duration-300 ease-out w-full"
                    style={{ transform: `translateX(calc(-${currentSlide} * 100%))` }}
                >
                    {shortcuts.map((slide, slideIdx) => (
                        <div key={slideIdx} className="flex flex-shrink-0 w-full overflow-hidden">
                            {slide.map((btn, btnIdx) => (
                                <React.Fragment key={btnIdx}>
                                    <KeyboardShortcutButton 
                                        label={btn.label} 
                                        keySequence={btn.keys}
                                        wasSwipe={wasSwipe}
                                        onSendKeyboardShortcut={onSendKeyboardShortcut}
                                    />
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
            <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-1 py-1 px-2 pointer-events-none">
                {shortcuts.map((_, idx) => (
                    <div
                        key={idx}
                        className={`h-1 w-4 rounded-full transition-colors ${
                            idx === currentSlide ? "bg-ash" : "bg-ink"
                        }`}
                        onClick={() => setCurrentSlide(idx)}
                    />
                ))}
            </div>
        </div>
    );
}

/**
 * Generic click button group UI component
 * Handles button press/release states and styling
 * @param {Array} buttons - Array of button configs: { id, label, flex, rounded }
 * @param {Function} onButtonPress - Callback(buttonId) on touch start
 * @param {Function} onButtonRelease - Callback(buttonId) on touch end/cancel
 */
export function ClickButtonGroup({ buttons, onButtonPress, onButtonRelease }) {
    const [pressedButton, setPressedButton] = useState(null);

    const handleButtonPress = (buttonId) => {
        setPressedButton(buttonId);
        onButtonPress(buttonId);
    };

    const handleButtonRelease = (buttonId) => {
        if (pressedButton === buttonId) {
            setPressedButton(null);
        }
        onButtonRelease(buttonId);
    };

    const getButtonClass = (buttonId, rounded) => {
        const isPressed = pressedButton === buttonId;
        const bgColor = isPressed ? "bg-white text-ink" : "bg-ink text-text";
        return `h-16 flex justify-center items-center flex-1 transition-colors cursor-pointer select-none ${bgColor} ${rounded}`;
    };

    return (
        <div className="absolute bottom-0 left-0 right-0 flex rounded-b-xl z-10 border-t border-ash">
            {buttons.map((button, idx) => (
                <React.Fragment key={button.id}>
                    <button
                        className={`flex-[${button.flex}] ${getButtonClass(button.id, button.rounded)}`}
                        onTouchStart={() => handleButtonPress(button.id)}
                        onTouchEnd={() => handleButtonRelease(button.id)}
                        onTouchCancel={() => handleButtonRelease(button.id)}
                    >
                        <span className="text-sm font-medium">{button.label}</span>
                    </button>

                    {/* Divider - skip after last button */}
                    {idx < buttons.length - 1 && (
                        <div className="w-px bg-ash" />
                    )}
                </React.Fragment>
            ))}
        </div>
    );
}

/**
 * Factory for icon toggle buttons with hover text expansion
 * Used for various control buttons (capture, jiggle, etc.)
 */
export function IconToggleButton({
    title, // Tooltip text
    toggled, // Set the button UI state
    onClick, // Click handler
    Icon, // Icon component
    hoverText = "", // Text to show on hover
    className = "", // Additional classes
    expandDirection = "left", // Direction to expand on hover: "left" or "right"
    connectionStatus = 0 // 0 = disconnected, 1+ = connected
}) {
    const [isHovered, setIsHovered] = React.useState(false);
    const [isClicked, setIsClicked] = React.useState(false);

    const handleClick = () => {
        setIsClicked(true);
        onClick();
        setTimeout(() => setIsClicked(false), 100);
    };

    const getButtonStyle = () => {
        const bgColor = "bg-ink";
        const clickBgColor = connectionStatus === 0 ? "bg-secondary" : "bg-primary";
        const positionClass = expandDirection === "right" ? "left-0" : "right-0";
        const flexOrder = expandDirection === "right" ? "" : "flex-row-reverse";

        if (isClicked) {
            return `absolute ${positionClass} top-0 w-auto px-3 ${clickBgColor} text-white ${flexOrder}`;
        }

        if (isHovered) {
            return `absolute ${positionClass} top-0 w-auto px-3 bg-white text-ink ${flexOrder}`;
        }

        return `w-10 ${toggled ? "bg-white text-ink" : `${bgColor} text-text`}`;
    };

    return (
        <div className={`relative w-10 h-10`}>
            <div
                title={title}
                onClick={connectionStatus === 0 ? null : handleClick}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className={`border border-ash h-10 flex justify-center items-center p-2 rounded-lg transition-all ${
                    connectionStatus === 0 ? "cursor-not-allowed" : "cursor-pointer"
                } select-none ${getButtonStyle()} ${className}`}
            >
                {Icon && <Icon className="h-5 w-5" />}
                {(isHovered || isClicked) && hoverText && (
                    <span className="font-header mx-2 whitespace-nowrap text-sm font-medium">
                        {hoverText}
                    </span>
                )}
            </div>
        </div>
    );
}

/**
 * Factory for momentary toggle buttons (visual feedback then reset)
 * Used for media control buttons that don't maintain state
 */
export function MediaToggleButton({ title, onClick, Icon, expandDirection = "left", connectionStatus = 0 }) {
    const [toggled, setToggled] = React.useState(false);

    const handleClick = () => {
        setToggled(true);
        onClick();
        setTimeout(() => setToggled(false), 100);
    };

    return (
        <IconToggleButton
            title={title}
            toggled={toggled}
            onClick={handleClick}
            Icon={Icon}
            hoverText={title}
            expandDirection={expandDirection}
            connectionStatus={connectionStatus}
        />
    );
}
