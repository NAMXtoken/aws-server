'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React, { useEffect, useMemo, useState } from 'react'

import { GridIcon, ListIcon, TimeIcon } from '@/icons'
import {
    MAIN_NAV_ITEMS,
    type NavItem,
    type NavSubItem,
} from '@/layout/nav-config'

type Role = 'admin' | 'limited' | null

type BottomNavItem = NavItem & {
    targetPath: string
    visibleSubItems: NavSubItem[]
}

const deriveRoleFromCookies = (): Role => {
    if (typeof document === 'undefined') return null
    const match = document.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('role='))
    if (!match) return null
    const value = match.split('=')[1]
    if (value === 'admin' || value === 'limited') return value
    return null
}

const MobileBottomNav: React.FC = () => {
    const pathname = usePathname()
    const [role, setRole] = useState<Role>(null)

    useEffect(() => {
        setRole(deriveRoleFromCookies())
    }, [])

    const navItems = useMemo<BottomNavItem[]>(() => {
        const effectiveRole = role
        if (effectiveRole === 'limited') {
            const limited = [
                { name: 'Sales', icon: GridIcon, path: '/sales' },
                { name: 'Tickets', icon: ListIcon, path: '/tickets' },
                { name: 'Shift', icon: TimeIcon, path: '/shift' },
            ]
            return limited.map((item) => ({
                ...item,
                subItems: [],
                targetPath: item.path ?? '',
                visibleSubItems: [],
            }))
        }

        return MAIN_NAV_ITEMS.map((item) => {
            const visibleSubItems =
                item.subItems?.filter(
                    (sub) => !(sub.adminOnly && effectiveRole !== 'admin')
                ) ?? []
            const target =
                item.path ?? visibleSubItems.find((sub) => sub.path)?.path ?? ''
            return {
                ...item,
                targetPath: target,
                visibleSubItems,
            }
        }).filter((item) => item.targetPath.length > 0)
    }, [role])

    if (navItems.length === 0) return null

    const isItemActive = (item: BottomNavItem) => {
        if (pathname === item.targetPath) return true
        if (item.visibleSubItems.some((sub) => pathname.startsWith(sub.path))) {
            return true
        }
        return false
    }

    return (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-gray-800 dark:bg-gray-950/95 md:hidden">
            <ul className="flex items-center justify-around px-2 py-3">
                {navItems.map((item) => {
                    const Icon = item.icon
                    const active = isItemActive(item)
                    return (
                        <li key={item.name}>
                            <Link
                                href={item.targetPath}
                                className="flex flex-col items-center"
                            >
                                <span
                                    className={`flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition-colors dark:text-gray-400 ${
                                        active
                                            ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/40'
                                            : 'hover:text-gray-900 dark:hover:text-gray-100'
                                    }`}
                                >
                                    <Icon
                                        aria-hidden="true"
                                        className="h-6 w-6"
                                    />
                                </span>
                            </Link>
                        </li>
                    )
                })}
            </ul>
        </nav>
    )
}

export default MobileBottomNav
