import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../../lib/utils';

// Aceternity UI's Bento Grid (https://ui.aceternity.com/components/bento-grid). The site is
// always dark, so the `dark:` variants are applied directly (Tailwind here uses the media
// strategy, which would flip these tiles white on a light-mode OS). `style` is added so
// callers can drive the grid template / tile placement at runtime.
export function BentoGrid({ className, style, children }: { className?: string; style?: CSSProperties; children?: ReactNode }) {
    return (
        <div className={cn('mx-auto grid max-w-7xl grid-cols-1 gap-4 md:auto-rows-[18rem] md:grid-cols-3', className)} style={style}>
            {children}
        </div>
    );
}

interface BentoGridItemProps {
    className?: string;
    style?: CSSProperties;
    title?: ReactNode;
    description?: ReactNode;
    header?: ReactNode;
    icon?: ReactNode;
}

export function BentoGridItem({ className, style, title, description, header, icon }: BentoGridItemProps) {
    return (
        <div
            className={cn(
                'group/bento row-span-1 flex flex-col justify-between space-y-4 rounded-xl border border-white/[0.2] bg-black p-4 shadow-none transition duration-200 hover:shadow-xl',
                className
            )}
            style={style}
        >
            {header}
            <div className="transition duration-200 group-hover/bento:translate-x-2">
                {icon}
                {title && <div className="mt-2 mb-2 font-sans font-bold text-neutral-200">{title}</div>}
                <div className="font-sans text-xs font-normal text-neutral-300">{description}</div>
            </div>
        </div>
    );
}
