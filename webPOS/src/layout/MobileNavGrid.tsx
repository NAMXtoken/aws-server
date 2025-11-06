'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import React, { useEffect, useMemo, useState } from 'react'

import {
    MAIN_NAV_ITEMS,
    OTHER_NAV_ITEMS,
    type NavItem,
    type NavSubItem,
} from '@/layout/nav-config'
import { ArrowRightIcon } from '@/icons'
import { db } from '@/lib/db'
import { DEFAULT_GENERAL_SETTINGS, loadGeneralSettings } from '@/lib/settings'
import type { ReportCacheEntry, ShiftRecord, Ticket } from '@/types/db'

type Role = 'admin' | 'limited' | null

type NavLink = {
    name: string
    path: string
}

type NavGroup = {
    id: string
    name: string
    icon: React.ReactNode
    links: NavLink[]
    group: 'main' | 'others'
    primaryPath: string
}

type InsightAccent = 'brand' | 'neutral' | 'alert'

type Insight = {
    title: string
    value: string
    helper?: string
    accent?: InsightAccent
}

const INSIGHT_ACCENT_CLASSES: Record<InsightAccent, string> = {
    brand: 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-400/40 dark:bg-brand-500/15 dark:text-brand-100',
    neutral:
        'border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200',
    alert: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/50 dark:bg-amber-500/20 dark:text-amber-100',
}

const IDLE_TICKET_THRESHOLD_MS = 45 * 60 * 1000 // 45 minutes
const WEEK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
    try {
        return await promise
    } catch {
        return fallback
    }
}

const formatDurationShort = (ms: number): string => {
    const totalMinutes = Math.max(0, Math.floor(ms / 60000))
    if (totalMinutes < 1) return '<1m'
    if (totalMinutes < 60) return `${totalMinutes}m`
    const totalHours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (totalHours < 24) {
        return minutes ? `${totalHours}h ${minutes}m` : `${totalHours}h`
    }
    const totalDays = Math.floor(totalHours / 24)
    const hours = totalHours % 24
    return hours ? `${totalDays}d ${hours}h` : `${totalDays}d`
}

const formatRelativeTime = (timestamp: number, now: number): string => {
    const diff = Math.max(0, now - timestamp)
    if (diff < 60_000) return 'moments ago'
    if (diff < 3_600_000) {
        const minutes = Math.floor(diff / 60_000)
        return `${minutes}m ago`
    }
    if (diff < 86_400_000) {
        const hours = Math.floor(diff / 3_600_000)
        return `${hours}h ago`
    }
    const days = Math.floor(diff / 86_400_000)
    return `${days}d ago`
}

const formatTimeOfDay = (timestamp: number, locale: string): string => {
    try {
        return new Date(timestamp).toLocaleTimeString(locale, {
            hour: 'numeric',
            minute: '2-digit',
        })
    } catch {
        return new Date(timestamp).toLocaleTimeString()
    }
}

const formatDate = (timestamp: number, locale: string): string => {
    try {
        return new Date(timestamp).toLocaleDateString(locale, {
            month: 'short',
            day: 'numeric',
        })
    } catch {
        return new Date(timestamp).toLocaleDateString()
    }
}

const formatCurrency = (
    value: number,
    locale: string,
    currency: string
): string => {
    try {
        return new Intl.NumberFormat(locale || undefined, {
            style: 'currency',
            currency: currency || DEFAULT_GENERAL_SETTINGS.currencyCode,
            maximumFractionDigits: 2,
        }).format(value)
    } catch {
        return `${currency || DEFAULT_GENERAL_SETTINGS.currencyCode} ${value.toFixed(
            2
        )}`
    }
}

const formatCurrencyCompact = (
    value: number,
    locale: string,
    currency: string
): string => {
    try {
        return new Intl.NumberFormat(locale || undefined, {
            style: 'currency',
            currency: currency || DEFAULT_GENERAL_SETTINGS.currencyCode,
            notation: 'compact',
            maximumFractionDigits: 1,
        }).format(value)
    } catch {
        return formatCurrency(value, locale, currency)
    }
}

const SCROLL_STORAGE_KEY = 'mobileNavGridTarget'
const COLLAPSE_STORAGE_KEY = 'mobileNavGridCollapse'
const COLLAPSE_EVENT = 'mobileNavGrid:collapse'

const deriveRoleFromCookies = (): Role => {
    if (typeof document === 'undefined') return null
    const cookie = document.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('role='))
    if (!cookie) return null
    const value = cookie.split('=')[1]
    return value === 'admin' || value === 'limited' ? value : null
}

