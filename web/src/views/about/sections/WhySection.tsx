import type { ComponentType, SVGProps } from 'react';
import { Typography } from "@material-tailwind/react";
import {
    ArrowDownIcon, CogIcon, EyeSlashIcon, HeartIcon,
    RssIcon, LockClosedIcon, KeyIcon, EyeIcon,
    ItalicIcon, LockOpenIcon, CpuChipIcon, LightBulbIcon,
} from "@heroicons/react/24/outline";
import SpotlightCard from '../../../components/shared/SpotlightCard';
import { appColors } from '../../../styles/colors';

interface SectionProps {
    currentSlide: number;
    getSectionOpacity: (index: number) => number;
}

type AccentColor = 'secondary' | 'orange' | 'primary';

const accentClasses: Record<AccentColor, { border: string; shadow: string; text: string }> = {
    secondary: { border: 'border-secondary', shadow: 'shadow-secondary', text: 'text-secondary' },
    orange: { border: 'border-orange', shadow: 'shadow-orange', text: 'text-orange' },
    primary: { border: 'border-primary', shadow: 'shadow-primary', text: 'text-primary' },
};

// rgba versions of appColors, used for the spotlight hover glow.
const spotlightColors: Record<AccentColor, string> = {
    secondary: 'rgba(221, 64, 88, 0.35)',
    orange: 'rgba(222, 98, 64, 0.35)',
    primary: 'rgba(0, 168, 120, 0.35)',
};

interface FeatureCard {
    icon: ComponentType<SVGProps<SVGSVGElement>>;
    color: AccentColor;
    // Tailwind col/row span classes controlling this card's footprint in the bento grid -
    // kept per-card (rather than derived) so the grid can stay intentionally asymmetric.
    span: string;
    title?: string;
    body: string;
}

const cards: FeatureCard[] = [
    {
        icon: CogIcon,
        color: 'secondary',
        span: 'col-span-2 row-span-2',
        body: "As a maker and tinkerer, I often find myself needing to quickly paste passwords, commands, or text snippets into devices that aren't connected to the internet.",
    },
    {
        icon: EyeSlashIcon,
        color: 'orange',
        span: 'col-span-2 row-span-1 md:col-span-2',
        title: "Or... I'm just lazy",
        body: "And sometimes I just don't want to login to my password manager on some sketchy makerspace computer.",
    },
    {
        icon: HeartIcon,
        color: 'primary',
        span: 'col-span-2 row-span-1',
        body: 'And I just needed a reason to solder stuff and write some code. And then I went a bit overboard.',
    },
    {
        icon: RssIcon,
        color: 'orange',
        span: 'col-span-1 row-span-1',
        body: 'Pairs with the ToothPaste Receiver to send keystrokes securely over BLE.',
    },
    {
        icon: LockClosedIcon,
        color: 'orange',
        span: 'col-span-1 row-span-1',
        body: 'Encrypts keystrokes using ECDSA and sends them as custom ProtoBuf packets.',
    },
    {
        icon: KeyIcon,
        color: 'orange',
        span: 'col-span-2 row-span-2',
        body: 'Encrypts local data using the Argon2 key derivation function (the same algorithm used by password managers) and never stores keystrokes.',
    },
    {
        icon: EyeIcon,
        color: 'orange',
        span: 'col-span-1 row-span-1',
        body: 'Looks cool while doing it.',
    },
    {
        icon: ItalicIcon,
        color: 'primary',
        span: 'col-span-2 row-span-1',
        body: 'Acts as a USB Keyboard (and mouse) without needing any drivers.',
    },
    {
        icon: LockOpenIcon,
        color: 'primary',
        span: 'col-span-1 row-span-1',
        body: 'Decrypts packets sent from the WebApp and types them out as keystrokes.',
    },
    {
        icon: CpuChipIcon,
        color: 'primary',
        span: 'col-span-1 row-span-1',
        body: 'Uses an ESP32-S3.',
    },
    {
        icon: LightBulbIcon,
        color: 'primary',
        span: 'col-span-2 row-span-1',
        body: 'Has RGB!',
    },
];

