import {
    PlayIcon,
    PauseIcon,
    ForwardIcon,
    BackwardIcon,
    SpeakerWaveIcon,
    SpeakerXMarkIcon,
} from '@heroicons/react/24/outline';

export type MediaOverlayState =
    | { type: 'volume'; level: number }
    | { type: 'playpause'; playing: boolean }
    | { type: 'track'; direction: 'next' | 'prev' };

const OVERLAY_DURATION_MS = 1200;

interface MediaOverlayProps {
    state: MediaOverlayState;
}

// A short-lived on-screen HUD like macOS/Windows show for media keys - purely decorative,
// triggered from a mocked sendEncrypted that just inspects the packet's control code.
export default function MediaOverlay({ state }: MediaOverlayProps) {
    let icon;
    if (state.type === 'volume') {
        icon = state.level === 0 ? (
            <SpeakerXMarkIcon className="h-8 w-8 text-text" />
        ) : (
            <SpeakerWaveIcon className="h-8 w-8 text-text" />
        );
    } else if (state.type === 'playpause') {
        icon = state.playing ? (
            <PlayIcon className="h-8 w-8 text-text" />
        ) : (
            <PauseIcon className="h-8 w-8 text-text" />
        );
    } else {
        icon = state.direction === 'next' ? (
            <ForwardIcon className="h-8 w-8 text-text" />
        ) : (
            <BackwardIcon className="h-8 w-8 text-text" />
        );
    }

    return (
        <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
            <div
                className="flex flex-col items-center gap-3 bg-black/70 backdrop-blur-sm rounded-2xl px-6 py-5 animate-fadeout"
                style={{ animationDuration: `${OVERLAY_DURATION_MS}ms` }}
            >
                {icon}
                {state.type === 'volume' && (
                    <div className="flex gap-1">
                        {Array.from({ length: 10 }).map((_, i) => (
                            <div
                                key={i}
                                className={`h-4 w-1.5 rounded-full ${
                                    i < Math.round(state.level / 10) ? 'bg-text' : 'bg-dust/40'
                                }`}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export { OVERLAY_DURATION_MS };
