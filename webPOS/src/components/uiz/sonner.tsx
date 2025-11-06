import { useTheme } from 'next-themes'
import type * as React from 'react'
import { Toaster as Sonner, toast } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
    const { theme = 'system' } = useTheme()

    return (
        <Sonner
            theme={theme as ToasterProps['theme']}
            className="toaster group z-[100000]"
            style={{ zIndex: 100000 }}
            toastOptions={{
                classNames: {
                    toast: 'group toast group-[.toaster]:bg-white group-[.toaster]:dark:bg-gray-900 group-[.toaster]:text-gray-900 group-[.toaster]:dark:text-gray-100 group-[.toaster]:border group-[.toaster]:border-gray-200 group-[.toaster]:dark:border-gray-700 group-[.toaster]:shadow-xl group-[.toaster]:backdrop-blur-none',
                    description:
                        'group-[.toast]:text-gray-600 group-[.toast]:dark:text-gray-300',
                    actionButton:
                        'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
                    cancelButton:
                        'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
                },
            }}
            {...props}
        />
    )
}

export { Toaster, toast }
