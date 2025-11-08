'use client'

import { useSidebar } from '@/context/SidebarContext'
import { useSyncQueue } from '@/hooks/use-sync-queue'
import AppHeader from '@/layout/AppHeader'
import AppSidebar from '@/layout/AppSidebar'
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
    const { isExpanded, isHovered, isMobile } = useSidebar()
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

    const handleSoftLogout = React.useCallback(() => {
        if (typeof document !== 'undefined') {
            ;['unlocked', 'role', 'pin', 'name'].forEach((cookie) => {
                document.cookie = `${cookie}=; path=/; max-age=0`
            })
        }
        router.push('/lock')
    }, [router])

    const mainContentMargin = isMobile
        ? 'ml-0'
        : isExpanded || isHovered
          ? 'lg:ml-[290px]'
          : 'lg:ml-[90px]'

    return (
        <div className="min-h-screen xl:flex">
            {/* Sidebar */}
            {!isMobile && <AppSidebar role={role} />}
            {/* Main Content Area */}
            <div
                className={`relative flex-1 transition-all duration-300 ease-in-out ${mainContentMargin}`}
            >
                {/* Header */}
                <AppHeader role={role} />
                <div className="flex justify-end px-4 pt-2 sm:px-6 md:px-8 lg:px-10">
                    <button
                        type="button"
                        onClick={handleSoftLogout}
                        className="rounded-full border border-gray-200 px-4 py-1.5 text-sm font-medium text-gray-600 transition hover:border-gray-400 hover:text-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:text-white"
                    >
                        Log out
                    </button>
                </div>
                <div
                    id="page-toolbar-slot"
                    className="page-toolbar-slot sticky top-[4.75rem] z-40 px-4 pt-2 pb-2 sm:px-6 md:px-8 lg:px-10"
                />
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
