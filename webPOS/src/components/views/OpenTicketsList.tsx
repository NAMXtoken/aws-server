'use client'

import MergeTicketModal from '@/components/tickets/MergeTicketModal'
import SplitTicketModal from '@/components/tickets/SplitTicketModal'
import TransferTicketModal from '@/components/tickets/TransferTicketModal'
import Button from '@/components/ui/button/Button'
import { Dropdown } from '@/components/ui/dropdown/Dropdown'
import { DropdownItem } from '@/components/ui/dropdown/DropdownItem'
import MobileNavGrid from '@/layout/MobileNavGrid'
import { db } from '@/lib/db'
import { getCurrentShift } from '@/lib/local-pos'
import {
    DEFAULT_GENERAL_SETTINGS,
    GENERAL_SETTINGS_STORAGE_KEY,
    deriveCurrencySymbol,
    loadGeneralSettings,
} from '@/lib/settings'
import { liveQuery } from 'dexie'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

type TicketRow = {
    ticketId: string
    openedBy?: string
    ticketName?: string
    status: 'open' | 'closed' | string
    openedAt?: number
    closedAt?: number | null
    closedBy?: string | null
    payMethod?: string | null
    payAmount?: number | null
}

const normalizeShiftIdValue = (value?: string | null): string => {
    if (!value) return ''
    const digits = String(value)
        .replace(/[^0-9]/g, '')
        .trim()
    return digits ? digits.padStart(3, '0') : String(value).trim()
}

const NAV_GRID_COLLAPSE_KEY = 'mobileNavGridCollapse'
const NAV_GRID_COLLAPSE_EVENT = 'mobileNavGrid:collapse'

