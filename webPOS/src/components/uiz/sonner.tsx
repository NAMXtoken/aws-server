import { useTheme } from 'next-themes'
import type * as React from 'react'
import { Toaster as Sonner, toast } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
    const { theme = 'system', resolvedTheme } = useTheme()
    const effectiveTheme =
        theme === 'system'
            ? (resolvedTheme as ToasterProps['theme']) ?? 'light'
            : (theme as ToasterProps['theme'])
    const background = effectiveTheme === 'dark' ? '#0f172a' : '#ffffff'
    const foreground = effectiveTheme === 'dark' ? '#f8fafc' : '#0f172a'
    const borderColor = effectiveTheme === 'dark' ? '#1f2937' : '#e5e7eb'

    return (
        <Sonner
            theme={effectiveTheme}
            className="toaster group z-[100000]"
            style={{ zIndex: 100000 }}
            toastOptions={{
                classNames: {
                    toast: 'group toast group-[.toaster]:shadow-xl group-[.toaster]:backdrop-blur-none',
                    description:
                        'group-[.toast]:text-gray-600 group-[.toast]:dark:text-gray-300',
                    actionButton:
                        'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
                    cancelButton:
                        'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
                },
                style: {
                    backgroundColor: background,
                    color: foreground,
                    border: `1px solid ${borderColor}`,
                    boxShadow:
                        '0 10px 30px rgba(15, 23, 42, 0.15), 0 6px 16px rgba(15, 23, 42, 0.1)',
                },
            }}
            {...props}
        />
    )
}

export { Toaster, toast }
