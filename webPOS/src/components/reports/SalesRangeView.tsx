'use client'
import DailySalesChart from '@/components/reports/DailySalesChart'
import PaymentDonut from '@/components/reports/PaymentDonut'
import {
    loadDailyReportCache,
    makeDailyReportKey,
    saveDailyReportCache,
} from '@/lib/daily-report-cache'
import {
    DailySalesDaySummary,
    fetchDailySalesSummary,
} from '@/lib/reports-client'
import { DEFAULT_GENERAL_SETTINGS, loadGeneralSettings } from '@/lib/settings'
import { useEffect, useMemo, useRef, useState } from 'react'

const numberFormatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
})

const buildCurrencyFormatter = (locale: string, currencyCode: string) => {
    try {
        return new Intl.NumberFormat(locale || 'en-US', {
            style: 'currency',
            currency: currencyCode || 'THB',
            currencyDisplay: 'symbol',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })
    } catch {
        return new Intl.NumberFormat(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })
    }
}

export default function SalesRangeView() {
    const today = useMemo(() => new Date(), [])
    const [year, setYear] = useState(today.getFullYear())
    const [month, setMonth] = useState(today.getMonth() + 1)
    const [monthLabel, setMonthLabel] = useState<string>('')
    const [days, setDays] = useState<DailySalesDaySummary[]>([])
    const [selectedDay, setSelectedDay] = useState<number | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [lastUpdated, setLastUpdated] = useState<number | null>(null)
    const [settings, setSettings] = useState(DEFAULT_GENERAL_SETTINGS)
    const [refreshToken, setRefreshToken] = useState(0)
    const [waitingForTenant, setWaitingForTenant] = useState(false)
    const retryTimeoutRef = useRef<number | null>(null)

    const currencyFormatter = useMemo(
        () =>
            buildCurrencyFormatter(
                settings.locale || DEFAULT_GENERAL_SETTINGS.locale,
                settings.currencyCode || DEFAULT_GENERAL_SETTINGS.currencyCode
            ),
        [settings.currencyCode, settings.locale]
    )

    useEffect(() => {
        if (typeof window === 'undefined') return
        const syncSettings = () => setSettings(loadGeneralSettings())
        syncSettings()
        window.addEventListener('pos:settings:updated', syncSettings)
        return () => {
            window.removeEventListener('pos:settings:updated', syncSettings)
        }
    }, [])

    useEffect(() => {
        let mounted = true
        const cacheKey = makeDailyReportKey(year, month)

        setError(null)
        ;(async () => {
            const cached = await loadDailyReportCache(cacheKey)
            if (!mounted || !cached) return
            const fallbackLabel = new Date(
                cached.year || year,
                (cached.month || month) - 1,
                1
            ).toLocaleString(undefined, { month: 'long' })
            const resolvedLabel = `${cached.monthName || fallbackLabel} ${String(
                cached.year || year
            )}`
            setWaitingForTenant(false)
            setDays(cached.days || [])
            setMonthLabel(resolvedLabel)
            setLastUpdated(cached.fetchedAt ?? null)
        })()

        async function loadData(y: number, m: number) {
            setLoading(true)
            try {
                const result = await fetchDailySalesSummary(y, m)
                if (!mounted) return
                if (!result.ok) {
                    if (result.needsTenantContext) {
                        setWaitingForTenant(true)
                        if (retryTimeoutRef.current != null) {
                            window.clearTimeout(retryTimeoutRef.current)
                            retryTimeoutRef.current = null
                        }
                        retryTimeoutRef.current = window.setTimeout(() => {
                            setRefreshToken((token) => token + 1)
                        }, 1500)
                        return
                    }
                    throw new Error(
                        result.error || 'Failed to load report data'
                    )
                }
                setWaitingForTenant(false)
                if (retryTimeoutRef.current != null) {
                    window.clearTimeout(retryTimeoutRef.current)
                    retryTimeoutRef.current = null
                }
                const fallbackLabel = new Date(
                    result.year,
                    result.month - 1,
                    1
                ).toLocaleString(undefined, { month: 'long' })
                const resolvedLabel = `${result.monthName || fallbackLabel} ${String(
                    result.year
                )}`
                const fetchedAt = Date.now()
                setDays(result.days || [])
                setMonthLabel(resolvedLabel)
                setError(null)
                setLastUpdated(fetchedAt)
                await saveDailyReportCache({
                    key: makeDailyReportKey(result.year, result.month),
                    year: result.year,
                    month: result.month,
                    monthName: result.monthName || fallbackLabel,
                    days: result.days || [],
                    fetchedAt,
                })
            } catch (err) {
                if (!mounted) return
                const message =
                    err instanceof Error
                        ? err.message
                        : 'Failed to load reports'
                setError(message)
                setWaitingForTenant(false)
                if (retryTimeoutRef.current != null) {
                    window.clearTimeout(retryTimeoutRef.current)
                    retryTimeoutRef.current = null
                }
            } finally {
                if (mounted) setLoading(false)
            }
        }

        loadData(year, month)

        return () => {
            mounted = false
            if (retryTimeoutRef.current != null) {
                window.clearTimeout(retryTimeoutRef.current)
                retryTimeoutRef.current = null
            }
        }
    }, [year, month, refreshToken])

    useEffect(() => {
        if (!days.length) {
            setSelectedDay(null)
            return
        }
        if (selectedDay && days.some((d) => d.day === selectedDay)) {
            return
        }
        const matchToday =
            today.getFullYear() === year &&
            today.getMonth() + 1 === month &&
            days.some((d) => d.day === today.getDate())
        const nextDay = matchToday
            ? today.getDate()
            : days[days.length - 1]?.day
        if (nextDay && nextDay !== selectedDay) {
            setSelectedDay(nextDay)
        }
    }, [days, selectedDay, month, year, today])
    const selectedSummary = useMemo(() => {
        if (!selectedDay) return days[days.length - 1] || null
        return days.find((d) => d.day === selectedDay) || null
    }, [days, selectedDay])

    const chartDays = useMemo(
        () =>
            days.map((d) => ({
                date: d.date,
                total: d.grossSales,
            })),
        [days]
    )

    const changeMonth = (delta: number) => {
        const nextMonth = month + delta
        if (nextMonth < 1) {
            setMonth(12)
            setYear((prev) => prev - 1)
        } else if (nextMonth > 12) {
            setMonth(1)
            setYear((prev) => prev + 1)
        } else {
            setMonth(nextMonth)
        }
    }

    const handleRefresh = () => {
        setRefreshToken((token) => token + 1)
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                    <button
                        className="rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-white/10"
                        onClick={() => changeMonth(-1)}
                        disabled={loading}
                    >
                        ←
                    </button>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {monthLabel || '…'}
                    </div>
                    <button
                        className="rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-white/10"
                        onClick={() => changeMonth(1)}
                        disabled={loading}
                    >
                        →
                    </button>
                </div>
                <button
                    onClick={() => handleRefresh()}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-white/5"
                    disabled={loading}
                >
                    {loading ? 'Loading…' : 'Refresh'}
                </button>
                {lastUpdated && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        Updated {new Date(lastUpdated).toLocaleString()}
                    </span>
                )}
            </div>

            {waitingForTenant && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100">
                    Preparing tenant workspace…
                </div>
            )}

            {error && !waitingForTenant && (
                <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-100">
                    {error}
                </div>
            )}

            {days.length === 0 && !loading && !waitingForTenant ? (
                <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-sm dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
                    No sales data found for this month.
                </div>
            ) : null}

            {days.length > 0 && (
                <>
                    <section className="space-y-3">
                        <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            Pick a day
                        </span>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                            {days.map((day) => {
                                const isActive =
                                    (selectedSummary?.day || 0) === day.day
                                return (
                                    <button
                                        key={day.day}
                                        onClick={() => setSelectedDay(day.day)}
                                        className={`min-w-[88px] flex-1 rounded-xl border px-3 py-2 text-left transition ${
                                            isActive
                                                ? 'border-gray-500 bg-gray-400 text-white dark:border-white dark:bg-white dark:text-gray-900'
                                                : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:border-gray-700 dark:hover:bg-gray-900/40'
                                        }`}
                                    >
                                        <div className="text-xs font-medium uppercase tracking-wide text-black dark:text-gray-400">
                                            {day.weekday}
                                        </div>
                                        <div className="text-lg font-semibold">
                                            {day.day}
                                        </div>
                                        <div className="text-xs text-black dark:text-gray-400">
                                            {currencyFormatter.format(
                                                day.grossSales || 0
                                            )}
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </section>

                    {selectedSummary && (
                        <>
                            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                <StatCard
                                    label="Gross Sales"
                                    value={currencyFormatter.format(
                                        selectedSummary.grossSales || 0
                                    )}
                                />
                                <StatCard
                                    label="Net Sales"
                                    value={currencyFormatter.format(
                                        selectedSummary.netSales || 0
                                    )}
                                />
                                <StatCard
                                    label="Tax Collected"
                                    value={currencyFormatter.format(
                                        selectedSummary.taxCollected || 0
                                    )}
                                />
                                <StatCard
                                    label="Average Ticket"
                                    value={currencyFormatter.format(
                                        selectedSummary.averageTicketValue || 0
                                    )}
                                />
                            </section>

                            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                <StatCard
                                    label="Items Sold"
                                    value={numberFormatter.format(
                                        selectedSummary.itemsSold || 0
                                    )}
                                />
                                <StatCard
                                    label="Average Item Price"
                                    value={currencyFormatter.format(
                                        selectedSummary.averageItemPrice || 0
                                    )}
                                />
                                <StatCard
                                    label="Tickets"
                                    value={numberFormatter.format(
                                        selectedSummary.tickets || 0
                                    )}
                                />
                            </section>

                            <section className="grid gap-4 lg:grid-cols-[3fr_2fr]">
                                <DailySalesChart
                                    year={year}
                                    month={month}
                                    days={chartDays}
                                    title="Gross Sales Trend"
                                />
                                <div className="space-y-4">
                                    <PaymentDonut
                                        cash={
                                            selectedSummary.payments.cash || 0
                                        }
                                        card={
                                            selectedSummary.payments.card || 0
                                        }
                                        prompt={
                                            selectedSummary.payments
                                                .promptPay || 0
                                        }
                                        percentages={
                                            selectedSummary.paymentPercentages
                                        }
                                    />
                                    <EmployeeCard
                                        employees={selectedSummary.employees}
                                        formatCurrency={(value: number) =>
                                            currencyFormatter.format(value || 0)
                                        }
                                    />
                                </div>
                            </section>
                        </>
                    )}
                </>
            )}
        </div>
    )
}

function StatCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {label}
            </div>
            <div className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                {value}
            </div>
        </div>
    )
}

function EmployeeCard({
    employees,
    formatCurrency,
}: {
    employees: Array<{ name: string; total: number }>
    formatCurrency: (value: number) => string
}) {
    if (!employees || employees.length === 0) {
        return (
            <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">
                No employee sales attributed yet.
            </div>
        )
    }
    return (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
            <div className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">
                Team Highlights
            </div>
            <ul className="space-y-2">
                {employees.map((employee, index) => (
                    <li
                        key={`${employee.name}-${index}`}
                        className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-300"
                    >
                        <span>{employee.name}</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                            {formatCurrency(employee.total || 0)}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    )
}
