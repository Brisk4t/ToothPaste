import * as React from 'react';
import { cn } from '../../lib/utils';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
    ({ className, ...props }, ref) => {
        return (
            <textarea
                ref={ref}
                data-slot="textarea"
                className={cn(
                    'flex w-full resize-none rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50',
                    className
                )}
                {...props}
            />
        );
    }
);
Textarea.displayName = 'Textarea';
