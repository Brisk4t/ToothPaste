import {
    SignalIcon,
    PlayIcon,
    ClipboardIcon,
    QuestionMarkCircleIcon,
    CpuChipIcon,
    PlayCircleIcon,
} from '@heroicons/react/24/outline';
import ToothPasteLogo from '../../../../assets/ToothPaste.png';

// A purely decorative recreation of components/Navigation/Navbar.tsx - not wired to any
// real state and not interactive, permanently shown "connected" to a device named
// "ToothPaste V2" with "Live Capture" as the current page (what this box is simulating).
export default function MockNavbar() {
    return (
        <div className="flex items-center justify-between gap-2 h-10 md:h-10 px-2 md:px-3 bg-ink border-b border-ash flex-shrink-0 select-none pointer-events-none">
            <div className="flex items-center gap-1.5 min-w-0 flex-shrink-0">
                <img src={ToothPasteLogo} alt="" className="h-4 w-4 md:h-5 md:w-5 flex-shrink-0" />
                <span className="font-header font-bold text-text text-xs md:text-sm truncate">ToothPaste</span>
            </div>

            <div className="hidden md:flex items-center gap-2.5 whitespace-nowrap">
                <span className="flex items-center gap-1 text-[10px] lg:text-xs font-header text-text border border-text rounded px-1.5 py-0.5">
                    <PlayIcon className="h-3.5 w-3.5" />
                    Live Capture
                </span>
                <span className="flex items-center gap-1 text-[10px] lg:text-xs font-header text-dust">
                    <ClipboardIcon className="h-3.5 w-3.5" />
                    Paste
                </span>
                <span className="flex items-center gap-1 text-[10px] lg:text-xs font-header text-dust">
                    <QuestionMarkCircleIcon className="h-3.5 w-3.5" />
                    About
                </span>

                <div className="h-3.5 border-l border-text opacity-50" />

                <span className="flex items-center gap-1 text-[10px] lg:text-xs font-header text-dust">
                    <CpuChipIcon className="h-3.5 w-3.5" />
                    Update
                </span>
                <span className="flex items-center gap-1 text-[10px] lg:text-xs font-header text-dust">
                    <PlayCircleIcon className="h-3.5 w-3.5" />
                    Quick Start
                </span>
            </div>

            <div className="flex items-center gap-1.5 border border-primary rounded px-2 py-1 flex-shrink-0">
                <span className="font-header text-text text-[10px] md:text-xs truncate">ToothPaste V2</span>
                <SignalIcon className="h-3.5 w-3.5 text-text flex-shrink-0" />
            </div>
        </div>
    );
}
