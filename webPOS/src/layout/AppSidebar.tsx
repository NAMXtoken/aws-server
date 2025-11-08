'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useSidebar } from '@/context/SidebarContext'
import { ChevronDownIcon, HorizontaLDots } from '@/icons'
import {
    MAIN_NAV_ITEMS,
    OTHER_NAV_ITEMS,
    type NavItem,
    type NavSubItem,
} from '@/layout/nav-config'
import SidebarWidget from './SidebarWidget'

type Role = 'admin' | 'limited' | null

type SidebarNavSubItem = Omit<NavSubItem, 'adminOnly'>

type SidebarNavItem = {
    name: string
    icon: React.ReactNode
    path?: string
    subItems?: SidebarNavSubItem[]
}

const buildSidebarNav = (items: NavItem[], role: Role): SidebarNavItem[] => {
    return items.reduce<SidebarNavItem[]>((acc, item) => {
        const Icon = item.icon
        const rawSubItems = item.subItems ?? []

        const visibleSubItems: SidebarNavSubItem[] = rawSubItems
            .filter((sub) => !(sub.adminOnly && role !== 'admin'))
            .map(({ adminOnly, ...rest }) => rest)

        const hasOriginalSubItems = rawSubItems.length > 0
        const hasVisibleSubItems = visibleSubItems.length > 0

        if (hasOriginalSubItems && !hasVisibleSubItems) {
            if (item.path) {
                acc.push({
                    name: item.name,
                    icon: <Icon aria-hidden="true" className="h-6 w-6" />,
                    path: item.path,
                })
            }
            return acc
        }

        acc.push({
            name: item.name,
            icon: <Icon aria-hidden="true" className="h-6 w-6" />,
            path: item.path,
            subItems: hasVisibleSubItems ? visibleSubItems : undefined,
        })

        return acc
    }, [])
}

type AppSidebarProps = {
    role: Role
}