export default function WhySection({ currentSlide, getSectionOpacity }: SectionProps) {
    return (
        <section
            className="absolute inset-0 flex flex-col py-0 md:py-8 xl:py-6 z-2 items-center justify-start overflow-hidden"
            style={{
                opacity: getSectionOpacity(1),
                transition: 'opacity 0.3s ease-in-out',
                pointerEvents: getSectionOpacity(1) > 0.5 ? 'auto' : 'none'
            }}
        >
            {/* Title Row */}
            <div className="absolute top-10 left-0 z-10 px-4 pt-4 max-w-sm hidden md:block">
                <div className="flex flex-col gap-1 text-left">
                    <Typography className="font-body text-md font-light text-dust italic ">
                    "If only i could copy this really long password to this really shady computer, we could achieve world peace.
                    <br/>Alas! I'm going to type it manually......"
                    </Typography>
                    <Typography className="italic text-xs md:text-sm font-body text-ink">- Someone Definitely</Typography>
                </div>
            </div>

            {/* Content - 1 text row + 1 large container for the card grid */}
            <div className="flex-1 relative w-full flex flex-col gap-1 md:gap-0 z-50 md:z-25 min-h-0">

                {/* Row 1 - Text Content */}
                <div className="flex flex-col justify-center text-center p-4 z-25 flex-shrink-0">
                    <Typography className="font-header font-light text-sm md:text-3xl xl:text-4xl text-white">
                    Secure passwords are annoying to type and easy to mess up.
                    <span className="hidden md:inline text-dust"> So I made <span className="font-semibold">ToothPaste</span> - here's how it works.</span>
                    </Typography>
                </div>

                {/* Container - flex-1 fills remaining space */}
                <div
                    className="flex-1 flex flex-col gap-0 w-full bg-background/60 px-2
                    md:px-6 py-2 md:py-3
                    border-t-2 border-white text-center z-55 md:z-25 overflow-hidden min-h-0"
                    style={{ boxShadow: '0 0 50px rgba(255, 255, 255, 0.3)' }}
                >
                    {/* Asymmetric bento grid of feature cards */}
                    <div className="flex-1 min-h-0 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 grid-flow-row-dense
                        auto-rows-[86px] sm:auto-rows-[96px] md:auto-rows-[100px] xl:auto-rows-[110px]
                        gap-2 md:gap-3 xl:gap-4 py-2">
                        {cards.map((card, i) => {
                            const Icon = card.icon;
                            const accent = accentClasses[card.color];
                            return (
                                <SpotlightCard
                                    key={i}
                                    spotlightColor={spotlightColors[card.color]}
                                    className={`whybox ${accent.border} ${accent.shadow} ${card.span} !justify-start pt-3 md:pt-4`}
                                >
                                    <Icon
                                        className={`h-6 w-6 md:h-8 md:w-8 xl:h-10 xl:w-10 flex-shrink-0 ${accent.text}`}
                                        style={{ filter: `drop-shadow(0 0px 3px ${appColors[card.color]})` }}
                                    />
                                    <div className="flex flex-col items-center justify-center gap-1 px-2 md:px-3 overflow-hidden">
                                        {card.title && (
                                            <Typography className="font-body text-xs md:text-sm font-bold text-text">
                                                {card.title}
                                            </Typography>
                                        )}
                                        <Typography className="font-body text-[10px] leading-tight md:text-sm xl:text-base font-light text-text md:leading-snug">
                                            {card.body}
                                        </Typography>
                                    </div>
                                </SpotlightCard>
                            );
                        })}
                    </div>

                    {/* Centered Scroll Prompt at Bottom */}
                    <div className="flex items-center justify-center gap-1 md:gap-2 text-white flex-shrink-0 mt-1 md:mt-2 text-xs md:text-sm">
                        <ArrowDownIcon className="h-3 w-3 md:h-4 md:w-4 animate-bounce" />
                        <Typography type="small">Like what you see?</Typography>
                    </div>
                </div>
            </div>
        </section>
    );
}
