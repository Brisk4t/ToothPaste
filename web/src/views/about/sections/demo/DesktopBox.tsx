import { useState } from 'react';
import type { ClipboardEvent, KeyboardEvent, MouseEvent, Ref } from 'react';
import { DocumentTextIcon, XMarkIcon, Squares2X2Icon } from '@heroicons/react/24/outline';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Textarea } from '../../../../components/ui/textarea';
import { Button } from '../../../../components/ui/button';
import MediaOverlay from './MediaOverlay';
import type { MediaOverlayState } from './MediaOverlay';

interface CursorPos {
    x: number; // percentage, 0-100
    y: number; // percentage, 0-100
}

// This box is a "remote screen" - only the mock cursor (driven from the paired box,
// dispatched via element.click()/.focus() and therefore untrusted) should be able to
// trigger these. A real click/tap on this box is a trusted browser event, so ignore it.
function remoteOnly(handler: () => void) {
    return (e: { isTrusted: boolean }) => {
        if (e.isTrusted) return;
        handler();
    };
}

interface DesktopBoxProps {
    label: string;
    statusText: string;
    onScreenMouseEnter?: (e: MouseEvent<HTMLDivElement>) => void;
    onScreenMouseMove?: (e: MouseEvent<HTMLDivElement>) => void;
    onScreenMouseLeave?: (e: MouseEvent<HTMLDivElement>) => void;
    onScreenMouseDown?: (e: MouseEvent<HTMLDivElement>) => void;
    screenRef?: Ref<HTMLDivElement>;
    cursorPos?: CursorPos | null;
    // Incremented once per click on the paired box - used to fire a one-shot ripple here.
    clickPulse?: number;
    mediaOverlay?: MediaOverlayState | null;
    // Bumped on every press so the HUD remounts (restarting its fadeout) even on repeat presses.
    mediaOverlayKey?: number;
    notepadOpen: boolean;
    onNotepadOpenChange: (open: boolean) => void;
    notepadValue: string;
    notepadReadOnly?: boolean;
    onNotepadKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
    onNotepadPaste?: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
    notepadRef?: Ref<HTMLTextAreaElement>;
}