const AppSidebar: React.FC<AppSidebarProps> = ({ role }) => {
    const { isExpanded, isMobileOpen, isHovered, setIsHovered, isMobile } =
        useSidebar()
    const pathname = usePathname()

    if (isMobile) {
        return null
    }

    const limitedMainItems = useMemo(
        () =>
            role === 'limited'
                ? MAIN_NAV_ITEMS.filter((item) => item.name === 'Dashboard')
                : MAIN_NAV_ITEMS,
        [role]
    )

    const mainNavItems = useMemo(
        () => buildSidebarNav(limitedMainItems, role),
        [limitedMainItems, role]
    )
    const otherNavItems = useMemo(
        () => buildSidebarNav(OTHER_NAV_ITEMS, role),
        [role]
    )

    const [openSubmenu, setOpenSubmenu] = useState<{
        type: 'main' | 'others'
        index: number
    } | null>(null)
    const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>(
        {}
    )
    const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({})

    useEffect(() => {
        subMenuRefs.current = {}
        const schedule =
            typeof queueMicrotask === 'function'
                ? queueMicrotask
                : (cb: () => void) => Promise.resolve().then(cb)
        schedule(() => setSubMenuHeight({}))
    }, [mainNavItems, otherNavItems])

    const isActive = useCallback(
        (path: string) => path === pathname,
        [pathname]
    )

    useEffect(() => {
        let nextMatch: { type: 'main' | 'others'; index: number } | null = null
        const scanNav = (items: SidebarNavItem[], type: 'main' | 'others') => {
            items.forEach((nav, index) => {
                nav.subItems?.forEach((subItem) => {
                    if (!nextMatch && isActive(subItem.path)) {
                        nextMatch = { type, index }
                    }
                })
            })
        }

        scanNav(mainNavItems, 'main')
        scanNav(otherNavItems, 'others')

        const schedule =
            typeof queueMicrotask === 'function'
                ? queueMicrotask
                : (cb: () => void) => Promise.resolve().then(cb)
        schedule(() => {
            setOpenSubmenu((prev) => {
                if (
                    (nextMatch === null && prev === null) ||
                    (nextMatch &&
                        prev &&
                        nextMatch.type === prev.type &&
                        nextMatch.index === prev.index)
                ) {
                    return prev
                }
                return nextMatch
            })
        })
    }, [mainNavItems, otherNavItems, isActive])

    useEffect(() => {
        if (openSubmenu === null) return
        const key = `${openSubmenu.type}-${openSubmenu.index}`
        const node = subMenuRefs.current[key]
        if (!node) return
        const nextHeight = node.scrollHeight || 0
        const schedule =
            typeof queueMicrotask === 'function'
                ? queueMicrotask
                : (cb: () => void) => Promise.resolve().then(cb)
        schedule(() => {
            setSubMenuHeight((prev) => {
                if (prev[key] === nextHeight) return prev
                return { ...prev, [key]: nextHeight }
            })
        })
    }, [openSubmenu, isExpanded, isHovered, isMobileOpen])

    const handleSubmenuToggle = (
        index: number,
        menuType: 'main' | 'others'
    ) => {
        setOpenSubmenu((prev) => {
            if (prev?.type === menuType && prev.index === index) {
                return null
            }
            return { type: menuType, index }
        })
    }

    const renderMenuItems = (
        navItems: SidebarNavItem[],
        menuType: 'main' | 'others'
    ) => (
        <ul className="flex flex-col gap-4">
            {navItems.map((nav, index) => (
                <li key={`${menuType}-${nav.name}`}>
                    {nav.subItems ? (
                        <button
                            onClick={() => handleSubmenuToggle(index, menuType)}
                            className={`menu-item group ${
                                openSubmenu?.type === menuType &&
                                openSubmenu?.index === index
                                    ? 'menu-item-active'
                                    : 'menu-item-inactive'
                            } cursor-pointer ${
                                !isExpanded && !isHovered
                                    ? 'lg:justify-center'
                                    : 'lg:justify-start'
                            }`}
                        >
                            <span
                                className={`${
                                    openSubmenu?.type === menuType &&
                                    openSubmenu?.index === index
                                        ? 'menu-item-icon-active'
                                        : 'menu-item-icon-inactive'
                                }`}
                            >
                                {nav.icon}
                            </span>
                            {(isExpanded || isHovered || isMobileOpen) && (
                                <span className="menu-item-text">
                                    {nav.name}
                                </span>
                            )}
                            {(isExpanded || isHovered || isMobileOpen) && (
                                <ChevronDownIcon
                                    className={`ml-auto h-5 w-5 transition-transform duration-200 ${
                                        openSubmenu?.type === menuType &&
                                        openSubmenu?.index === index
                                            ? 'rotate-180 text-brand-500'
                                            : ''
                                    }`}
                                />
                            )}
                        </button>
                    ) : (
                        nav.path && (
                            <Link
                                href={nav.path}
                                className={`menu-item group ${
                                    isActive(nav.path)
                                        ? 'menu-item-active'
                                        : 'menu-item-inactive'
                                }`}
                            >
                                <span
                                    className={`${
                                        isActive(nav.path)
                                            ? 'menu-item-icon-active'
                                            : 'menu-item-icon-inactive'
                                    }`}
                                >
                                    {nav.icon}
                                </span>
                                {(isExpanded || isHovered || isMobileOpen) && (
                                    <span className="menu-item-text">
                                        {nav.name}
                                    </span>
                                )}
                            </Link>
                        )
                    )}
                    {nav.subItems &&
                        (isExpanded || isHovered || isMobileOpen) && (
                            <div
                                ref={(el) => {
                                    subMenuRefs.current[
                                        `${menuType}-${index}`
                                    ] = el
                                }}
                                className="overflow-hidden transition-all duration-300"
                                style={{
                                    height:
                                        openSubmenu?.type === menuType &&
                                        openSubmenu?.index === index
                                            ? `${subMenuHeight[`${menuType}-${index}`] ?? 0}px`
                                            : '0px',
                                }}
                            >
                                <ul className="ml-9 mt-2 space-y-1">
                                    {nav.subItems.map((subItem) => (
                                        <li key={subItem.name}>
                                            <Link
                                                href={subItem.path}
                                                className={`menu-dropdown-item ${
                                                    isActive(subItem.path)
                                                        ? 'menu-dropdown-item-active'
                                                        : 'menu-dropdown-item-inactive'
                                                }`}
                                            >
                                                {subItem.name}
                                                <span className="ml-auto flex items-center gap-1">
                                                    {subItem.new && (
                                                        <span
                                                            className={`menu-dropdown-badge ${
                                                                isActive(
                                                                    subItem.path
                                                                )
                                                                    ? 'menu-dropdown-badge-active'
                                                                    : 'menu-dropdown-badge-inactive'
                                                            }`}
                                                        >
                                                            new
                                                        </span>
                                                    )}
                                                    {subItem.pro && (
                                                        <span
                                                            className={`menu-dropdown-badge ${
                                                                isActive(
                                                                    subItem.path
                                                                )
                                                                    ? 'menu-dropdown-badge-active'
                                                                    : 'menu-dropdown-badge-inactive'
                                                            }`}
                                                        >
                                                            pro
                                                        </span>
                                                    )}
                                                </span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                </li>
            ))}
        </ul>
    )

    const showSidebarWidget =
        (isExpanded || isHovered || isMobileOpen) && role !== 'limited'

    return (
        <aside
            className={`fixed top-0 left-0 z-50 mt-8 hidden h-screen flex-col border-r border-gray-200 bg-white px-5 text-gray-900 transition-all duration-300 ease-in-out dark:border-gray-800 dark:bg-gray-900 lg:mt-0 lg:flex
            ${
                isExpanded
                    ? 'w-[290px]'
                    : isHovered
                      ? 'w-[290px]'
                      : 'w-[90px]'
            }`}
            onMouseEnter={() => !isExpanded && setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div
                className={`py-8 flex ${
                    !isExpanded && !isHovered
                        ? 'lg:justify-center'
                        : 'justify-start'
                }`}
            >
                <Link href="/">
                    {isExpanded || isHovered || isMobileOpen ? (
                        <>
                            <Image
                                className="dark:hidden"
                                src="/images/logo/logo.png"
                                alt="Logo"
                                width={150}
                                height={40}
                            />
                            <Image
                                className="hidden dark:block"
                                src="/images/logo/logo-dark.svg"
                                alt="Logo"
                                width={150}
                                height={40}
                            />
                        </>
                    ) : (
                        <Image
                            src="/images/logo/logo-icon.png"
                            alt="Logo"
                            width={32}
                            height={32}
                        />
                    )}
                </Link>
            </div>
            <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
                <nav className="mb-6">
                    <div className="flex flex-col gap-4">
                        {mainNavItems.length > 0 && (
                            <div>
                                <h2
                                    className={`mb-4 flex text-xs uppercase leading-[20px] text-gray-400 ${
                                        !isExpanded && !isHovered
                                            ? 'lg:justify-center'
                                            : 'justify-start'
                                    }`}
                                >
                                    {isExpanded || isHovered || isMobileOpen ? (
                                        'Menu'
                                    ) : (
                                        <HorizontaLDots />
                                    )}
                                </h2>
                                {renderMenuItems(mainNavItems, 'main')}
                            </div>
                        )}

                        {otherNavItems.length > 0 && (
                            <div>
                                <h2
                                    className={`mb-4 flex text-xs uppercase leading-[20px] text-gray-400 ${
                                        !isExpanded && !isHovered
                                            ? 'lg:justify-center'
                                            : 'justify-start'
                                    }`}
                                >
                                    {isExpanded || isHovered || isMobileOpen ? (
                                        'Others'
                                    ) : (
                                        <HorizontaLDots />
                                    )}
                                </h2>
                                {renderMenuItems(otherNavItems, 'others')}
                            </div>
                        )}
                    </div>
                </nav>
                {showSidebarWidget ? <SidebarWidget /> : null}
            </div>
        </aside>
    )
}

export default AppSidebar
