'use client'

import { useSidebar } from '@/context/SidebarContext'
import { useSyncQueue } from '@/hooks/use-sync-queue'
import AppHeader from '@/layout/AppHeader'
import AppSidebar from '@/layout/AppSidebar'
import Backdrop from '@/layout/Backdrop'
import MobileBottomNav from '@/layout/MobileBottomNav'
import { useRouter } from 'next/navigation'
import React from 'react'
import { useSession } from 'next-auth/react'

type AdminLayoutClientProps = {
    children: React.ReactNode
    initialRole: 'admin' | 'limited' | null
}

export default function AdminLayoutClient({
    children,
    initialRole,
}: AdminLayoutClientProps) {
    const { isExpanded, isHovered, isMobileOpen } = useSidebar()
    const router = useRouter()
    const [role, setRole] = React.useState<'admin' | 'limited' | null>(
        initialRole
    )
    const { data: session, status } = useSession()

    useSyncQueue()

    // Initialize Dexie stores early to avoid store-missing errors after schema upgrades
    React.useEffect(() => {
        ;(async () => {
            try {
                const mod = await import('@/lib/db')
                const idb: any = (mod as any).db
                if (idb && !idb.isOpen()) {
                    await idb.open()
                }
            } catch {
                // Swallow errors so the layout keeps rendering while Dexie recovers
            }
        })()
    }, [])

    React.useEffect(() => {
        if (typeof document === 'undefined') {
            return
        }

        if (status === 'loading') {
            return
        }

        const cookieStrings = () =>
            document.cookie
                .split(';')
                .map((c) => c.trim())
                .filter(Boolean)

        const hasCookie = (name: string) =>
            cookieStrings().some((c) => c.startsWith(`${name}=`))

        if (!hasCookie('unlocked')) {
            if (status === 'authenticated' && session?.user) {
                const maxAge = 60 * 60 * 8
                document.cookie = `unlocked=true; path=/; max-age=${maxAge}`
                if (!hasCookie('role')) {
                    document.cookie = `role=admin; path=/; max-age=${maxAge}`
                }
                const displayName =
                    session.user.name?.trim() ||
                    session.user.email?.split('@')[0] ||
                    'User'
                if (displayName && displayName.length) {
                    document.cookie = `name=${encodeURIComponent(displayName)}; path=/; max-age=${maxAge}`
                }
            } else {
                router.replace(`/lock`)
                return
            }
        }

        const roleCookie = cookieStrings().find((c) => c.startsWith('role='))
        const derivedRole =
            roleCookie && roleCookie.split('=')[1] === 'limited'
                ? 'limited'
                : 'admin'
        setRole(derivedRole)

        if (derivedRole === 'limited') {
            const allowed = ['/sales', '/tickets', '/shift', '/profile']
            const path = window.location.pathname
            if (!allowed.includes(path)) {
                router.replace('/sales')
            }
        }
    }, [router, session, status])

    const isLimitedRole = role === 'limited'

    const mainContentMargin = isLimitedRole
        ? 'ml-0'
        : isMobileOpen
          ? 'ml-0'
          : isExpanded || isHovered
            ? 'lg:ml-[290px]'
            : 'lg:ml-[90px]'

    return (
        <div className="min-h-screen xl:flex">
            {/* Sidebar and Backdrop */}
            {!isLimitedRole && (
                <>
                    <AppSidebar role={role} />
                    <Backdrop />
                </>
            )}
            {/* Main Content Area */}
            <div
                className={`relative flex-1 transition-all duration-300 ease-in-out ${mainContentMargin}`}
            >
                <div className="app-backdrop" aria-hidden="true" />
                {/* Header */}
                <AppHeader role={role} />
                {/* Page Content */}
                <div className="page-shell">
                    <div className="app-surface overflow-hidden p-4 sm:p-6 md:p-8 lg:p-10">
                        {children}
                    </div>
                </div>
            </div>
            <MobileBottomNav />
        </div>
    )
}
