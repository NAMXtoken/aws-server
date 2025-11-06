'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTenant } from '@/context/TenantContext'
import LowStockBar from '@/components/reports/LowStockBar'
import {
    fetchInventorySnapshotClient,
    type InventorySnapshotRow,
    type MenuAvailabilityEntry,
} from '@/lib/reports-client'
import { getInventorySnapshotCacheKey } from '@/lib/data-refresh'

const POLL_INTERVAL_MS = 60_000

type SnapshotEntry = {
    name: string
    closingStock: number
    packageVolume?: number
    packageUnits?: string
    packagesRemaining: number | null
    raw: InventorySnapshotRow
}

function normalizeEntries(rows: InventorySnapshotRow[]): SnapshotEntry[] {
    return rows
        .map((row) => {
            const safeClosing = Math.max(Number(row.closingStock || 0), 0)
            const safePackageVolume =
                row.packageVolume != null
                    ? Number(row.packageVolume)
                    : undefined
            const safePackageUnits =
                row.packageUnits && row.packageUnits.length
                    ? String(row.packageUnits)
                    : undefined
            const packagesRemaining =
                safePackageVolume && safePackageVolume > 0
                    ? safeClosing / safePackageVolume
                    : null
            return {
                name: String(row.id || '').trim(),
                closingStock: safeClosing,
                packageVolume: safePackageVolume,
                packageUnits: safePackageUnits,
                packagesRemaining,
                raw: row,
            }
        })
        .filter((entry) => entry.name.length > 0)
}

function formatNumber(value: number, fractionDigits = 2): string {
    return Number(value || 0).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: fractionDigits,
    })
}

function formatInventoryAmount(entry: SnapshotEntry): string {
    const { closingStock, packageVolume, packageUnits, packagesRemaining } =
        entry
    if (packageVolume && packageVolume > 0 && packagesRemaining !== null) {
        const roundedPkg =
            packagesRemaining < 10
                ? formatNumber(packagesRemaining, 2)
                : formatNumber(packagesRemaining, 0)
        const suffix = packageUnits
            ? ` • ${formatNumber(closingStock, 2)} ${packageUnits}`
            : ''
        return `${roundedPkg} pkg${packagesRemaining !== 1 ? 's' : ''}${suffix}`
    }
    if (packageUnits) return `${formatNumber(closingStock, 2)} ${packageUnits}`
    return formatNumber(closingStock, 2)
}

