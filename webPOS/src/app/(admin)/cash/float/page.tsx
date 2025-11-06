'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import Button from '@/components/ui/button/Button'
import {
    addCashAdjustmentForCurrentShift,
    getCurrentShift as dbGetCurrentShift,
    shiftLiveSummary as dbShiftLiveSummary,
    getStartingFloatForCurrentShift,
    listCashAdjustmentsForCurrentShift,
    setStartingFloatForCurrentShift,
} from '@/lib/local-pos'
import {
    DEFAULT_GENERAL_SETTINGS,
    GENERAL_SETTINGS_STORAGE_KEY,
    deriveCurrencySymbol,
    loadGeneralSettings,
} from '@/lib/settings'

type ApiTransaction = {
    id: string
    description: string
    amount: number
    type: 'sale' | 'topup' | 'withdrawal' | 'adjustment'
    timestamp: string
}

type ApiResponse = {
    ok?: boolean
    shiftId?: string
    startingFloat?: number
    totalSales?: number
    netAdjustments?: number
    currentBalance?: number
    transactions?: ApiTransaction[]
}

export default function CashFloatPage() {
    const [startingFloat, setStartingFloat] = useState<number>(0)
    const [totalSales, setTotalSales] = useState<number>(0)
    const [netAdjustments, setNetAdjustments] = useState<number>(0)
    const [transactions, setTransactions] = useState<ApiTransaction[]>([])
    const [loading, setLoading] = useState<boolean>(true)
    const [saving, setSaving] = useState<boolean>(false)
    const [error, setError] = useState<string | null>(null)
    const [adjOpen, setAdjOpen] = useState<boolean>(false)
    const [adjType, setAdjType] = useState<
        'topup' | 'withdrawal' | 'adjustment'
    >('topup')
    const [adjAmount, setAdjAmount] = useState<string>('')
    const [adjDesc, setAdjDesc] = useState<string>('')
    const [posting, setPosting] = useState<boolean>(false)
    const [settings, setSettings] = useState(DEFAULT_GENERAL_SETTINGS)

    useEffect(() => {
        const refreshSettings = () => {
            try {
                setSettings(loadGeneralSettings())
            } catch {
                setSettings(DEFAULT_GENERAL_SETTINGS)
            }
        }
        refreshSettings()
        const handleStorage = (event: StorageEvent) => {
            if (!event.key || event.key === GENERAL_SETTINGS_STORAGE_KEY) {
                refreshSettings()
            }
        }
        const handleCustom = () => refreshSettings()
        window.addEventListener('storage', handleStorage)
        window.addEventListener('pos:settings:updated', handleCustom)
        return () => {
            window.removeEventListener('storage', handleStorage)
            window.removeEventListener('pos:settings:updated', handleCustom)
        }
    }, [])

    const currencyFormatter = useMemo(() => {
        try {
            return new Intl.NumberFormat(settings.locale || 'en-US', {
                style: 'currency',
                currency: settings.currencyCode || 'USD',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            })
        } catch {
            return null
        }
    }, [settings.locale, settings.currencyCode])

    const currencySymbol = useMemo(() => {
        const trimmed = settings.currencySymbol?.trim()
        if (trimmed) return trimmed
        return (
            deriveCurrencySymbol(settings.currencyCode, settings.locale) || '$'
        )
    }, [settings.currencySymbol, settings.currencyCode, settings.locale])

    const formatCurrency = useCallback(
        (amount: number) => {
            const safe = Number.isFinite(amount) ? amount : 0
            if (currencyFormatter) {
                try {
                    return currencyFormatter.format(safe)
                } catch {
                    // ignore formatter errors; fall back to symbol + amount
                }
            }
            return `${currencySymbol}${safe.toFixed(2)}`
        },
        [currencyFormatter, currencySymbol]
    )

    useEffect(() => {
        const loadLocal = async () => {
            setLoading(true)
            setError(null)
            try {
                const cur = await dbGetCurrentShift()
                if (!cur) throw new Error('No open shift')

                const float = await getStartingFloatForCurrentShift()
                setStartingFloat(Number(float?.startingFloat || 0) || 0)

                const live = await dbShiftLiveSummary()
                setTotalSales(Number(live?.cashSales || 0) || 0)

                const { adjustments, netAdjustments } =
                    await listCashAdjustmentsForCurrentShift()
                setNetAdjustments(Number(netAdjustments || 0) || 0)
                const tx: ApiTransaction[] = adjustments.map((a) => ({
                    id: a.id,
                    description: a.description || '',
                    amount: a.amount,
                    type: a.type,
                    timestamp: new Date(a.timestamp).toISOString(),
                }))
                setTransactions(tx)
            } catch (e) {
                setError(String((e as Error)?.message || e))
            } finally {
                setLoading(false)
            }
        }
        void loadLocal()
    }, [])

    const saveStartingFloat = async (value: number) => {
        try {
            setSaving(true)
            await setStartingFloatForCurrentShift(value)
            await reload()
        } catch (e) {
            setError(String((e as Error)?.message || e))
        } finally {
            setSaving(false)
        }
    }

    const reload = async () => {
        setLoading(true)
        setError(null)
        try {
            const float = await getStartingFloatForCurrentShift()
            setStartingFloat(Number(float?.startingFloat || 0) || 0)
            const live = await dbShiftLiveSummary()
            setTotalSales(Number(live?.cashSales || 0) || 0)
            const { adjustments, netAdjustments } =
                await listCashAdjustmentsForCurrentShift()
            setNetAdjustments(Number(netAdjustments || 0) || 0)
            const tx: ApiTransaction[] = adjustments.map((a) => ({
                id: a.id,
                description: a.description || '',
                amount: a.amount,
                type: a.type,
                timestamp: new Date(a.timestamp).toISOString(),
            }))
            setTransactions(tx)
        } catch (e) {
            setError(String((e as Error)?.message || e))
        } finally {
            setLoading(false)
        }
    }

    const recordAdjustment = async () => {
        const amt = Number(adjAmount)
        if (!isFinite(amt) || amt === 0) {
            setError('Enter a non-zero amount for the adjustment.')
            return
        }
        if (!adjDesc.trim()) {
            setError('Please enter a description for this adjustment.')
            return
        }
        try {
            setPosting(true)
            await addCashAdjustmentForCurrentShift(adjType, amt, adjDesc)
            setAdjAmount('')
            setAdjDesc('')
            await reload()
            setAdjOpen(false)
        } catch (e) {
            setError(String((e as Error)?.message || e))
        } finally {
            setPosting(false)
        }
    }

    const totals = useMemo(() => {
        const currentBalance = startingFloat + totalSales + netAdjustments
        return { totalSales, netAdjustments, currentBalance }
    }, [startingFloat, totalSales, netAdjustments])

    return (
        <div className="space-y-6 py-4 sm:py-6">
            <header className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">
                    Cash Float
                </h1>
                <p className="text-sm text-muted-foreground">
                    Track float balances for the current shift. Data loads from
                    the backend.
                </p>
            </header>

            {error ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                    {error}
                </div>
            ) : null}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <BalanceCard
                    title="Balance Brought Forward"
                    value={startingFloat}
                    hint="Opening float set for the current shift"
                    formatCurrency={formatCurrency}
                />
                <EditableCard
                    title="Starting Float"
                    value={startingFloat}
                    onChange={(v) => setStartingFloat(v)}
                    onCommit={(v) => saveStartingFloat(v)}
                    hint={
                        saving ? 'Saving…' : 'Edit and leave the field to save'
                    }
                />
                <BalanceCard
                    title="Cash Sales (shift)"
                    value={totals.totalSales}
                    hint={
                        loading
                            ? 'Loading…'
                            : 'Sum of cash payments recorded so far'
                    }
                    formatCurrency={formatCurrency}
                />
                <BalanceCard
                    title="Current Float Balance"
                    value={totals.currentBalance}
                    highlight
                    hint="Opening float + sales - adjustments"
                    formatCurrency={formatCurrency}
                />
            </section>

            <section className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                    <h2 className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        Shift Cash Transactions
                    </h2>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setAdjOpen((v) => !v)}
                    >
                        {adjOpen ? 'Cancel' : 'Record Adjustment'}
                    </Button>
                </div>
                {adjOpen ? (
                    <div className="grid gap-3 border-b border-gray-200 p-4 text-sm dark:border-gray-800 sm:grid-cols-5">
                        <div>
                            <label className="mb-1 block text-xs text-muted-foreground">
                                Type
                            </label>
                            <select
                                className="w-full rounded-md border border-gray-300 bg-white p-2 dark:border-gray-700 dark:bg-gray-900"
                                value={adjType}
                                onChange={(e) =>
                                    setAdjType(e.target.value as any)
                                }
                            >
                                <option value="topup">Top-up</option>
                                <option value="withdrawal">Withdrawal</option>
                                <option value="adjustment">Adjustment</option>
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs text-muted-foreground">
                                Amount
                            </label>
                            <input
                                type="number"
                                inputMode="decimal"
                                className="w-full rounded-md border border-gray-300 p-2 dark:border-gray-700 dark:bg-gray-900"
                                value={adjAmount}
                                onChange={(e) => setAdjAmount(e.target.value)}
                                placeholder="0.00"
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="mb-1 block text-xs text-muted-foreground">
                                Description
                                <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                className="w-full rounded-md border border-gray-300 p-2 dark:border-gray-700 dark:bg-gray-900"
                                value={adjDesc}
                                onChange={(e) => setAdjDesc(e.target.value)}
                                placeholder="Enter a brief description (required)"
                                required
                            />
                        </div>
                        <div className="flex items-end">
                            <Button
                                size="sm"
                                onClick={recordAdjustment}
                                disabled={posting}
                            >
                                {posting ? 'Recording…' : 'Record'}
                            </Button>
                        </div>
                    </div>
                ) : null}
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
                        <thead className="bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                            <tr>
                                <th className="px-4 py-3 text-left">
                                    Description
                                </th>
                                <th className="px-4 py-3 text-left">Type</th>
                                <th className="px-4 py-3 text-right">Amount</th>
                                <th className="px-4 py-3 text-left">
                                    Recorded
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                            {transactions.map((transaction) => (
                                <tr
                                    key={transaction.id}
                                    className="hover:bg-gray-50 dark:hover:bg-gray-800/60"
                                >
                                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                                        {transaction.description}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600 capitalize dark:text-gray-300">
                                        {transaction.type.replace('_', ' ')}
                                    </td>
                                    <td
                                        className={`px-4 py-3 text-right font-medium ${
                                            transaction.amount >= 0
                                                ? 'text-emerald-600 dark:text-emerald-400'
                                                : 'text-red-600 dark:text-red-400'
                                        }`}
                                    >
                                        {formatCurrency(transaction.amount)}
                                    </td>
                                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                                        {new Date(
                                            transaction.timestamp
                                        ).toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 text-sm dark:border-gray-800">
                    <div className="text-gray-600 dark:text-gray-300">
                        Net adjustments: {formatCurrency(totals.netAdjustments)}
                    </div>
                    <div className="text-gray-500 dark:text-gray-400">
                        {loading
                            ? 'Loading…'
                            : 'Manual adjustments will appear here when recorded.'}
                    </div>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Shift Close Preview
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                        These controls will submit float values when the shift
                        close modal is integrated.
                    </p>
                    <div className="mt-4 space-y-3 text-sm text-gray-600 dark:text-gray-300">
                        <div className="flex items-center justify-between">
                            <span>Opening float</span>
                            <span className="font-medium">
                                {formatCurrency(startingFloat)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>Cash sales</span>
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(totals.totalSales)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>Projected end of shift balance</span>
                            <span className="font-semibold text-primary">
                                {formatCurrency(totals.currentBalance)}
                            </span>
                        </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Button size="sm" disabled>
                            Withdraw Float (modal soon)
                        </Button>
                        <Button size="sm" variant="outline" disabled>
                            Export Cash Sheet
                        </Button>
                    </div>
                </div>

                <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Coming Soon
                    </h3>
                    <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-gray-600 dark:text-gray-300">
                        <li>
                            Sync float & petty cash values with IndexedDB and
                            Apps Script.
                        </li>
                        <li>
                            Real-time cash transaction feed sourced from closed
                            cash tickets.
                        </li>
                        <li>
                            Shift close modal that captures counted cash and
                            withdrawals.
                        </li>
                        <li>
                            Exportable cash reconciliation report for end-of-day
                            audits.
                        </li>
                    </ul>
                </div>
            </section>
        </div>
    )
}

function BalanceCard({
    title,
    value,
    hint,
    highlight = false,
    formatCurrency,
}: {
    title: string
    value: number
    hint?: string
    highlight?: boolean
    formatCurrency: (value: number) => string
}) {
    return (
        <div
            className={`rounded-lg border p-4 shadow-sm transition dark:border-gray-800 dark:bg-gray-900 ${
                highlight
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-gray-200 bg-white'
            }`}
        >
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {title}
            </div>
            <div
                className={`mt-2 text-lg font-semibold ${highlight ? 'text-primary' : 'text-gray-900 dark:text-white'}`}
            >
                {formatCurrency(value)}
            </div>
            {hint ? (
                <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
            ) : null}
        </div>
    )
}

function EditableCard({
    title,
    value,
    onChange,
    onCommit,
    hint,
}: {
    title: string
    value: number
    onChange: (val: number) => void
    onCommit?: (val: number) => void | Promise<void>
    hint?: string
}) {
    return (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {title}
            </div>
            <input
                type="number"
                inputMode="decimal"
                value={value}
                onChange={(event) => onChange(Number(event.target.value) || 0)}
                onBlur={() => onCommit?.(value)}
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:focus:border-primary"
            />
            <div className="mt-2">
                <Button size="sm" onClick={() => onCommit?.(value)}>
                    Save
                </Button>
            </div>
            {hint ? (
                <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
            ) : null}
        </div>
    )
}
