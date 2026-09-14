import type { ClipboardEvent, KeyboardEvent, MouseEvent, Ref } from 'react';
import { DocumentTextIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Textarea } from '../../../../components/ui/textarea';
import { Button } from '../../../../components/ui/button';

interface CursorPos {
    x: number; // percentage, 0-100
    y: number; // percentage, 0-100
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
    notepadOpen,
    onNotepadOpenChange,
    notepadValue,
    notepadReadOnly,
    onNotepadKeyDown,
    onNotepadPaste,
    notepadRef,
}: DesktopBoxProps) {
    const showCursor = !!cursorPos;

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
                className={`relative overflow-hidden select-none rounded-lg border border-ash bg-gradient-to-br from-ink to-black w-full aspect-[16/10] ${showCursor ? 'cursor-none' : ''}`}
            >
                {/* Desktop icon */}
                <button
                    type="button"
                    onClick={() => onNotepadOpenChange(true)}
                    className="absolute top-4 left-4 flex flex-col items-center gap-1 w-20 rounded p-1 hover:bg-white/10 data-[fake-hover=true]:bg-white/10 focus-visible:outline-none focus-visible:bg-white/10"
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
                                onClick={() => onNotepadOpenChange(false)}
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

                {/* Taskbar */}
                <div className="absolute bottom-0 inset-x-0 h-6 bg-black/50 border-t border-ash flex items-center px-2 gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    {notepadOpen && (
                        <span className="font-body text-[10px] text-dust truncate">Notepad</span>
                    )}
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
            </div>
        </div>
    );
}
