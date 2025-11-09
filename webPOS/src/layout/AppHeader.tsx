'use client'
import { ThemeToggleButton } from '@/components/common/ThemeToggleButton'
import NotificationDropdown from '@/components/header/NotificationDropdown'
import UserDropdown from '@/components/header/UserDropdown'
import { useToast } from '@/components/uiz/use-toast'
import { useSidebar } from '@/context/SidebarContext'
import {
    MAIN_NAV_ITEMS,
    OTHER_NAV_ITEMS,
    type NavItem,
} from '@/layout/nav-config'
import { useTenant } from '@/context/TenantContext'
import { readCookie } from '@/lib/session'
import { useSession } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import React, { useEffect, useMemo, useRef, useState } from 'react'

import { ChevronLeftIcon } from '@/icons'

type NavEntry = {
    path: string
    name: string
}

const flattenNavItems = (items: NavItem[]): NavEntry[] => {
    return items.flatMap((item) => {
        const entries: NavEntry[] = []
        if (item.path) {
            entries.push({ path: item.path, name: item.name })
        }
        if (item.subItems?.length) {
            entries.push(
                ...item.subItems.map((sub) => ({
                    path: sub.path,
                    name: sub.name,
                }))
            )
        }
        return entries
    })
}

const toTitleCase = (raw: string): string => {
    return raw
        .split('-')
        .join(' ')
        .split('_')
        .join(' ')
        .split(' ')
        .filter(Boolean)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ')
}

type AppHeaderProps = {
    role: 'admin' | 'limited' | null
}

