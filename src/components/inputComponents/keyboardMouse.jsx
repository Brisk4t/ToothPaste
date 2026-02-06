import React from "react";
import { Typography } from "@material-tailwind/react";
import { mouseHandler } from "../../services/inputHandlers/mouseHandler";
import { keyboardHandler } from "../../services/inputHandlers/keyboardHandler";
import { LeftButtonColumn, RightButtonColumn, SHORTCUTS_MENU } from "./sharedComponents";

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
    return (
        <div className="hidden xl:flex flex-col flex-1 my-4 rounded-xl transition-all border border-hover focus-within:border-shelf bg-shelf focus-within:bg-background relative group">
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
                className="flex items-center justify-center opacity-70 pointer-events-none select-none text-white p-4 whitespace-pre-wrap font-light absolute inset-0 z-0 group-focus-within:hidden"
                aria-hidden="true"
            >
                Click here to start sending keystrokes in real time (kinda...)
            </Typography>

            <Typography
                type="h5"
                className=" hidden group-focus-within:flex opacity-70 items-center justify-center pointer-events-none select-none text-white p-4 whitespace-pre-wrap font-light absolute inset-0 z-0 "
                aria-hidden="true"
            >
                Capturing inputs...
            </Typography>

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
