import React from "react";
import { Typography } from "@material-tailwind/react";
import { LeftButtonColumn, RightButtonColumn, SHORTCUTS_MENU } from "./sharedComponents";
import {
    CursorArrowRaysIcon,
    ArrowUpOnSquareStackIcon,
    CursorArrowRippleIcon,
    ArrowDownOnSquareStackIcon,
    EllipsisVerticalIcon,
} from "@heroicons/react/24/outline";

const STATUS_MESSAGES = {
    MOUSE_CAPTURE: {
        text: "Mouse capture is enabled, hold CTRL to pause tracking (hint: use this like 'lifting your finger off a touchpad')",
        icon: <CursorArrowRaysIcon className="w-5 h-5 text-white" />
    },
    COMMAND_PASSTHROUGH_ON: {
        text: "Keyboard shortcuts will be sent to the remote device",
        icon: <ArrowUpOnSquareStackIcon className="w-5 h-5 text-white" />
    },
    COMMAND_PASSTHROUGH_OFF: {
        text: "Keyboard shortcuts will be used by this device",
        icon: <ArrowDownOnSquareStackIcon className="w-5 h-5 text-white" />
    },
    MOUSE_JIGGLE: {
        text: "Mouse is jiggling to prevent sleep",
        icon: <CursorArrowRippleIcon className="w-5 h-5 text-white" />
    }
};

export default function KeyboardMouse({
    inputRef,
    handleKeyDown,
    handleKeyUp,
    handlePaste,
    handleOnBeforeInput,
    handleCompositionStart,
    handleCompositionEnd,
    handleOnChange,
    captureMouse,
    setCaptureMouse,
    commandPassthrough,
    setCommandPassthrough,
    jiggling,
    setJiggling,
    isFocused,
    setIsFocused,
    status,
    sendEncrypted,
    onMouseDown,
    onMouseUp,
    onPointerCancel,
    onPointerMove,
    onWheel,
    ctrlPressed,
    sendKeyboardShortcut,
    sendMouseReport,
}) {
    const StatusMessagesDisplay = () => {
        const messages = [];
        
        if (captureMouse) {
            messages.push(STATUS_MESSAGES.MOUSE_CAPTURE);
        }
        
        if (commandPassthrough) {
            messages.push(STATUS_MESSAGES.COMMAND_PASSTHROUGH_ON);
        } else {
            messages.push(STATUS_MESSAGES.COMMAND_PASSTHROUGH_OFF);
        }

        if (jiggling) {
            messages.push(STATUS_MESSAGES.MOUSE_JIGGLE);
        }

        return messages.map((msgObj, idx) => (
            <div key={idx} className="flex items-center gap-2 justify-center">
                {msgObj.icon && (
                    <span className="flex-shrink-0">
                        {msgObj.icon}
                    </span>
                )}
                <Typography
                    type="h5"
                    className="font-light font-header"
                    aria-hidden="true"
                >
                    {msgObj.text}
                </Typography>
            </div>
        ));
    };
    return (
        <div className="hidden xl:flex flex-col flex-1 my-4 rounded-xl transition-all 
        border border-ash bg-ink
        focus-within:border-ash focus-within:bg-background 
        relative group">

            <div className="absolute top-2 left-2 z-10">
                <LeftButtonColumn status={status} sendEncrypted={sendEncrypted} />
            </div>

            <div className="absolute top-2 right-2 z-10">
                <RightButtonColumn
                    captureMouse={captureMouse}
                    setCaptureMouse={setCaptureMouse}
                    commandPassthrough={commandPassthrough}
                    setCommandPassthrough={setCommandPassthrough}
                    jiggling={jiggling}
                    setJiggling={setJiggling}
                    status={status}
                    sendEncrypted={sendEncrypted}
                    sendKeyboardShortcut={sendKeyboardShortcut}
                />
            </div>

            <Typography
                type="h5"
                className="flex items-center justify-center opacity-70 pointer-events-none select-none text-white p-4 whitespace-pre-wrap font-light font-header absolute inset-0 z-0 group-focus-within:hidden"
                aria-hidden="true"
            >
                Click here to start sending keystrokes in real time (kinda...)
            </Typography>

            <div className="hidden group-focus-within:flex opacity-70 items-center justify-center pointer-events-none select-none text-white p-4 whitespace-pre-wrap absolute inset-0 z-0 text-center flex-col gap-16">
                <Typography
                    type="h5"
                    className="font-light font-header"
                    aria-hidden="true"
                >
                    Capturing inputs...
                </Typography>
            </div>

            <div className="flex opacity-70 items-center justify-center pointer-events-none select-none text-white p-4 whitespace-pre-wrap absolute bottom-4 left-4 right-4 z-20 text-center flex-col gap-2">
                <StatusMessagesDisplay />
            </div>
            
            {/* Hidden input for event capture */}
            <input
                id="live-capture-input"
                ref={inputRef}
                autoCapitalize="none"
                type="text"
                inputMode="text"
                name="user_input"
                autoComplete="off"
                spellCheck="false"
                data-lpignore="true"
                // Focus handlers
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                // Keyboard event handlers
                onKeyDown={handleKeyDown}
                onKeyUp={handleKeyUp}
                onPaste={handlePaste}
                // Mouse event handlers
                onMouseDown={onMouseDown}
                onMouseUp={onMouseUp}
                onPointerMove={onPointerMove}
                onPointerCancel={onPointerCancel}
                onBeforeInput={handleOnBeforeInput}
                onWheel={onWheel}
                onContextMenu={(e) => e.preventDefault()}
                // IME event handlers
                onChange={handleOnChange}
                onCompositionStart={handleCompositionStart}
                onCompositionUpdate={() => {}}
                onCompositionEnd={handleCompositionEnd}
                className="absolute inset-0 opacity-0 cursor-text pointer-events-auto"
            ></input>

            {/* Event routing overlay div */}
            <div className="absolute inset-0 rounded-xl z-5 pointer-events-none" />
        </div>
    );
}
