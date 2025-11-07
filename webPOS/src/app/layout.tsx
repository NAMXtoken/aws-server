import type { Metadata, Viewport } from 'next'
import { Outfit } from 'next/font/google'
import './globals.css'

import AppProviders from '@/components/auth/SessionProviderWrapper'

const outfit = Outfit({
    subsets: ['latin'],
})

export const metadata: Metadata = {
    appleWebApp: {
        capable: true,
        statusBarStyle: 'default',
    },
}

export const viewport: Viewport = {
    themeColor: [
        { media: '(prefers-color-scheme: light)', color: '#ffffff' },
        { media: '(prefers-color-scheme: dark)', color: '#101828' },
    ],
    viewportFit: 'cover',
}

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    return (
        <html lang="en">
            <body className={`${outfit.className} dark:bg-gray-900`}>
                <AppProviders>{children}</AppProviders>
            </body>
        </html>
    )
}
