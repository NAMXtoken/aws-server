import AdminLayoutClient from './AdminLayoutClient'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'

export default async function AdminLayout({
    children,
}: {
    children: ReactNode
}) {
    const cookieStore = await cookies()
    let roleCookie = cookieStore.get('role')?.value ?? null
    let unlockedCookie = cookieStore.get('unlocked')?.value ?? null

    if (unlockedCookie !== 'true') {
        const session = await getServerSession(authOptions)
        const headerStore = await headers()
        const userAgent =
            typeof headerStore.get === 'function'
                ? headerStore.get('user-agent') || ''
                : ''
        const isAndroidShell = userAgent.includes('ByndPOSAndroid/')
        if (
            isAndroidShell &&
            session?.user &&
            (session.user.email || session.user.name)
        ) {
            const maxAge = 60 * 60 * 8 // 8 hours
            const name =
                session.user.name?.trim() ||
                session.user.email?.split('@')[0] ||
                'User'
            cookieStore.set('unlocked', 'true', {
                path: '/',
                maxAge,
                httpOnly: false,
            })
            cookieStore.set('role', roleCookie ?? 'admin', {
                path: '/',
                maxAge,
                httpOnly: false,
            })
            cookieStore.set('name', name, {
                path: '/',
                maxAge,
                httpOnly: false,
            })
            unlockedCookie = 'true'
            roleCookie = roleCookie ?? 'admin'
        } else {
            redirect('/lock')
        }
    }

    const initialRole =
        roleCookie === 'admin' || roleCookie === 'limited' ? roleCookie : null

    return (
        <AdminLayoutClient initialRole={initialRole}>
            {children}
        </AdminLayoutClient>
    )
}
