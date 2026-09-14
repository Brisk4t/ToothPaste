import { useRef, useState } from 'react';
import type {
    ChangeEvent,
    ClipboardEvent,
    CompositionEvent,
    KeyboardEvent,
    InputEvent as ReactInputEvent,
} from 'react';
import { useTextBuffer } from './useTextBuffer';

// A structural drop-in for services/inputHandlers/liveCaptureHooks.ts's useInputController() -
// same returned shape KeyboardMouse expects, so the real component can be reused verbatim,
// but backed by local buffer state instead of BLE/ECDH so no real device traffic is sent.
export function useMockLiveCaptureInput(value: string, onChange: (next: string) => void) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const ctrlPressed = useRef(false);
    const [commandPassthrough, setCommandPassthrough] = useState(false);
    const { bufferRef, commit } = useTextBuffer(value, onChange);

    function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
        e.preventDefault();

        if (e.key === 'Control') {
            ctrlPressed.current = true;
            return;
        }
        // Ignore shortcuts (Ctrl+C, Cmd+V, etc.) entirely - don't touch the buffer.
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        switch (e.key) {
            case 'Backspace':
                commit(bufferRef.current.slice(0, -1));
                return;
            case 'Enter':
                commit(bufferRef.current + '\n');
                return;
            case 'Tab':
                commit(bufferRef.current + '\t');
                return;
            default:
                if (e.key.length === 1) commit(bufferRef.current + e.key);
        }
    }

    function handleKeyUp(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Control') ctrlPressed.current = false;
    }

    function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
        e.preventDefault();
        commit(bufferRef.current + e.clipboardData.getData('text'));
    }

    // No real IME/autofill target in this demo - kept as no-ops purely so this hook's
    // return shape matches KeyboardMouse's props one-for-one.
    function handleOnBeforeInput(_e: ReactInputEvent<HTMLInputElement>) {}
    function handleCompositionStart(_e: CompositionEvent<HTMLInputElement>) {}
    function handleCompositionEnd(_e: CompositionEvent<HTMLInputElement>) {}
    function handleOnChange(_e: ChangeEvent<HTMLInputElement>) {}

    return {
        inputRef,
        ctrlPressed,
        commandPassthrough,
        setCommandPassthrough,
        handleKeyDown,
        handleKeyUp,
        handlePaste,
        handleOnBeforeInput,
        handleCompositionStart,
        handleCompositionEnd,
        handleOnChange,
    };
}
