import { useRef, useState } from 'react';
import DesktopBox from './demo/DesktopBox';
import LiveCaptureBox from './demo/LiveCaptureBox';
import { OVERLAY_DURATION_MS } from './demo/MediaOverlay';
import type { MediaOverlayState } from './demo/MediaOverlay';

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
// Keep the cursor a few px off the true edge (so its icon doesn't get clipped), rather than
// a fixed percentage - a percentage bound stops reaching fixed-height chrome like the
// taskbar once the box (and so the taskbar's share of its height) grows.
const CURSOR_EDGE_PADDING_PX = 4;

export default function DemoSection({ currentSlide, getSectionOpacity }: SectionProps) {
    // Shared notepad text - box A (the real LiveCapture UI) owns it, box B just mirrors it
    const [notepadValue, setNotepadValue] = useState('');
    const [notepadOpenB, setNotepadOpenB] = useState(true);

    // Simulated cursor position (percentage of box B's screen), driven by box A's
    // mouse displacement tracking - the same relative-movement idea used by the
    // real HID mouse reports in LiveCapture, minus the BLE transport.
    const [cursorPos, setCursorPos] = useState<Point>({ x: 50, y: 50 });
    const [clickPulse, setClickPulse] = useState(0);
    const cursorPosRef = useRef<Point>({ x: 50, y: 50 });
    const hoveredElRef = useRef<HTMLElement | null>(null);
    const boxBScreenRef = useRef<HTMLDivElement | null>(null);

    // Media key HUD - box A just reports what was pressed, it's shown on the paired device.
    const [mediaOverlay, setMediaOverlay] = useState<MediaOverlayState | null>(null);
    // Bumped on every press so DesktopBox can remount the HUD (via key=) even when it's
    // already showing - otherwise the fadeout animation just keeps playing from wherever
    // it was instead of popping back to full opacity.
    const [mediaOverlayKey, setMediaOverlayKey] = useState(0);
    const mediaOverlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    function flashMediaOverlay(next: MediaOverlayState) {
        setMediaOverlay(next);
        setMediaOverlayKey(prev => prev + 1);
        if (mediaOverlayTimeoutRef.current) clearTimeout(mediaOverlayTimeoutRef.current);
        mediaOverlayTimeoutRef.current = setTimeout(() => setMediaOverlay(null), OVERLAY_DURATION_MS);
    }

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

    // Box A reports raw pixel displacement (same idea as a relative HID mouse report);
    // scale it against box B's own screen so movement feels consistent regardless of
    // box A's internal layout.
    function handleCursorDelta(displacementX: number, displacementY: number) {
        const screenEl = boxBScreenRef.current;
        if (!screenEl) return;

        const rect = screenEl.getBoundingClientRect();
        const minXPercent = (CURSOR_EDGE_PADDING_PX / rect.width) * 100;
        const minYPercent = (CURSOR_EDGE_PADDING_PX / rect.height) * 100;
        const next = {
            x: clamp(cursorPosRef.current.x + (displacementX / rect.width) * 100, minXPercent, 100 - minXPercent),
            y: clamp(cursorPosRef.current.y + (displacementY / rect.height) * 100, minYPercent, 100 - minYPercent),
        };
        cursorPosRef.current = next;
        setCursorPos(next);
        updateHoverTarget(next);
    }

    // Only let typed text reach the notepad while it's actually open on the paired device -
    // otherwise closing it and typing would silently pre-fill it for whenever it reopens.
    function handleNotepadValueChange(next: string) {
        if (!notepadOpenB) return;
        setNotepadValue(next);
    }

    function handleRemoteClick() {
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
                    Move your mouse and type on the left, just like the real Live Capture page - watch it
                    mirror on the right, the same way ToothPaste syncs your keyboard and mouse between devices.
                </p>
            </div>

            <div className="flex-1 flex items-center justify-center min-h-0">
                <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10 w-full">
                    <LiveCaptureBox
                        value={notepadValue}
                        onValueChange={handleNotepadValueChange}
                        onCursorDelta={handleCursorDelta}
                        onRemoteClick={handleRemoteClick}
                        onMediaOverlay={flashMediaOverlay}
                    />
                    <DesktopBox
                        label="Paired Device"
                        statusText="receiving"
                        screenRef={boxBScreenRef}
                        cursorPos={cursorPos}
                        clickPulse={clickPulse}
                        mediaOverlay={mediaOverlay}
                        mediaOverlayKey={mediaOverlayKey}
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
