import type { ComponentType, ReactNode, SVGProps } from 'react';
import {
    CogIcon, EyeSlashIcon, HeartIcon,
    RssIcon, LockClosedIcon, KeyIcon, EyeIcon,
    ItalicIcon, LockOpenIcon, CpuChipIcon, LightBulbIcon,
} from "@heroicons/react/24/outline";
import { useMemo } from 'react';
import { BentoGridItem } from '../../../components/ui/bento-grid';
import { masonryLayout, useMasonryColumns, useMeasure } from './masonryLayout';

interface SectionProps {
    currentSlide: number;
    getSectionOpacity: (index: number) => number;
}

interface FeatureCard {
    icon: ComponentType<SVGProps<SVGSVGElement>>;
    title?: string;
    body: string;
}

const cards: FeatureCard[] = [
    {
        icon: CogIcon,
        body: "As a maker and tinkerer, I often find myself needing to quickly paste passwords, commands, or text snippets into devices that aren't connected to the internet.",
    },
    {
        icon: EyeSlashIcon,
        title: "Or... I'm just lazy",
        body: "And sometimes I just don't want to login to my password manager on some sketchy makerspace computer.",
    },
    {
        icon: HeartIcon,
        body: 'And I just needed a reason to solder stuff and write some code. And then I went a bit overboard.',
    },
    {
        icon: RssIcon,
        body: 'Pairs with the ToothPaste Receiver to send keystrokes securely over BLE.',
    },
    {
        icon: LockClosedIcon,
        body: 'Encrypts keystrokes using ECDSA and sends them as custom ProtoBuf packets.',
    },
    {
        icon: KeyIcon,
        body: 'Encrypts local data using the Argon2 key derivation function (the same algorithm used by password managers) and never stores keystrokes.',
    },
    {
        icon: ItalicIcon,
        body: 'Acts as a USB Keyboard (and mouse) without needing any drivers.',
    },
    {
        icon: LockOpenIcon,
        body: 'Decrypts packets sent from the WebApp and types them out as keystrokes.',
    }
];

// The tile's header, holding its icon, with a radially-faded divider line above the text. It soaks up whatever height
// a tile has spare (the page doesn't scroll, so rows are viewport-sized), but never shrinks below
// 2.5rem so the icon stays visible.
function Skeleton({ children }: { children?: ReactNode }) {
    return (
        <div
            className="flex flex-1 items-center justify-center w-full min-h-10 border-b border-white/[0.2] [mask-image:radial-gradient(ellipse_at_center,white,transparent)]"
        >
            {children}
        </div>
    );
}

const TILE_BASE_WEIGHT = 120;
const TILE_GAP = 16;

export default function WhySection({ getSectionOpacity }: SectionProps) {
    const columns = useMasonryColumns();
    const [gridRef, { width, height }] = useMeasure<HTMLDivElement>();
    // Each tile's weight is a rough natural height: a fixed base for the icon header/padding,
    // plus its text length. Adding/removing/rewording a card reflows the grid on its own.
    const tiles = useMemo(
        () => masonryLayout(
            cards.map(card => TILE_BASE_WEIGHT + (card.title?.length ?? 0) + card.body.length),
            columns, width, height, TILE_GAP
        ),
        [columns, width, height]
    );

    return (
        // Positioning + opacity/pointer-events are what the About page's slide scrolling relies on.
        // z-10 keeps it above App's checkered GridBackground overlay (z-0).
        <section
            className="absolute inset-0 z-10 flex flex-col overflow-hidden p-4 md:p-6"
            style={{
                opacity: getSectionOpacity(1),
                transition: 'opacity 0.3s ease-in-out',
                pointerEvents: getSectionOpacity(1) > 0.5 ? 'auto' : 'none'
            }}
        >
            <h2 className="text-center text-xl md:text-xl">Secure passwords are annoying to type and easy to mess up. So I made ToothPaste - here's how it works.</h2>

            <div ref={gridRef} className="relative flex-1 min-h-0 w-full max-w-6xl mx-auto my-6 md:my-10">
                {tiles.length > 0 && cards.map((card, i) => {
                    const Icon = card.icon;
                    const { x, y, w, h } = tiles[i];
                    return (
                        <BentoGridItem
                            key={i}
                            className="absolute top-0 left-0 bg-neutral-800 min-h-0 overflow-hidden p-3 md:p-5 space-y-2 transition-[transform,width,height] duration-500 ease-out"
                            style={{ transform: `translate(${x}px, ${y}px)`, width: w, height: h }}
                            header={<Skeleton><Icon className="h-8 w-8 md:h-10 md:w-10 text-neutral-500" /></Skeleton>}
                            title={card.title && <span className="text-sm md:text-lg">{card.title}</span>}
                            description={<span className="text-xs md:text-sm xl:text-base">{card.body}</span>}
                        />
                    );
                })}
            </div>

            <p className="text-center text-lg md:text-2xl">Like what you see?</p>
        </section>
    );
}
