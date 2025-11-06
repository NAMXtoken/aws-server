import * as React from 'react'

import { cn } from '@/lib/utils'

type SeparatorProps = React.HTMLAttributes<HTMLDivElement> & {
    orientation?: 'horizontal' | 'vertical'
    decorative?: boolean
}

const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
    (
        {
            className,
            orientation = 'horizontal',
            decorative = true,
            role,
            ...props
        },
        ref
    ) => {
        const isVertical = orientation === 'vertical'
        const resolvedRole = decorative ? 'presentation' : role || 'separator'
        return (
            <div
                ref={ref}
                role={resolvedRole}
                aria-orientation={
                    decorative
                        ? undefined
                        : isVertical
                          ? 'vertical'
                          : 'horizontal'
                }
                className={cn(
                    'shrink-0 bg-border',
                    isVertical ? 'h-full w-[1px]' : 'h-[1px] w-full',
                    className
                )}
                {...props}
            />
        )
    }
)
Separator.displayName = 'Separator'

export { Separator }