export default function OpenTicketsList() {
    const pathname = usePathname()
    const disableNavGrid = pathname === '/sales' || pathname === '/tickets'
    const [loading, setLoading] = useState(true)
    const [tickets, setTickets] = useState<TicketRow[]>([])
    const [totals, setTotals] = useState<Record<string, number>>({})
    const [query, setQuery] = useState('')
    const [creatingTicket, setCreatingTicket] = useState(false)
    const [settings, setSettings] = useState(DEFAULT_GENERAL_SETTINGS)
    const [activeDropdownId, setActiveDropdownId] = useState<string | null>(
        null
    )
    const [splitTicketId, setSplitTicketId] = useState<string | null>(null)
    const [splitTicketSummary, setSplitTicketSummary] =
        useState<TicketRow | null>(null)
    const [transferTicketId, setTransferTicketId] = useState<string | null>(
        null
    )
    const [transferTicketSummary, setTransferTicketSummary] =
        useState<TicketRow | null>(null)
    const [mergeTicketId, setMergeTicketId] = useState<string | null>(null)
    const [mergeTicketSummary, setMergeTicketSummary] =
        useState<TicketRow | null>(null)
    const router = useRouter()
    const [showNavGrid, setShowNavGrid] = useState(() => {
        if (disableNavGrid) return false
        if (typeof window === 'undefined') return true
        return window.sessionStorage.getItem(NAV_GRID_COLLAPSE_KEY) !== '1'
    })

    useEffect(() => {
        if (typeof window === 'undefined') return
        const refresh = () => {
            try {
                setSettings(loadGeneralSettings())
            } catch {
                setSettings({ ...DEFAULT_GENERAL_SETTINGS })
            }
        }
        refresh()
        const handleStorage = (event: StorageEvent) => {
            if (!event.key || event.key === GENERAL_SETTINGS_STORAGE_KEY) {
                refresh()
            }
        }
        const handleCustom = () => refresh()
        window.addEventListener('storage', handleStorage)
        window.addEventListener('pos:settings:updated', handleCustom)
        return () => {
            window.removeEventListener('storage', handleStorage)
            window.removeEventListener('pos:settings:updated', handleCustom)
        }
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') return
        const collapse = () => setShowNavGrid(false)
        window.addEventListener(NAV_GRID_COLLAPSE_EVENT, collapse)
        try {
            const flag = window.sessionStorage.getItem(NAV_GRID_COLLAPSE_KEY)
            if (flag === '1') {
                setShowNavGrid(false)
            }
            window.sessionStorage.removeItem(NAV_GRID_COLLAPSE_KEY)
        } catch {
            /* ignore storage errors */
        }
        return () => {
            window.removeEventListener(NAV_GRID_COLLAPSE_EVENT, collapse)
        }
    }, [])
    useEffect(() => {
        if (disableNavGrid) {
            setShowNavGrid(false)
        }
    }, [disableNavGrid])

    const currencyFormatter = useMemo(() => {
        try {
            if (typeof Intl === 'undefined') return null
            return new Intl.NumberFormat(settings.locale || 'en-US', {
                style: 'currency',
                currency: settings.currencyCode || 'USD',
            })
        } catch {
            return null
        }
    }, [settings.locale, settings.currencyCode])

    const currencySymbol = useMemo(() => {
        const trimmed = settings.currencySymbol?.trim()
        if (trimmed) return trimmed
        return deriveCurrencySymbol(settings.currencyCode, settings.locale)
    }, [settings.currencySymbol, settings.currencyCode, settings.locale])

    const formatCurrency = useCallback(
        (amount: number) => {
            const safe = Number.isFinite(amount) ? amount : 0
            if (currencyFormatter) {
                try {
                    return currencyFormatter.format(safe)
                } catch {
                    /* ignore formatter errors */
                }
            }
            if (currencySymbol && currencySymbol.length > 0) {
                return `${currencySymbol}${safe.toFixed(2)}`
            }
            return safe.toFixed(2)
        },
        [currencyFormatter, currencySymbol]
    )

    useEffect(() => {
        let mounted = true
        const sub = liveQuery(async () => {
            const currentShift = await getCurrentShift()
            const rawShiftId = currentShift
                ? ((currentShift as any).rawId as string | undefined) ||
                  currentShift.id
                : ''
            const normalizedShiftId = normalizeShiftIdValue(
                currentShift ? currentShift.id : rawShiftId
            )
            const prefixSet = new Set<string>()
            if (rawShiftId) prefixSet.add(`${rawShiftId}-`)
            if (normalizedShiftId) prefixSet.add(`${normalizedShiftId}-`)
            const prefixes = Array.from(prefixSet).filter(
                (p) => p && p.trim().length > 0
            )
            const rawTickets = prefixes.length
                ? await db.tickets
                      .filter((t) => {
                          if (typeof t.id !== 'string') return false
                          return prefixes.some((prefix) =>
                              t.id.startsWith(prefix)
                          )
                      })
                      .toArray()
                : await db.tickets.toArray()
            const sorted = rawTickets.sort((a, b) => {
                const statusWeight = (value: string | undefined) =>
                    value === 'open' ? 0 : value === 'closed' ? 1 : 2
                const diff = statusWeight(a.status) - statusWeight(b.status)
                if (diff !== 0) return diff
                const timeA = (a.closedAt ?? a.openedAt ?? 0) || 0
                const timeB = (b.closedAt ?? b.openedAt ?? 0) || 0
                return timeB - timeA
            })
            const ids = sorted.map((t) => t.id)
            const items = ids.length
                ? await db.ticket_items.where('ticketId').anyOf(ids).toArray()
                : []
            return { tickets: sorted, items }
        }).subscribe({
            next: ({ tickets: shiftTickets, items }) => {
                if (!mounted) return
                setTickets(
                    shiftTickets.map((t) => ({
                        ticketId: t.id,
                        openedBy: t.openedBy || '-',
                        ticketName: (t as any).name,
                        status:
                            (t.status as 'open' | 'closed' | string) || 'open',
                        openedAt: t.openedAt,
                        closedAt: t.closedAt ?? null,
                        closedBy: t.closedBy ?? null,
                        payMethod: (t.payMethod as string | undefined) || null,
                        payAmount:
                            typeof t.payAmount === 'number'
                                ? t.payAmount
                                : null,
                    }))
                )
                // compute totals map
                const byId: Record<string, number> = {}
                for (const it of items as any[]) {
                    const tid = String((it as any).ticketId || '')
                    const qty = Number((it as any).qty || 0) || 0
                    const price = Number((it as any).price || 0) || 0
                    byId[tid] = (byId[tid] || 0) + qty * price
                }
                setTotals(byId)
                setLoading(false)
            },
            error: () => {
                if (!mounted) return
                setTickets([])
                setTotals({})
                setLoading(false)
            },
        })
        return () => {
            mounted = false
            try {
                sub.unsubscribe()
            } catch {}
        }
    }, [])

    const totalNumber = (id: string) => Number(totals[id] || 0)
    const displayTotal = (ticket: TicketRow) => {
        const payAmount = Number(ticket.payAmount ?? NaN)
        const amount =
            ticket.status === 'closed' && Number.isFinite(payAmount)
                ? payAmount
                : totalNumber(ticket.ticketId)
        return formatCurrency(amount)
    }

    const openTicket = (ticketId: string) => {
        try {
            const schedule =
                typeof queueMicrotask === 'function'
                    ? queueMicrotask
                    : (cb: () => void) => Promise.resolve().then(cb)
            schedule(() => {
                document.cookie = `selectedTicket=${encodeURIComponent(
                    ticketId
                )}; path=/; max-age=${60 * 60 * 2}`
                router.push('/sales')
            })
        } catch {
            router.push('/sales')
        }
    }

    const requestNewTicket = () => {
        if (creatingTicket) return
        setCreatingTicket(true)
        try {
            if (typeof localStorage !== 'undefined')
                localStorage.setItem('posRequestNewTicket', '1')
            if (typeof window !== 'undefined') window.location.href = '/sales'
        } catch {}
    }

    const normalize = (s?: string) => (s ? s.trim().toLowerCase() : '')
    const filtered = useMemo(() => {
        const q = normalize(query)
        const base = Array.isArray(tickets) ? tickets : []
        if (!q) return base
        return base.filter(
            (t) =>
                normalize(t.ticketId).includes(q) ||
                normalize(t.openedBy).includes(q) ||
                normalize(t.ticketName).includes(q) ||
                normalize(t.status).includes(q)
        )
    }, [tickets, query])

    const openTicketOptions = useMemo(
        () => tickets.filter((ticket) => ticket.status === 'open'),
        [tickets]
    )

    const handleTicketSelection = (ticket: TicketRow) => {
        if (ticket.status === 'open') {
            openTicket(ticket.ticketId)
            return
        }
        router.push(`/tickets/${encodeURIComponent(ticket.ticketId)}`)
    }

    const toggleManageMenu = (ticketId: string) => {
        setActiveDropdownId((prev) => (prev === ticketId ? null : ticketId))
    }

    const handleSplitTicket = (ticket: TicketRow) => {
        setActiveDropdownId(null)
        setSplitTicketSummary(ticket)
        setSplitTicketId(ticket.ticketId)
    }

    const handleCloseSplitModal = () => {
        setSplitTicketId(null)
        setSplitTicketSummary(null)
    }

    const handleTransferTicket = (ticket: TicketRow) => {
        setActiveDropdownId(null)
        setTransferTicketSummary(ticket)
        setTransferTicketId(ticket.ticketId)
    }

    const handleCloseTransferModal = () => {
        setTransferTicketId(null)
        setTransferTicketSummary(null)
    }

    const handleMergeTicket = (ticket: TicketRow) => {
        setActiveDropdownId(null)
        setMergeTicketSummary(ticket)
        setMergeTicketId(ticket.ticketId)
    }

    const handleCloseMergeModal = () => {
        setMergeTicketId(null)
        setMergeTicketSummary(null)
    }

    return (
        <div className="space-y-4">
            {showNavGrid && (
                <div className="md:hidden">
                    <MobileNavGrid />
                </div>
            )}

            <div className="flex items-center gap-2">
                {/**
                <button
                    className="flex h-10 w-48 items-center justify-center whitespace-nowrap rounded-md border border-gray-300 px-4 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                    onClick={async () => {
                        await clearLocalTickets()
                        try {
                            document.cookie = `selectedTicket=; path=/; max-age=0`
                        } catch { }
                    }}
                    title="Clear all local tickets and carts"
                >
                    Clear Local Tickets
                </button>
                <button
                    className="flex h-10 w-48 items-center justify-center whitespace-nowrap rounded-md border border-gray-300 px-4 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                    onClick={async () => {
                        await dedupeCatalog()
                    }}
                    title="Remove duplicate menu items and categories"
                >
                    Dedupe Catalog
                </button>
                <button
                    className="flex h-10 w-48 items-center justify-center whitespace-nowrap rounded-md border border-red-300 px-4 text-sm text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950"
                    onClick={async () => {
                        await resetDemoCatalog()
                    }}
                    title="Clear and reseed demo categories and items"
                >
                    Reset Demo Catalog
                </button>**/}
                <Button
                    size="sm"
                    variant="primary"
                    className="flex-shrink-0 h-10 px-4"
                    onClick={requestNewTicket}
                    disabled={creatingTicket}
                >
                    {creatingTicket ? 'Opening...' : 'New Ticket'}
                </Button>
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by ID or user..."
                    className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm outline-none placeholder:text-gray-400 focus:border-primary dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                />
            </div>

            <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="border-b border-gray-200 p-4 dark:border-gray-800">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        Current Shift Tickets
                    </h3>
                </div>
                {loading ? (
                    <div className="p-6 text-sm text-gray-500">Loading...</div>
                ) : filtered.length === 0 ? (
                    <div className="p-6 text-sm text-gray-500">
                        No tickets found.
                    </div>
                ) : (
                    <div className="w-full overflow-x-auto">
                        <table className="min-w-full table-fixed divide-y divide-gray-200 dark:divide-gray-800">
                            <thead className="bg-gray-50 dark:bg-gray-800/50">
                                <tr>
                                    <th className="w-[22%] py-3 pl-8 pr-6 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                        Ticket
                                    </th>
                                    <th className="w-[22%] px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                        Opened By
                                    </th>
                                    <th className="w-[18%] py-3 pl-6 pr-10 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                        Total
                                    </th>
                                    <th className="w-[18%] py-3 pl-10 pr-6 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                        Status
                                    </th>
                                    <th className="w-[20%] py-3 pl-6 pr-8 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                        <div className="flex justify-end">
                                            Actions
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                {filtered.map((t) => (
                                    <tr
                                        key={t.ticketId}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => handleTicketSelection(t)}
                                        onKeyDown={(event) => {
                                            if (
                                                event.key === 'Enter' ||
                                                event.key === ' '
                                            ) {
                                                event.preventDefault()
                                                handleTicketSelection(t)
                                            }
                                        }}
                                        className="cursor-pointer hover:bg-gray-50 focus:outline-none focus-visible:bg-primary/10 dark:hover:bg-gray-800/60 dark:focus-visible:bg-primary/20"
                                    >
                                        <td className="w-[22%] py-3 pl-8 pr-6 align-middle">
                                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                {t.ticketName || t.ticketId}
                                            </div>
                                        </td>
                                        <td className="w-[22%] px-6 py-3 align-middle text-sm text-gray-600 dark:text-gray-300">
                                            {t.openedBy || '-'}
                                        </td>
                                        <td className="w-[18%] py-3 pl-6 pr-10 align-middle text-right text-sm font-medium text-gray-900 dark:text-gray-100">
                                            {displayTotal(t)}
                                        </td>
                                        <td className="w-[18%] py-3 pl-10 pr-6 align-middle">
                                            <div className="flex justify-center">
                                                <span
                                                    className={`inline-flex min-w-[5rem] justify-center rounded-full px-2 py-1 text-xs font-medium ${
                                                        t.status === 'closed'
                                                            ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
                                                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                                    }`}
                                                >
                                                    {t.status === 'closed'
                                                        ? 'Closed'
                                                        : 'Open'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="w-[20%] py-3 pl-6 pr-8 align-middle">
                                            <div
                                                className="relative flex justify-end"
                                                onClick={(event) =>
                                                    event.stopPropagation()
                                                }
                                            >
                                                {t.status === 'open' ? (
                                                    <>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="dropdown-toggle h-9 px-4 text-xs font-medium"
                                                            onClick={(
                                                                event
                                                            ) => {
                                                                event.preventDefault()
                                                                toggleManageMenu(
                                                                    t.ticketId
                                                                )
                                                            }}
                                                        >
                                                            Manage
                                                        </Button>
                                                        <Dropdown
                                                            isOpen={
                                                                activeDropdownId ===
                                                                t.ticketId
                                                            }
                                                            onClose={() =>
                                                                setActiveDropdownId(
                                                                    null
                                                                )
                                                            }
                                                            className="right-0 w-48"
                                                        >
                                                            <div className="py-2">
                                                                <DropdownItem
                                                                    onClick={() =>
                                                                        handleSplitTicket(
                                                                            t
                                                                        )
                                                                    }
                                                                    onItemClick={() =>
                                                                        setActiveDropdownId(
                                                                            null
                                                                        )
                                                                    }
                                                                >
                                                                    Split
                                                                </DropdownItem>
                                                                {openTicketOptions.some(
                                                                    (ticket) =>
                                                                        ticket.ticketId !==
                                                                        t.ticketId
                                                                ) ? (
                                                                    <DropdownItem
                                                                        onClick={() =>
                                                                            handleMergeTicket(
                                                                                t
                                                                            )
                                                                        }
                                                                        onItemClick={() =>
                                                                            setActiveDropdownId(
                                                                                null
                                                                            )
                                                                        }
                                                                    >
                                                                        Merge
                                                                    </DropdownItem>
                                                                ) : (
                                                                    <DropdownItem baseClassName="block w-full cursor-not-allowed bg-transparent px-4 py-2 text-left text-sm text-gray-400 hover:bg-transparent hover:text-gray-400">
                                                                        Merge
                                                                        (no
                                                                        targets)
                                                                    </DropdownItem>
                                                                )}
                                                                {openTicketOptions.some(
                                                                    (ticket) =>
                                                                        ticket.ticketId !==
                                                                        t.ticketId
                                                                ) ? (
                                                                    <DropdownItem
                                                                        onClick={() =>
                                                                            handleTransferTicket(
                                                                                t
                                                                            )
                                                                        }
                                                                        onItemClick={() =>
                                                                            setActiveDropdownId(
                                                                                null
                                                                            )
                                                                        }
                                                                    >
                                                                        Transfer
                                                                    </DropdownItem>
                                                                ) : (
                                                                    <DropdownItem baseClassName="block w-full cursor-not-allowed bg-transparent px-4 py-2 text-left text-sm text-gray-400 hover:bg-transparent hover:text-gray-400">
                                                                        Transfer
                                                                        (no
                                                                        targets)
                                                                    </DropdownItem>
                                                                )}
                                                            </div>
                                                        </Dropdown>
                                                    </>
                                                ) : null}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <SplitTicketModal
                isOpen={Boolean(splitTicketId)}
                ticketId={splitTicketId}
                onClose={handleCloseSplitModal}
                formatCurrency={formatCurrency}
                ticketSummary={splitTicketSummary || undefined}
            />
            <TransferTicketModal
                isOpen={Boolean(transferTicketId)}
                sourceTicketId={transferTicketId}
                onClose={handleCloseTransferModal}
                formatCurrency={formatCurrency}
                sourceSummary={transferTicketSummary || undefined}
                openTickets={openTicketOptions}
            />
            <MergeTicketModal
                isOpen={Boolean(mergeTicketId)}
                sourceTicketId={mergeTicketId}
                onClose={handleCloseMergeModal}
                formatCurrency={formatCurrency}
                sourceSummary={mergeTicketSummary || undefined}
                openTickets={openTicketOptions}
            />
        </div>
    )
}
