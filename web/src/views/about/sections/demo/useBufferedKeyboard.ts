import { useRef } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';

// A stripped-down version of the buffer-based capture in
// `services/inputHandlers/liveCaptureHooks.ts` (intercept keydown, manually
// build a text buffer, handle Backspace/Enter/Tab as special cases) minus the
// BLE transport, debouncing, and IME handling that don't apply to this demo.
export function useBufferedKeyboard(value: string, onChange: (next: string) => void) {
    const bufferRef = useRef(value);
    bufferRef.current = value;

    function commit(next: string) {
        bufferRef.current = next;
        onChange(next);
    }

    function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
        e.preventDefault();

        // Ignore modifier combos (Ctrl+C, Cmd+V, etc.) entirely, mirroring handleCombo's
        // "don't touch the buffer for shortcuts" behavior.
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
                return;
        }
    }

    function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
        e.preventDefault();
        commit(bufferRef.current + e.clipboardData.getData('text'));
    }

    return { handleKeyDown, handlePaste };
}
