import { useRef } from 'react';

// Shared "current buffer + commit" plumbing used by the demo's keyboard capture hooks.
export function useTextBuffer(value: string, onChange: (next: string) => void) {
    const bufferRef = useRef(value);
    bufferRef.current = value;

    function commit(next: string) {
        bufferRef.current = next;
        onChange(next);
    }

    return { bufferRef, commit };
}
