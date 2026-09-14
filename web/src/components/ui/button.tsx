import * as React from 'react';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-zinc-400',
    {
        variants: {
            variant: {
                default: 'bg-zinc-50 text-zinc-900 hover:bg-zinc-200 data-[fake-hover=true]:bg-zinc-200',
                ghost: 'hover:bg-zinc-800 hover:text-zinc-50 data-[fake-hover=true]:bg-zinc-800 data-[fake-hover=true]:text-zinc-50',
                outline: 'border border-zinc-800 bg-transparent hover:bg-zinc-800 data-[fake-hover=true]:bg-zinc-800',
            },
            size: {
                default: 'h-9 px-4 py-2',
                sm: 'h-8 px-3 text-xs',
                icon: 'h-6 w-6',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    }
);

export interface ButtonProps
    extends React.ComponentProps<'button'>,
        VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, ...props }, ref) => {
        return (
            <button
                ref={ref}
                data-slot="button"
                className={cn(buttonVariants({ variant, size, className }))}
                {...props}
            />
        );
    }
);
Button.displayName = 'Button';