const filterSubItems = (
    subItems: NavSubItem[] | undefined,
    role: Role
): NavSubItem[] => {
    if (!subItems) return []
    return subItems.filter((sub) => !(sub.adminOnly && role !== 'admin'))
}

const groupNavItems = (
    items: NavItem[],
    role: Role,
    group: 'main' | 'others'
): NavGroup[] => {
    const grouped: NavGroup[] = []

    items.forEach((item) => {
        const Icon = item.icon
        const iconEl = <Icon aria-hidden="true" className="h-10 w-10" />
        const filteredSubs = filterSubItems(item.subItems, role)

        let links: NavLink[] = []

        if (filteredSubs.length > 0) {
            links = filteredSubs.map((sub) => ({
                name: sub.name,
                path: sub.path,
            }))
        } else if (item.path) {
            links = [
                {
                    name: item.name,
                    path: item.path,
                },
            ]
        }

        if (role === 'limited') {
            links = links.filter((link) => curatedLimitedPaths.has(link.path))
        }

        if (links.length === 0) return

        const id = `${group}-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

        const primaryPath = links[0]?.path ?? item.path ?? '#'

        grouped.push({
            id,
            name: item.name,
            icon: iconEl,
            links,
            group,
            primaryPath,
        })
    })

    return grouped
}

const curatedLimitedPaths = new Set<string>([
    '/sales',
    '/tickets',
    '/shift',
    '/profile',
])

const matchesPath = (pathname: string, path: string): boolean => {
    if (pathname === path) return true
    return path !== '/' && pathname.startsWith(path)
}

const scrollToAnchor = (path: string) => {
    if (typeof document === 'undefined') return
    const target = document.querySelector<HTMLElement>(
        `[data-nav-target="${path}"]`
    )
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const collapseGrid = () => {
    if (typeof window === 'undefined') return
    try {
        window.sessionStorage.setItem(COLLAPSE_STORAGE_KEY, '1')
    } catch {
        /* ignore session storage errors */
    }
    try {
        window.dispatchEvent(new Event(COLLAPSE_EVENT))
    } catch {
        /* ignore event errors */
    }
}

const MobileNavGrid: React.FC = () => {
    const pathname = usePathname()
    const router = useRouter()
    const [role, setRole] = useState<Role>(null)
    const [insights, setInsights] = useState<Record<string, Insight[]>>({})

    useEffect(() => {
        const nextRole = deriveRoleFromCookies()
        setRole((prev) => (prev === nextRole ? prev : nextRole))
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') return
        const pending = window.sessionStorage.getItem(SCROLL_STORAGE_KEY)
        if (!pending) return
        if (!matchesPath(pathname, pending)) return
        window.sessionStorage.removeItem(SCROLL_STORAGE_KEY)
        scrollToAnchor(pending)
    }, [pathname])

    useEffect(() => {
        if (typeof window === 'undefined') return
        let cancelled = false

        const loadInsights = async () => {
            const settings = loadGeneralSettings()
            const locale =
                settings.locale || DEFAULT_GENERAL_SETTINGS.locale || 'en-US'
            const currency =
                settings.currencyCode ||
                DEFAULT_GENERAL_SETTINGS.currencyCode ||
                'USD'
            const now = Date.now()
            const startOfDay = new Date(now)
            startOfDay.setHours(0, 0, 0, 0)
            const dayStart = startOfDay.getTime()

            const todaysClosedTickets = await safe<Ticket[]>(
                db.tickets
                    .where('closedAt')
                    .between(dayStart, now, true, true)
                    .toArray(),
                [] as Ticket[]
            )
            const openTickets = await safe<Ticket[]>(
                db.tickets.where('status').equals('open').toArray(),
                [] as Ticket[]
            )
            const userCount = await safe<number>(db.users.count(), 0)
            const adminCount = await safe<number>(
                db.users.where('role').equals('admin').count(),
                0
            )
            const openShiftCount = await safe<number>(
                db.shifts.where('status').equals('open').count(),
                0
            )
            const latestShift = await safe<ShiftRecord | undefined>(
                db.shifts.orderBy('openedAt').reverse().first(),
                undefined
            )
            const lastClosedShift = await safe<ShiftRecord | undefined>(
                db.shifts.orderBy('closedAt').reverse().first(),
                undefined
            )
            const lastReport = await safe<ReportCacheEntry | undefined>(
                db.reports_cache.orderBy('fetchedAt').reverse().first(),
                undefined
            )
            const inventoryCount = await safe<number>(
                db.inventory_items.count(),
                0
            )
            const restocksThisWeek = await safe<number>(
                db.restock_records
                    .where('timestamp')
                    .above(now - WEEK_WINDOW_MS)
                    .count(),
                0
            )

            const totals = todaysClosedTickets.reduce(
                (acc, ticket) => {
                    const total =
                        ticket.total ?? ticket.payAmount ?? ticket.subtotal ?? 0
                    acc.total += total
                    switch (ticket.payMethod) {
                        case 'cash':
                            acc.cash += total
                            break
                        case 'card':
                            acc.card += total
                            break
                        case 'promptPay':
                            acc.promptPay += total
                            break
                        default:
                            acc.other += total
                    }
                    return acc
                },
                { total: 0, cash: 0, card: 0, promptPay: 0, other: 0 }
            )

            const staleTickets = openTickets
                .filter((ticket) => {
                    const openedAt = ticket.openedAt ?? now
                    return now - openedAt > IDLE_TICKET_THRESHOLD_MS
                })
                .sort((a, b) => (a.openedAt ?? 0) - (b.openedAt ?? 0))
            const stalePreview = staleTickets.slice(0, 2).map((ticket) => {
                const openedAt = ticket.openedAt ?? now
                const label = ticket.name || ticket.id
                return `${label} · ${formatDurationShort(now - openedAt)}`
            })

            const dashboardInsights: Insight[] = [
                {
                    title: "Today's Sales",
                    value: formatCurrency(totals.total, locale, currency),
                    helper:
                        todaysClosedTickets.length > 0
                            ? `${todaysClosedTickets.length} closed ticket${todaysClosedTickets.length === 1 ? '' : 's'}`
                            : 'No closed tickets yet',
                    accent: 'brand',
                },
                {
                    title: 'Idle Tickets',
                    value: staleTickets.length
                        ? `${staleTickets.length} waiting`
                        : openTickets.length
                          ? `${openTickets.length} open`
                          : 'All clear',
                    helper: staleTickets.length
                        ? stalePreview.join(' • ') || 'Check older tickets'
                        : openTickets.length
                          ? 'All tickets active'
                          : 'No open tickets',
                    accent: staleTickets.length ? 'alert' : 'neutral',
                },
            ]

            const activeShift =
                latestShift && latestShift.status === 'open'
                    ? latestShift
                    : undefined
            const lastClosed =
                lastClosedShift && lastClosedShift.closedAt
                    ? lastClosedShift
                    : undefined

            const staffInsights: Insight[] = [
                {
                    title: 'Team Members',
                    value: userCount > 0 ? `${userCount}` : 'Add staff',
                    helper:
                        adminCount > 0
                            ? `${adminCount} admin${adminCount === 1 ? '' : 's'} on roster`
                            : 'Assign roles to unlock permissions',
                    accent: 'brand',
                },
            ]
            if (activeShift) {
                staffInsights.push({
                    title: 'Shift Lead',
                    value: activeShift.openedBy
                        ? activeShift.openedBy.split(' ')[0]
                        : 'Shift in progress',
                    helper: `Opened ${formatRelativeTime(
                        activeShift.openedAt,
                        now
                    )}`,
                    accent: 'neutral',
                })
            } else if (lastClosed) {
                staffInsights.push({
                    title: 'Last Shift',
                    value: formatTimeOfDay(
                        lastClosed.closedAt as number,
                        locale
                    ),
                    helper: `Closed ${formatRelativeTime(
                        lastClosed.closedAt as number,
                        now
                    )}`,
                    accent: 'neutral',
                })
            } else {
                staffInsights.push({
                    title: 'Shifts',
                    value: 'Not started',
                    helper: 'Open the register to begin tracking',
                    accent: 'neutral',
                })
            }

            const cashInsights: Insight[] = [
                {
                    title: 'Drawer Status',
                    value: openShiftCount > 0 ? 'Open' : 'Closed',
                    helper:
                        openShiftCount > 0
                            ? `${openShiftCount} active shift${openShiftCount === 1 ? '' : 's'}`
                            : lastClosed
                              ? `Last close ${formatRelativeTime(
                                    lastClosed.closedAt as number,
                                    now
                                )}`
                              : 'No shift history yet',
                    accent: openShiftCount > 0 ? 'brand' : 'neutral',
                },
                {
                    title: 'Cash Collected',
                    value: formatCurrency(totals.cash, locale, currency),
                    helper:
                        totals.card + totals.promptPay > 0
                            ? `Card ${formatCurrencyCompact(
                                  totals.card,
                                  locale,
                                  currency
                              )} · PromptPay ${formatCurrencyCompact(
                                  totals.promptPay,
                                  locale,
                                  currency
                              )}`
                            : 'No digital payments logged',
                    accent: totals.cash > 0 ? 'brand' : 'neutral',
                },
            ]

            const reportsInsights: Insight[] =
                lastReport && lastReport.fetchedAt
                    ? [
                          {
                              title: `${lastReport.range} Sales`,
                              value: formatCurrency(
                                  lastReport.cash +
                                      lastReport.card +
                                      lastReport.prompt,
                                  locale,
                                  currency
                              ),
                              helper: `${lastReport.tickets} ticket${lastReport.tickets === 1 ? '' : 's'}`,
                              accent: 'brand',
                          },
                          {
                              title: 'Last Sync',
                              value: formatDate(lastReport.fetchedAt, locale),
                              helper: formatRelativeTime(
                                  lastReport.fetchedAt,
                                  now
                              ),
                              accent: 'neutral',
                          },
                      ]
                    : [
                          {
                              title: 'Reports',
                              value: 'No data yet',
                              helper: 'Run a report to see trends here',
                              accent: 'neutral',
                          },
                      ]

            const inventoryInsights: Insight[] = [
                {
                    title: 'Items Tracked',
                    value:
                        inventoryCount > 0 ? `${inventoryCount}` : 'Sync menu',
                    helper:
                        inventoryCount > 0
                            ? 'Menu items linked to stock'
                            : 'Import menu to start tracking',
                    accent: 'brand',
                },
                {
                    title: 'Restocks',
                    value:
                        restocksThisWeek > 0
                            ? `${restocksThisWeek} this week`
                            : 'None logged',
                    helper:
                        restocksThisWeek > 0
                            ? 'Keep shelves replenished'
                            : 'Log restocks to monitor freshness',
                    accent: restocksThisWeek > 0 ? 'brand' : 'neutral',
                },
            ]

            const nextInsights: Record<string, Insight[]> = {
                '/sales': dashboardInsights,
                '/staff/users': staffInsights,
                '/cash/float': cashInsights,
                '/reports/sales': reportsInsights,
                '/inventory/set-stock': inventoryInsights,
            }

            if (!cancelled) {
                setInsights(nextInsights)
            }
        }

        void loadInsights()

        const refreshOnSettingsUpdate = () => {
            void loadInsights()
        }

        window.addEventListener('pos:settings:updated', refreshOnSettingsUpdate)

        return () => {
            cancelled = true
            window.removeEventListener(
                'pos:settings:updated',
                refreshOnSettingsUpdate
            )
        }
    }, [])

    const groups = useMemo(() => {
        const main = groupNavItems(MAIN_NAV_ITEMS, role, 'main')
        const others = groupNavItems(OTHER_NAV_ITEMS, role, 'others')
        return [...main, ...others]
    }, [role])

    if (groups.length === 0) return null

    return (
        <nav aria-label="Primary navigation" className="md:hidden -mx-5">
            <div
                className="relative"
                style={{
                    paddingLeft: 'env(safe-area-inset-left, 0px)',
                    paddingRight: 'env(safe-area-inset-right, 0px)',
                }}
            >
                <div
                    className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-6"
                    style={{
                        paddingLeft:
                            'calc(env(safe-area-inset-left, 0px) + 1rem)',
                        paddingRight:
                            'calc(env(safe-area-inset-right, 0px) + 1rem)',
                        scrollPaddingLeft:
                            'calc(env(safe-area-inset-left, 0px) + 1rem)',
                        scrollPaddingRight:
                            'calc(env(safe-area-inset-right, 0px) + 1rem)',
                    }}
                >
                    {groups.map((group) => {
                        const active = group.links.some((link) =>
                            matchesPath(pathname, link.path)
                        )
                        const insightItems = insights[group.primaryPath] ?? []
                        const insightCardClasses = active
                            ? 'rounded-3xl border border-brand-400/60 bg-brand-50/90 px-5 py-5 text-brand-800 shadow-sm transition-colors dark:border-brand-400/50 dark:bg-brand-500/10 dark:text-brand-100'
                            : 'rounded-3xl border border-gray-200 bg-white px-5 py-5 text-gray-800 shadow-sm transition-colors dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200'

                        return (
                            <section
                                key={group.id}
                                className="snap-start snap-always w-full flex-shrink-0"
                                data-nav-target={group.primaryPath}
                            >
                                <div className="mx-auto flex h-full w-[calc(100vw-2.5rem)] max-w-sm flex-col gap-3 sm:w-80">
                                    {insightItems.length > 0 ? (
                                        <div className={insightCardClasses}>
                                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                {insightItems.map(
                                                    (insight, index) => (
                                                        <div
                                                            key={`${group.id}-insight-${index}`}
                                                            className={`rounded-2xl border px-4 py-3 text-xs leading-relaxed shadow-sm ${INSIGHT_ACCENT_CLASSES[insight.accent ?? 'neutral']}`}
                                                        >
                                                            <p className="font-semibold uppercase tracking-wide opacity-70">
                                                                {insight.title}
                                                            </p>
                                                            <p className="mt-1 text-sm font-semibold leading-tight">
                                                                {insight.value}
                                                            </p>
                                                            {insight.helper ? (
                                                                <p className="mt-1 text-[11px] opacity-80">
                                                                    {
                                                                        insight.helper
                                                                    }
                                                                </p>
                                                            ) : null}
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    ) : null}
                                    <div
                                        className={`flex h-full w-full flex-col rounded-3xl border px-5 py-6 shadow-sm transition-colors ${
                                            active
                                                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-200'
                                                : 'border-gray-200 bg-white text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100'
                                        }`}
                                    >
                                        <header className="flex items-center gap-4">
                                            <span
                                                className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl ${
                                                    active
                                                        ? 'bg-brand-500/10 text-brand-600 dark:bg-brand-500/20 dark:text-brand-200'
                                                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-200'
                                                }`}
                                            >
                                                {group.icon}
                                            </span>
                                            <div className="flex flex-1 flex-col">
                                                <span className="text-base font-semibold">
                                                    {group.name}
                                                </span>
                                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                                    {group.group === 'main'
                                                        ? 'Core workflows'
                                                        : 'Additional tools'}
                                                </span>
                                            </div>
                                            <span className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                                {group.links.length}
                                            </span>
                                        </header>

                                        <ul className="mt-6 grid gap-2">
                                            {group.links.map((link) => {
                                                const linkIsActive =
                                                    matchesPath(
                                                        pathname,
                                                        link.path
                                                    )

                                                return (
                                                    <li key={link.path}>
                                                        <Link
                                                            href={link.path}
                                                            prefetch={false}
                                                            data-nav-target={
                                                                link.path
                                                            }
                                                            className={`group flex items-center justify-between rounded-2xl border px-4 py-3 text-sm font-medium transition-colors ${
                                                                linkIsActive
                                                                    ? 'border-brand-500 bg-white text-brand-700 shadow-sm dark:border-brand-400 dark:bg-gray-950 dark:text-brand-200'
                                                                    : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-brand-400 hover:bg-brand-50/60 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-200 dark:hover:border-brand-400/60 dark:hover:bg-brand-500/10'
                                                            }`}
                                                            onClick={(
                                                                event
                                                            ) => {
                                                                event.preventDefault()
                                                                if (
                                                                    linkIsActive
                                                                ) {
                                                                    collapseGrid()
                                                                    scrollToAnchor(
                                                                        link.path
                                                                    )
                                                                    return
                                                                }
                                                                try {
                                                                    if (
                                                                        typeof window !==
                                                                        'undefined'
                                                                    ) {
                                                                        window.sessionStorage.setItem(
                                                                            SCROLL_STORAGE_KEY,
                                                                            link.path
                                                                        )
                                                                    }
                                                                } catch {
                                                                    /* ignore session storage errors */
                                                                }
                                                                collapseGrid()
                                                                router.push(
                                                                    link.path
                                                                )
                                                            }}
                                                        >
                                                            <span>
                                                                {link.name}
                                                            </span>
                                                            <ArrowRightIcon
                                                                aria-hidden="true"
                                                                className={`h-4 w-4 transition-transform group-hover:translate-x-1 ${
                                                                    linkIsActive
                                                                        ? 'text-brand-600 dark:text-brand-200'
                                                                        : 'text-gray-400'
                                                                }`}
                                                            />
                                                        </Link>
                                                    </li>
                                                )
                                            })}
                                        </ul>
                                    </div>
                                </div>
                            </section>
                        )
                    })}
                </div>
            </div>
        </nav>
    )
}

export default MobileNavGrid
