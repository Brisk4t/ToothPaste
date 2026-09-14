import { useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import DesktopBox from './demo/DesktopBox';
import { useBufferedKeyboard } from './demo/useBufferedKeyboard';

interface SectionProps {
    currentSlide: number;
    getSectionOpacity: (index: number) => number;
}

interface Point {
    x: number;
    y: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const DEMO_SLIDE_INDEX = 4;

export default function DemoSection({ currentSlide, getSectionOpacity }: SectionProps) {
    // Shared notepad text - box A owns it, box B just mirrors it
    const [notepadValue, setNotepadValue] = useState('');
    const [notepadOpenA, setNotepadOpenA] = useState(true);
    const [notepadOpenB, setNotepadOpenB] = useState(true);

    // Simulated cursor position (percentage of box B's screen), driven by box A's
    // mouse displacement tracking - the same relative-movement idea used by the
    // real HID mouse reports in LiveCapture, minus the BLE transport.
    const [cursorPos, setCursorPos] = useState<Point>({ x: 50, y: 50 });
    const [clickPulse, setClickPulse] = useState(0);
    const lastPos = useRef<Point | null>(null);
    const isTracking = useRef(false);
    const cursorPosRef = useRef<Point>({ x: 50, y: 50 });
    const hoveredElRef = useRef<HTMLElement | null>(null);
    const boxBScreenRef = useRef<HTMLDivElement | null>(null);

    const { handleKeyDown, handlePaste } = useBufferedKeyboard(notepadValue, setNotepadValue);

    // Find the real interactive element sitting under the mirrored cursor in box B.
    function elementAtCursor(pos: Point): HTMLElement | null {
        const screenEl = boxBScreenRef.current;
        if (!screenEl) return null;

        const rect = screenEl.getBoundingClientRect();
        const x = rect.left + (pos.x / 100) * rect.width;
        const y = rect.top + (pos.y / 100) * rect.height;

        const target = document.elementFromPoint(x, y) as HTMLElement | null;
        return target?.closest('button, textarea, input') ?? null;
    }

    // Since box B never receives a real :hover (the browser cursor is over box A),
    // fake it with a data attribute that mirrors the hover: styles via data-[fake-hover=true]:.
    function updateHoverTarget(pos: Point) {
        const interactive = elementAtCursor(pos);
        if (hoveredElRef.current && hoveredElRef.current !== interactive) {
            hoveredElRef.current.removeAttribute('data-fake-hover');
        }
        interactive?.setAttribute('data-fake-hover', 'true');
        hoveredElRef.current = interactive;
    }

    function handleScreenMouseEnter(e: MouseEvent<HTMLDivElement>) {
        lastPos.current = { x: e.clientX, y: e.clientY };
        isTracking.current = true;
    }

    function handleScreenMouseLeave() {
        isTracking.current = false;
        lastPos.current = null;
        hoveredElRef.current?.removeAttribute('data-fake-hover');
        hoveredElRef.current = null;
    }

    function handleScreenMouseDown() {
        setClickPulse(prev => prev + 1);

        // Drive whatever's actually under the fake cursor, so it can open/close
        // the notepad window etc. just like a real remote-controlled screen.
        const interactive = elementAtCursor(cursorPosRef.current);
        if (!interactive) return;

        if (interactive.tagName === 'TEXTAREA' || interactive.tagName === 'INPUT') {
            interactive.focus();
        } else {
            interactive.click();
        }
    }

    function handleScreenMouseMove(e: MouseEvent<HTMLDivElement>) {
        if (!isTracking.current || !lastPos.current) return;

        const displacementX = e.clientX - lastPos.current.x;
        const displacementY = e.clientY - lastPos.current.y;
        lastPos.current = { x: e.clientX, y: e.clientY };

        const rect = e.currentTarget.getBoundingClientRect();
        const next = {
            x: clamp(cursorPosRef.current.x + (displacementX / rect.width) * 100, 1, 97),
            y: clamp(cursorPosRef.current.y + (displacementY / rect.height) * 100, 3, 94),
        };
        cursorPosRef.current = next;
        setCursorPos(next);
        updateHoverTarget(next);
    }

    return (
        <section
            className="absolute inset-0 flex flex-col px-6 md:px-12 py-12 z-50 bg-none"
            style={{
                opacity: getSectionOpacity(DEMO_SLIDE_INDEX),
                transition: 'opacity 0.3s ease-in-out',
                pointerEvents: getSectionOpacity(DEMO_SLIDE_INDEX) > 0.5 ? 'auto' : 'none',
            }}
        >
            <div className="flex flex-col items-center gap-1 mb-4 md:mb-6 flex-shrink-0 text-center">
                <h2 className="font-header text-2xl md:text-4xl text-text font-bold">Try It Out</h2>
                <p className="font-body text-sm md:text-base text-dust max-w-xl">
                    Move your mouse and type in the notepad on the left - watch it mirror on the right,
                    the same way ToothPaste syncs your keyboard and mouse between devices.
                </p>
            </div>

            <div className="flex-1 flex items-center justify-center min-h-0">
                <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10 w-full max-w-6xl">
                    <DesktopBox
                        label="Your Computer"
                        statusText="mouse + keyboard active"
                        onScreenMouseEnter={handleScreenMouseEnter}
                        onScreenMouseMove={handleScreenMouseMove}
                        onScreenMouseLeave={handleScreenMouseLeave}
                        onScreenMouseDown={handleScreenMouseDown}
                        notepadOpen={notepadOpenA}
                        onNotepadOpenChange={setNotepadOpenA}
                        notepadValue={notepadValue}
                        onNotepadKeyDown={handleKeyDown}
                        onNotepadPaste={handlePaste}
                    />
                    <DesktopBox
                        label="Paired Device"
                        statusText="receiving"
                        screenRef={boxBScreenRef}
                        cursorPos={cursorPos}
                        clickPulse={clickPulse}
                        notepadOpen={notepadOpenB}
                        onNotepadOpenChange={setNotepadOpenB}
                        notepadValue={notepadValue}
                        notepadReadOnly
                    />
                </div>
            </div>
        </section>
    );
}