export default function DesktopBox({
    label,
    statusText,
    onScreenMouseEnter,
    onScreenMouseMove,
    onScreenMouseLeave,
    onScreenMouseDown,
    screenRef,
    cursorPos,
    clickPulse,
    mediaOverlay,
    mediaOverlayKey,
    notepadOpen,
    onNotepadOpenChange,
    notepadValue,
    notepadReadOnly,
    onNotepadKeyDown,
    onNotepadPaste,
    notepadRef,
}: DesktopBoxProps) {
    const showCursor = !!cursorPos;
    const [startMenuOpen, setStartMenuOpen] = useState(false);

    return (
        <div className="flex-1 flex flex-col gap-2 min-w-0">
            <div className="flex items-center justify-between px-1 flex-shrink-0">
                <span className="font-body text-sm md:text-base text-text font-medium">{label}</span>
                <span className="font-body text-[10px] md:text-xs text-dust">{statusText}</span>
            </div>

            <div
                ref={screenRef}
                onMouseEnter={onScreenMouseEnter}
                onMouseMove={onScreenMouseMove}
                onMouseLeave={onScreenMouseLeave}
                onMouseDown={onScreenMouseDown}
                className={`relative overflow-hidden select-none rounded-lg border-4 border-text bg-gradient-to-br from-purple-600/20 via-ink to-blue-500/20 w-full aspect-[16/10] max-h-[70vh] ${showCursor ? 'cursor-none' : ''}`}
            >
                {/* Desktop icon */}
                <button
                    type="button"
                    onClick={remoteOnly(() => {
                        onNotepadOpenChange(true);
                        setStartMenuOpen(false);
                    })}
                    className="absolute top-4 left-4 flex flex-col items-center gap-1 w-20 rounded p-1 data-[fake-hover=true]:bg-white/10 focus-visible:outline-none focus-visible:bg-white/10"
                >
                    <DocumentTextIcon className="h-10 w-10 md:h-12 md:w-12 text-blueish" />
                    <span className="font-body text-xs text-text leading-tight text-center">Notepad.txt</span>
                </button>

                {/* Notepad window */}
                {notepadOpen && (
                    <Card className="absolute inset-6 md:inset-10 gap-0 py-0 z-20 flex flex-col">
                        <CardHeader className="py-2 border-b border-zinc-800 flex-shrink-0">
                            <CardTitle className="text-sm">Notepad — untitled.txt</CardTitle>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={remoteOnly(() => onNotepadOpenChange(false))}
                                aria-label="Close Notepad"
                            >
                                <XMarkIcon className="h-4 w-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="px-0 flex-1 min-h-0">
                            <Textarea
                                ref={notepadRef}
                                value={notepadValue}
                                onKeyDown={onNotepadKeyDown}
                                onPaste={onNotepadPaste}
                                readOnly={notepadReadOnly}
                                placeholder={notepadReadOnly ? '' : 'Start typing...'}
                                className="rounded-none border-none shadow-none focus-visible:ring-0 font-body text-sm h-full"
                            />
                        </CardContent>
                    </Card>
                )}

                {/* Start menu */}
                {startMenuOpen && (
                    <div className="absolute bottom-14 left-2 z-30 w-48 rounded-md border border-zinc-800 bg-zinc-950 shadow-lg py-2">
                        <button
                            type="button"
                            onClick={remoteOnly(() => {
                                onNotepadOpenChange(true);
                                setStartMenuOpen(false);
                            })}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-base font-body text-text data-[fake-hover=true]:bg-white/10"
                        >
                            <DocumentTextIcon className="h-5 w-5 text-blueish" />
                            Notepad
                        </button>
                    </div>
                )}

                {/* Taskbar */}
                <div className="absolute bottom-0 inset-x-0 h-14 bg-black/70 border-t border-ash flex items-center gap-3 px-3">
                    <button
                        type="button"
                        aria-label="Start"
                        onClick={remoteOnly(() => setStartMenuOpen(prev => !prev))}
                        className={`h-10 w-10 flex items-center justify-center rounded data-[fake-hover=true]:bg-white/10 ${startMenuOpen ? 'bg-white/10' : ''}`}
                    >
                        <Squares2X2Icon className="h-6 w-6 text-primary" />
                    </button>

                    <div className="w-px self-stretch my-3 bg-ash" />

                    {/* The only app running in this environment */}
                    <button
                        type="button"
                        onClick={remoteOnly(() => {
                            onNotepadOpenChange(!notepadOpen);
                            setStartMenuOpen(false);
                        })}
                        className={`h-10 flex items-center gap-2 px-4 rounded text-base font-body data-[fake-hover=true]:bg-white/10 ${
                            notepadOpen ? 'bg-white/10 border-b-2 border-primary text-text' : 'text-dust'
                        }`}
                    >
                        <DocumentTextIcon className="h-5 w-5" />
                        Notepad
                    </button>
                </div>

                {/* Simulated cursor, driven by the paired box's mouse tracking */}
                {showCursor && cursorPos && (
                    <svg
                        viewBox="0 0 24 24"
                        className="absolute h-5 w-5 pointer-events-none z-30 -translate-x-[2px] -translate-y-[2px] transition-[left,top] duration-75 ease-out"
                        style={{ left: `${cursorPos.x}%`, top: `${cursorPos.y}%` }}
                    >
                        <path
                            d="M4 2 L4 20 L9 15.5 L12.5 21.5 L15 20 L11.5 14 L18 14 Z"
                            fill="white"
                            stroke="black"
                            strokeWidth="1.2"
                            strokeLinejoin="round"
                        />
                    </svg>
                )}

                {/* Click ripple - fires once per click on the paired box */}
                {showCursor && cursorPos && !!clickPulse && (
                    <span
                        key={clickPulse}
                        className="absolute h-6 w-6 rounded-full border-2 border-white/80 pointer-events-none z-30 animate-clickPing"
                        style={{ left: `${cursorPos.x}%`, top: `${cursorPos.y}%` }}
                    />
                )}

                {/* Media key HUD - shown here since this is the device actually being controlled */}
                {mediaOverlay && <MediaOverlay key={mediaOverlayKey} state={mediaOverlay} />}
            </div>
        </div>
    );
}
