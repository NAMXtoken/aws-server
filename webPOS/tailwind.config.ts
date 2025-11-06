import type { Config } from 'tailwindcss'

const config: Config = {
    content: ['./src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                background: 'var(--color-background)',
                foreground: 'var(--color-foreground)',
                muted: 'var(--color-muted)',
                'muted-foreground': 'var(--color-muted-foreground)',
                border: 'var(--color-border)',
                ring: 'var(--color-ring)',
                success: {
                    500: 'var(--color-success-500)',
                },
                danger: {
                    500: 'var(--color-danger-500)',
                },
                warning: {
                    500: 'var(--color-warning-500)',
                },
                primary: {
                    500: 'var(--color-primary-500)',
                    600: 'var(--color-primary-600)',
                },
            },
        },
    },
}

export default config