export default function InventorySnapshotView() {
    const { tenant } = useTenant()
    const tenantId = tenant?.tenantId ?? null
    const [entries, setEntries] = useState<SnapshotEntry[]>([])
    const [menuAvailability, setMenuAvailability] = useState<
        MenuAvailabilityEntry[]
    >([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [waitingTenant, setWaitingTenant] = useState(false)
    const [lastUpdated, setLastUpdated] = useState<number | null>(null)
    const retryTimeoutRef = useRef<number | null>(null)
    const pollIntervalRef = useRef<number | null>(null)

    const refresh = async (forceFresh?: boolean) => {
        setLoading(true)
        try {
            const response = await fetchInventorySnapshotClient({
                fresh: forceFresh || waitingTenant,
            })
            if (!response.ok) {
                if (response.needsTenantContext) {
                    setWaitingTenant(true)
                    setError(null)
                    if (retryTimeoutRef.current != null) {
                        window.clearTimeout(retryTimeoutRef.current)
                        retryTimeoutRef.current = null
                    }
                    retryTimeoutRef.current = window.setTimeout(() => {
                        refresh(true)
                    }, 1500)
                    return
                }
                throw new Error(response.error || 'Failed to load inventory')
            }
            setWaitingTenant(false)
            if (retryTimeoutRef.current != null) {
                window.clearTimeout(retryTimeoutRef.current)
                retryTimeoutRef.current = null
            }
            const normalized = normalizeEntries(response.rows || [])
            normalized.sort((a, b) => a.closingStock - b.closingStock)
            setEntries(normalized)
            if (response.menuAvailability && response.menuAvailability.length) {
                setMenuAvailability(
                    response.menuAvailability.slice().map((entry) => ({
                        ...entry,
                        available: Math.max(0, Number(entry.available || 0)),
                    }))
                )
            } else {
                setMenuAvailability([])
            }
            setError(null)
            setLastUpdated(Date.now())
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Failed to load inventory'
            setError(message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                const cacheKey = getInventorySnapshotCacheKey(tenantId)
                const cachedRaw = window.localStorage.getItem(cacheKey)
                if (cachedRaw) {
                    const cached = JSON.parse(cachedRaw) as {
                        fetchedAt?: number
                        snapshot?: {
                            ok?: boolean
                            rows?: InventorySnapshotRow[]
                            menuAvailability?: MenuAvailabilityEntry[]
                        }
                    }
                    if (
                        cached?.snapshot?.ok &&
                        Array.isArray(cached.snapshot.rows)
                    ) {
                        const normalized = normalizeEntries(
                            cached.snapshot.rows
                        )
                        normalized.sort(
                            (a, b) => a.closingStock - b.closingStock
                        )
                        setEntries(normalized)
                        if (Array.isArray(cached.snapshot.menuAvailability)) {
                            setMenuAvailability(
                                cached.snapshot.menuAvailability.map(
                                    (entry) => ({
                                        ...entry,
                                        available: Math.max(
                                            0,
                                            Number(entry.available || 0)
                                        ),
                                    })
                                )
                            )
                        } else {
                            setMenuAvailability([])
                        }
                        if (typeof cached.fetchedAt === 'number') {
                            setLastUpdated(cached.fetchedAt)
                        }
                    }
                }
            } catch (error) {
                console.warn('Failed to load cached inventory snapshot', error)
            }
        }

        refresh(true)
        if (pollIntervalRef.current != null) {
            window.clearInterval(pollIntervalRef.current)
        }
        pollIntervalRef.current = window.setInterval(() => {
            refresh(true)
        }, POLL_INTERVAL_MS)
        return () => {
            if (pollIntervalRef.current != null) {
                window.clearInterval(pollIntervalRef.current)
                pollIntervalRef.current = null
            }
            if (retryTimeoutRef.current != null) {
                window.clearTimeout(retryTimeoutRef.current)
                retryTimeoutRef.current = null
            }
        }
    }, [tenantId])

    const lowStock = useMemo(() => entries.slice(0, 12), [entries])
    const outOfStock = useMemo(
        () => entries.filter((entry) => entry.closingStock <= 0.01).length,
        [entries]
    )
    const averageStock = useMemo(() => {
        if (!entries.length) return 0
        const total = entries.reduce(
            (sum, entry) => sum + entry.closingStock,
            0
        )
        return total / entries.length
    }, [entries])
    const defaultUnits =
        entries.find((entry) => entry.packageUnits)?.packageUnits || ''
    const ingredientAvailabilityMap = useMemo(() => {
        const map = new Map<string, number>()
        for (const entry of menuAvailability) {
            const ingredients = entry.ingredients || []
            for (const detail of ingredients) {
                const key = String(detail.name || '').toLowerCase()
                const available = Math.max(
                    0,
                    Number(detail.available || detail.stock || 0)
                )
                if (!key) continue
                if (!map.has(key) || available < (map.get(key) || 0)) {
                    map.set(key, available)
                }
            }
        }
        return map
    }, [menuAvailability])
    const lowStockChartValues = useMemo(
        () =>
            lowStock.map((entry) => {
                const key = entry.name.toLowerCase()
                const servings = ingredientAvailabilityMap.get(key)
                if (servings != null) return servings
                return Math.max(0, Number(entry.closingStock.toFixed(2)))
            }),
        [ingredientAvailabilityMap, lowStock]
    )
    const menuLimited = useMemo(() => {
        if (!menuAvailability.length) return []
        return menuAvailability
            .slice()
            .sort((a, b) => a.available - b.available)
            .slice(0, 8)
    }, [menuAvailability])

    const isEmpty = entries.length === 0
    const showLoadingPlaceholder = isEmpty && loading && !waitingTenant
    const showEmptyState = isEmpty && !loading && !waitingTenant

    return (
        <div className="space-y-6 p-4 sm:p-6">
            <header className="space-y-1">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">
                            Inventory Report
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Low stock snapshot pulled from the Inventory sheet.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => refresh(true)}
                            disabled={loading}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-white/5"
                        >
                            {loading ? 'Refreshing…' : 'Refresh'}
                        </button>
                        {lastUpdated && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                Synced{' '}
                                {new Date(lastUpdated).toLocaleTimeString()}
                            </span>
                        )}
                    </div>
                </div>
                {waitingTenant && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100">
                        Preparing tenant workspace…
                    </div>
                )}
                {error && !waitingTenant && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-100">
                        {error}
                    </div>
                )}
            </header>

            {showLoadingPlaceholder ? (
                <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
                    Fetching latest inventory snapshot…
                </div>
            ) : showEmptyState ? (
                <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
                    No inventory snapshot available yet. Record a stock take or
                    inventory adjustment to populate this view.
                </div>
            ) : entries.length > 0 ? (
                <>
                    <section className="grid gap-4 md:grid-cols-2">
                        <LowStockBar
                            labels={lowStock.map((entry) => entry.name)}
                            values={lowStockChartValues}
                            title="Lowest Stock Ingredients (max servings)"
                            valueFormatter={(value) =>
                                `${formatNumber(value, 0)} servings`
                            }
                        />
                        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                            <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                                Summary
                            </div>
                            <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
                                <li>Tracked ingredients: {entries.length}</li>
                                <li>
                                    Low-stock items shown: {lowStock.length}
                                </li>
                                <li>
                                    Out of stock:&nbsp;
                                    <span className="font-medium">
                                        {outOfStock}
                                    </span>
                                </li>
                                <li>
                                    Avg remaining stock:&nbsp;
                                    {formatNumber(averageStock, 1)}
                                    {defaultUnits ? ` ${defaultUnits}` : ''}
                                </li>
                                <li>
                                    Menu items tracked:&nbsp;
                                    {menuAvailability.length}
                                </li>
                            </ul>
                            {lowStock.length > 0 && (
                                <div className="mt-4 border-t border-gray-200 pt-3 text-sm dark:border-gray-800">
                                    <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        Watch closely
                                    </div>
                                    <ul className="space-y-2">
                                        {lowStock
                                            .slice(0, 4)
                                            .map((entry, index) => (
                                                <li
                                                    key={`${entry.name}-${index}`}
                                                    className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300"
                                                >
                                                    <span>{entry.name}</span>
                                                    <span className="font-medium text-gray-900 dark:text-white">
                                                        {formatInventoryAmount(
                                                            entry
                                                        )}
                                                    </span>
                                                </li>
                                            ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </section>
                    {menuLimited.length > 0 && (
                        <section className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                                <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Menu Availability (lowest counts)
                                </div>
                                <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                                    {menuLimited.map((entry) => (
                                        <li
                                            key={entry.id}
                                            className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800"
                                        >
                                            <div>
                                                <div className="font-medium text-gray-900 dark:text-white">
                                                    {entry.name}
                                                </div>
                                                {entry.limitingIngredient && (
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                                        Limited by{' '}
                                                        {
                                                            entry.limitingIngredient
                                                        }
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xl font-semibold text-gray-900 dark:text-white">
                                                    {entry.available}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                                    max servings
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300">
                                <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                                    How availability is calculated
                                </div>
                                <p>
                                    Each menu item is limited by its
                                    lowest-stock ingredient. When inventory
                                    updates, these counts refresh automatically
                                    so you can see how many servings are
                                    possible before restocking.
                                </p>
                            </div>
                        </section>
                    )}
                </>
            ) : null}
        </div>
    )
}
