import { useRef, useState } from 'react';
import { Typography } from "@material-tailwind/react";
import { ArrowDownIcon } from "@heroicons/react/24/outline";
import TypingAnimation from '../../../components/shared/TypingAnimation';
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
// Keep the cursor a few px off the true edge (so its icon doesn't get clipped), rather than
// a fixed percentage - a percentage bound stops reaching fixed-height chrome like the
// taskbar once the box (and so the taskbar's share of its height) grows.
const CURSOR_EDGE_PADDING_PX = 4;

export default function HeroSection({ currentSlide, getSectionOpacity }: SectionProps) {
    // Shared notepad text - the live capture box (the real LiveCapture UI) owns it, the
    // paired device box just mirrors it.
    const [notepadValue, setNotepadValue] = useState('');
    const [notepadOpenB, setNotepadOpenB] = useState(true);

    // Simulated cursor position (percentage of the paired box's screen), driven by the
    // live capture box's mouse displacement tracking - the same relative-movement idea
    // used by the real HID mouse reports in LiveCapture, minus the BLE transport.
    const [cursorPos, setCursorPos] = useState<Point>({ x: 50, y: 50 });
    const [clickPulse, setClickPulse] = useState(0);
    const cursorPosRef = useRef<Point>({ x: 50, y: 50 });
    const hoveredElRef = useRef<HTMLElement | null>(null);
    const boxBScreenRef = useRef<HTMLDivElement | null>(null);

    // Media key HUD - the live capture box just reports what was pressed, it's shown on the paired device.
    const [mediaOverlay, setMediaOverlay] = useState<MediaOverlayState | null>(null);
    // Bumped on every press so the paired box can remount the HUD (via key=) even when it's
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

    // Find the real interactive element sitting under the mirrored cursor in the paired box.
    function elementAtCursor(pos: Point): HTMLElement | null {
        const screenEl = boxBScreenRef.current;
        if (!screenEl) return null;

        const rect = screenEl.getBoundingClientRect();
        const x = rect.left + (pos.x / 100) * rect.width;
        const y = rect.top + (pos.y / 100) * rect.height;

        const target = document.elementFromPoint(x, y) as HTMLElement | null;
        return target?.closest('button, textarea, input') ?? null;
    }

    // Since the paired box never receives a real :hover (the browser cursor is over the
    // other box), fake it with a data attribute that mirrors hover: via data-[fake-hover=true]:.
    function updateHoverTarget(pos: Point) {
        const interactive = elementAtCursor(pos);
        if (hoveredElRef.current && hoveredElRef.current !== interactive) {
            hoveredElRef.current.removeAttribute('data-fake-hover');
        }
        interactive?.setAttribute('data-fake-hover', 'true');
        hoveredElRef.current = interactive;
    }

    // The live capture box reports raw pixel displacement (same idea as a relative HID
    // mouse report); scale it against the paired box's own screen so movement feels
    // consistent regardless of the live capture box's internal layout.
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

    // Only let typed text reach the notepad while it's actually open on the paired device -
    // otherwise closing it and typing would silently pre-fill it for whenever it reopens.
    function handleNotepadValueChange(next: string) {
        if (!notepadOpenB) return;
        setNotepadValue(next);
    }

    return (
        <section
            className="absolute inset-0 flex flex-col px-6 xl:px-12 py-6 z-50"
            style={{
                opacity: getSectionOpacity(0),
                transition: 'opacity 0.3s ease-in-out',
                pointerEvents: getSectionOpacity(0) > 0.5 ? 'auto' : 'none'
            }}
        >
            {/* Desktop */}
            <div className="hidden xl:flex flex-col flex-1 min-h-0">
                <div className="flex flex-row items-center justify-center gap-8 flex-shrink-0 mt-10">
                    <div className="flex-shrink-0">
                        <Typography className="font-header text-6xl font-bold text-primary mb-2">ToothPaste</Typography>
                        <Typography style={{ fontFamily: '"Libre Barcode 39 Extended", system-ui' }} className="text-xl leading-relaxed">ToothPaste</Typography>
                        <Typography className="font-body text-3xl font-light italic leading-relaxed">
                            <span className="text-secondary">Plug In.</span> <span className="text-orange">Pair.</span> <span className="text-primary">Paste.</span>
                        </Typography>
                    </div>

                    <div className="flex flex-col gap-3">
                        <Typography type="h5" className="font-body text-white leading-relaxed">
                            Because sometimes you just want to type
                        </Typography>
                        <TypingAnimation
                            texts={[
                                'MySecurePassword123(づ￣ 3￣)づ',
                                'Long Street, Longer Avenue, Ugh City, State, Country - ABC 123',
                                '↑ ↑ ↓ ↓ ← → ← → B A Start'
                            ]}
                            typingSpeed={10}
                            pauseTime={1000}
                            repeat={true}
                            className="font-body font-light text-2xl text-dust block my-0"
                        />
                        <Typography type="h5" className="font-body text-white leading-relaxed">
                            and you're in a rush.......
                        </Typography>
                    </div>
                </div>

                <div className="flex-1 flex items-center justify-center min-h-0">
                    <div className="flex flex-row items-center gap-10 w-full">
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

                <div className="flex items-center justify-center gap-2 text-white mt-4 flex-shrink-0">
                    <ArrowDownIcon className="h-5 w-5 animate-bounce" />
                    {/* "medium" isn't in material-tailwind's Typography `type` union (h1-h6|lead|p|small) —
                        pre-existing usage, kept as-is rather than guessing the intended styling. */}
                    {/* @ts-expect-error */}
                    <Typography type="medium">Scroll to explore</Typography>
                </div>
            </div>

            {/* Mobile - the live capture demo needs xl+ (KeyboardMouse itself is desktop-only), so just show the hero copy */}
            <div className="w-full xl:hidden flex flex-col flex-1 justify-center">
                <div>
                    <div className="mb-40">
                        <Typography className="font-header text-6xl font-bold text-primary ">ToothPaste</Typography>
                        <Typography style={{ fontFamily: '"Libre Barcode 39 Extended", system-ui' }} className="text-2xl leading-relaxed">ToothPaste</Typography>
                        <Typography className="font-body text-2xl font-light italic leading-relaxed ">
                            <span className="text-secondary">Plug In.</span> <span className="text-orange">Pair.</span> <span className="text-primary">Paste</span>
                        </Typography>
                    </div>
                    <div className="flex flex-col gap-4 mr-12">
                        <Typography type="h5" className="font-body text-white leading-relaxed mb-0">
                            Because sometimes you just want to type
                        </Typography>
                        <TypingAnimation
                            texts={[
                                'MySecurePassword123!@#',
                                'Long Street, Longer Avenue, Ugh City, State, Country - 123 123',
                                'Or just casual government secrets.....'
                            ]}
                            typingSpeed={10}
                            pauseTime={1000}
                            repeat={true}
                            className="font-body font-light text-2xl text-dust block my-0"
                        />
                        <Typography type="h5" className="font-body text-white leading-relaxed">
                            and you're in a rush.......
                        </Typography>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-white mt-20">
                    <ArrowDownIcon className="h-5 w-5 animate-bounce" />
                    {/* @ts-expect-error */}
                    <Typography type="medium">Scroll to explore</Typography>
                </div>
            </div>
        </section>
    );
}
