import { useRef } from 'react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';

interface SpotlightCardProps {
    children: ReactNode;
    className?: string;
    spotlightColor?: string;
}

// A card with a mouse-following radial highlight - based on reactbits.dev/components/spotlight-card,
// adapted to sit on top of this site's existing `.whybox` styling rather than replacing it.
export default function SpotlightCard({ children, className = '', spotlightColor = 'rgba(255, 255, 255, 0.25)' }: SpotlightCardProps) {
    const cardRef = useRef<HTMLDivElement | null>(null);

    function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
        const card = cardRef.current;
        if (!card) return;
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
        card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
    }

    return (
        <div
            ref={cardRef}
            onMouseMove={handleMouseMove}
            className={`card-spotlight ${className}`}
            style={{ '--spotlight-color': spotlightColor } as CSSProperties}
        >
            {children}
        </div>
    );
}
