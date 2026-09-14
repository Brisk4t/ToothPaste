import * as React from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="card"
            className={cn(
                'flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-50 py-3 shadow-sm',
                className
            )}
            {...props}
        />
    );
}

export function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="card-header"
            className={cn('flex items-center justify-between gap-2 px-3', className)}
            {...props}
        />
    );
}

export function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="card-title"
            className={cn('text-xs leading-none font-medium select-none', className)}
            {...props}
        />
    );
}

export function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="card-content" className={cn('px-3', className)} {...props} />;
}
