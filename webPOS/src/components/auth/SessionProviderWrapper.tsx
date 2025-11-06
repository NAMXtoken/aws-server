'use client'

import { Toaster } from '@/components/uiz/toaster'
import { SidebarProvider } from '@/context/SidebarContext'
import { TenantProvider } from '@/context/TenantContext'
import { ThemeProvider } from '@/context/ThemeContext'
import PushBootstrap from '@/components/push/PushBootstrap'
import { SessionProvider } from 'next-auth/react'
import type { ReactNode } from 'react'

export default function AppProviders({ children }: { children: ReactNode }) {
    return (
        <SessionProvider>
            <TenantProvider>
                <ThemeProvider>
                    <SidebarProvider>
                        <PushBootstrap />
                        {children}
                        <Toaster />
                    </SidebarProvider>
                </ThemeProvider>
            </TenantProvider>
        </SessionProvider>
    )
}