const AppHeader: React.FC<AppHeaderProps> = ({ role }) => {
    const [isApplicationMenuOpen, setApplicationMenuOpen] = useState(false)
    const { data: session } = useSession()
    const router = useRouter()
    const pathname = usePathname()
    const { tenant } = useTenant()

    const { isMobileOpen, toggleSidebar, toggleMobileSidebar } = useSidebar()

    const fallbackEmail = useMemo(() => {
        if (tenant?.accountEmail?.trim()) return tenant.accountEmail.trim()
        if (typeof window === 'undefined') return null
        try {
            const fromCookie = readCookie('accountEmail')
            return fromCookie?.trim() || null
        } catch {
            return null
        }
    }, [tenant?.accountEmail])

    const navEntries = useMemo<NavEntry[]>(() => {
        return [
            ...flattenNavItems(MAIN_NAV_ITEMS),
            ...flattenNavItems(OTHER_NAV_ITEMS),
        ]
    }, [])

    const routeTitle = useMemo(() => {
        const cleaned =
            pathname?.split('?')[0].replace(/\/+$/, '') || '/' || '/'
        if (cleaned === '/') {
            return 'POS Home'
        }
        const exact = navEntries.find((entry) => entry.path === cleaned)
        if (exact) return exact.name

        const partial = navEntries.find(
            (entry) =>
                entry.path !== '/' && cleaned.startsWith(`${entry.path}/`)
        )
        if (partial) return partial.name

        const parts = cleaned.split('/').filter(Boolean)
        if (parts.length === 0) return 'POS Home'
        return toTitleCase(parts[parts.length - 1])
    }, [navEntries, pathname])

    const handleBack = () => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
            router.back()
            return
        }
        router.push('/sales')
    }

    const handleToggle = () => {
        if (window.innerWidth >= 1024) {
            toggleSidebar()
        } else {
            toggleMobileSidebar()
        }
    }

    const toggleApplicationMenu = () => {
        setApplicationMenuOpen(!isApplicationMenuOpen)
    }
    const inputRef = useRef<HTMLInputElement>(null)
    const { toast } = useToast()
    const [query, setQuery] = useState('')
    const [menu, setMenu] = useState<
        { id: string; name: string; price: number; category?: string }[]
    >([])
    const [openResults, setOpenResults] = useState(false)

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
                event.preventDefault()
                inputRef.current?.focus()
            }
        }

        document.addEventListener('keydown', handleKeyDown)

        return () => {
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [])

    // Load menu items once for quick client-side search (local DB)
    useEffect(() => {
        ;(async () => {
            try {
                const { listMenu } = await import('@/lib/local-catalog')
                const rows = await listMenu()
                setMenu(
                    rows.map((m) => ({
                        id: m.id,
                        name: m.name,
                        price: m.price,
                        category: m.category,
                    }))
                )
            } catch {}
        })()
    }, [])

    const filtered = query.trim().length
        ? menu
              .filter((m) =>
                  m.name.toLowerCase().includes(query.trim().toLowerCase())
              )
              .slice(0, 8)
        : []

    const readCookie = (name: string) => {
        try {
            const match = document.cookie
                .split(';')
                .map((c) => c.trim())
                .find((c) => c.startsWith(name + '='))
            return match ? decodeURIComponent(match.split('=')[1]) : null
        } catch {
            return null
        }
    }

    const addItemToSelectedTicket = async (item: {
        id?: string
        name: string
        price: number
    }) => {
        const ticketId = readCookie('selectedTicket')
        if (!ticketId) {
            toast({
                title: 'No ticket selected',
                description: 'Open or select a ticket first.',
            })
            return
        }
        // Local-first: dispatch to POS view; network save happens when user saves the ticket
        try {
            window.dispatchEvent(
                new CustomEvent('pos:added-item', {
                    detail: {
                        ticketId,
                        name: item.name,
                        price: item.price,
                        qty: 1,
                    },
                })
            )
        } catch {}
        toast({
            title: 'Item added',
            description: `${item.name} added to ${ticketId}`,
        })
        setQuery('')
        setOpenResults(false)
    }

    return (
        <header className="sticky pt-[15px] top-0 z-[100] flex w-full border-b border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900">
            <div className="flex flex-col items-center justify-between grow lg:flex-row lg:px-6">
                <div className="flex w-full items-center justify-between gap-2 px-3 py-2.5 border-b border-gray-200 dark:border-gray-800 sm:gap-4 lg:border-b-0 lg:px-0 lg:py-4">
                    <div className="flex items-center gap-2 lg:gap-3">
                        <button
                            type="button"
                            onClick={handleBack}
                            aria-label="Go back"
                            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10 lg:hidden"
                        >
                            <ChevronLeftIcon
                                className="h-5 w-5"
                                aria-hidden="true"
                            />
                        </button>
                        {role !== 'limited' && (
                            <button
                                className="hidden h-11 w-11 items-center justify-center rounded-lg border border-gray-100 text-gray-500 dark:border-gray-800 dark:text-gray-400 lg:flex"
                                onClick={handleToggle}
                                aria-label="Toggle Sidebar"
                            >
                                {isMobileOpen ? (
                                    <svg
                                        width="24"
                                        height="24"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            fillRule="evenodd"
                                            clipRule="evenodd"
                                            d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                ) : (
                                    <svg
                                        width="16"
                                        height="12"
                                        viewBox="0 0 16 12"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            fillRule="evenodd"
                                            clipRule="evenodd"
                                            d="M0.583252 1C0.583252 0.585788 0.919038 0.25 1.33325 0.25H14.6666C15.0808 0.25 15.4166 0.585786 15.4166 1C15.4166 1.41421 15.0808 1.75 14.6666 1.75L1.33325 1.75C0.919038 1.75 0.583252 1.41422 0.583252 1ZM0.583252 11C0.583252 10.5858 0.919038 10.25 1.33325 10.25L14.6666 10.25C15.0808 10.25 15.4166 10.5858 15.4166 11C15.4166 11.4142 15.0808 11.75 14.6666 11.75L1.33325 11.75C0.919038 11.75 0.583252 11.4142 0.583252 11ZM1.33325 5.25C0.919038 5.25 0.583252 5.58579 0.583252 6C0.583252 6.41421 0.919038 6.75 1.33325 6.75L7.99992 6.75C8.41413 6.75 8.74992 6.41421 8.74992 6C8.74992 5.58579 8.41413 5.25 7.99992 5.25L1.33325 5.25Z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                )}
                            </button>
                        )}
                        <span className="text-sm font-semibold text-gray-900 dark:text-white lg:text-lg">
                            {routeTitle}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative hidden lg:block">
                            <form>
                                <div className="relative">
                                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
                                        <svg
                                            className="fill-gray-500 dark:fill-gray-400"
                                            width="20"
                                            height="20"
                                            viewBox="0 0 20 20"
                                            fill="none"
                                            xmlns="http://www.w3.org/2000/svg"
                                        >
                                            <path
                                                fillRule="evenodd"
                                                clipRule="evenodd"
                                                d="M3.04175 9.37363C3.04175 5.87693 5.87711 3.04199 9.37508 3.04199C12.8731 3.04199 15.7084 5.87693 15.7084 9.37363C15.7084 12.8703 12.8731 15.7053 9.37508 15.7053C5.87711 15.7053 3.04175 12.8703 3.04175 9.37363ZM9.37508 1.54199C5.04902 1.54199 1.54175 5.04817 1.54175 9.37363C1.54175 13.6991 5.04902 17.2053 9.37508 17.2053C11.2674 17.2053 13.003 16.5344 14.357 15.4176L17.177 18.238C17.4699 18.5309 17.9448 18.5309 18.2377 18.238C18.5306 17.9451 18.5306 17.4703 18.2377 17.1774L15.418 14.3573C16.5365 13.0033 17.2084 11.2669 17.2084 9.37363C17.2084 5.04817 13.7011 1.54199 9.37508 1.54199Z"
                                                fill=""
                                            />
                                        </svg>
                                    </span>
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        placeholder="Search items to add..."
                                        className="dark:bg-dark-900 h-11 w-full rounded-lg border border-gray-200 bg-transparent py-2.5 pl-12 pr-14 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 xl:w-[430px]"
                                        value={query}
                                        onChange={(e) => {
                                            setQuery(e.target.value)
                                            setOpenResults(true)
                                        }}
                                        onFocus={() => setOpenResults(!!query)}
                                        onKeyDown={(e) => {
                                            if (
                                                e.key === 'Enter' &&
                                                filtered.length > 0
                                            ) {
                                                e.preventDefault()
                                                addItemToSelectedTicket(
                                                    filtered[0]
                                                )
                                            } else if (e.key === 'Escape') {
                                                setOpenResults(false)
                                            }
                                        }}
                                    />
                                    {openResults && filtered.length > 0 && (
                                        <div className="z-[1000] absolute left-0 right-0 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900">
                                            <ul className="max-h-72 overflow-y-auto">
                                                {filtered.map((m) => (
                                                    <li key={m.id}>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                addItemToSelectedTicket(
                                                                    m
                                                                )
                                                            }
                                                            className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-white/5"
                                                        >
                                                            <span className="truncate">
                                                                {m.name}
                                                            </span>
                                                            <span className="ml-3 shrink-0 text-gray-500">
                                                                $
                                                                {m.price.toFixed(
                                                                    2
                                                                )}
                                                            </span>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    <button className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-[7px] py-[4.5px] text-xs -tracking-[0.2px] text-gray-500 dark:border-gray-800 dark:bg-white/3 dark:text-gray-400">
                                        <span> ⌘ </span>
                                        <span> K </span>
                                    </button>
                                </div>
                            </form>
                        </div>
                        <button
                            onClick={toggleApplicationMenu}
                            className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 lg:hidden"
                        >
                            <svg
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    fillRule="evenodd"
                                    clipRule="evenodd"
                                    d="M5.99902 10.4951C6.82745 10.4951 7.49902 11.1667 7.49902 11.9951V12.0051C7.49902 12.8335 6.82745 13.5051 5.99902 13.5051C5.1706 13.5051 4.49902 12.8335 4.49902 12.0051V11.9951C4.49902 11.1667 5.1706 10.4951 5.99902 10.4951ZM17.999 10.4951C18.8275 10.4951 19.499 11.1667 19.499 11.9951V12.0051C19.499 12.8335 18.8275 13.5051 17.999 13.5051C17.1706 13.5051 16.499 12.8335 16.499 12.0051V11.9951C16.499 11.1667 17.1706 10.4951 17.999 10.4951ZM13.499 11.9951C13.499 11.1667 12.8275 10.4951 11.999 10.4951C11.1706 10.4951 10.499 11.1667 10.499 11.9951V12.0051C10.499 12.8335 11.1706 13.5051 11.999 13.5051C12.8275 13.5051 13.499 12.8335 13.499 12.0051V11.9951Z"
                                    fill="currentColor"
                                />
                            </svg>
                        </button>
                    </div>
                </div>
                <div
                    className={`${
                        isApplicationMenuOpen ? 'flex' : 'hidden'
                    } items-center justify-between w-full gap-4 px-5 py-4 lg:flex shadow-theme-md lg:justify-end lg:px-0 lg:shadow-none`}
                >
                    <div className="flex items-center gap-2 2xsm:gap-3">
                        {/* <!-- Dark Mode Toggler --> */}

                        <ThemeToggleButton />
                        {/* <!-- Dark Mode Toggler --> */}

                        <span className="hidden items-center gap-1 text-xs text-gray-500 dark:text-gray-400 lg:inline-flex">
                            {(() => {
                                const displayEmail =
                                    session?.user?.email ?? fallbackEmail
                                if (displayEmail) {
                                    return (
                                        <>
                                            Signed in as
                                            <span className="font-medium text-gray-700 dark:text-gray-200">
                                                {displayEmail}
                                            </span>
                                        </>
                                    )
                                }
                                return 'Not signed in'
                            })()}
                        </span>

                        <NotificationDropdown />
                        {/* <!-- Notification Menu Area --> */}
                    </div>
                    {/* <!-- User Area --> */}
                    <UserDropdown />
                </div>
            </div>
        </header>
    )
}

export default AppHeader
