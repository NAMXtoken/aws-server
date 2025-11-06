'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import Button from '@/components/ui/button/Button'
import {
    fetchDailySalesSummary,
    type DailySalesDaySummary,
    type DailySalesSummaryResponse,
    type DailyShiftCloseSummary,
} from '@/lib/reports-client'
import {
    DEFAULT_GENERAL_SETTINGS,
    loadGeneralSettings,
    type GeneralSettings,
} from '@/lib/settings'

type ShiftRow = {
    key: string
    day: DailySalesDaySummary
    shiftId: string
    closedAt: string
    close: DailyShiftCloseSummary
}

const buildNumberFormatter = (
    locale: string,
    currencyCode: string,
    minimumFractionDigits = 2
) => {
    try {
        return new Intl.NumberFormat(locale || 'en-US', {
            style: 'currency',
            currency: currencyCode || 'USD',
            minimumFractionDigits,
            maximumFractionDigits: minimumFractionDigits,
        })
    } catch {
        return new Intl.NumberFormat(locale || 'en-US', {
            minimumFractionDigits,
            maximumFractionDigits: minimumFractionDigits,
        })
    }
}

const buildDateFormatter = (locale: string) => {
    try {
        return new Intl.DateTimeFormat(locale || 'en-US', {
            dateStyle: 'medium',
        })
    } catch {
        return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' })
    }
}

const buildDateTimeFormatter = (locale: string) => {
    try {
        return new Intl.DateTimeFormat(locale || 'en-US', {
            dateStyle: 'short',
            timeStyle: 'short',
        })
    } catch {
        return new Intl.DateTimeFormat('en-US', {
            dateStyle: 'short',
            timeStyle: 'short',
        })
    }
}

function formatNumber(
    formatter: Intl.NumberFormat,
    value: number | null | undefined
): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '—'
    }
    try {
        return formatter.format(value)
    } catch {
        return value.toFixed(2)
    }
}

const today = new Date()

export default function ShiftClosuresView() {
    const [year, setYear] = useState(() => today.getFullYear())
    const [month, setMonth] = useState(() => today.getMonth() + 1)
    const [settings, setSettings] = useState<GeneralSettings>(
        DEFAULT_GENERAL_SETTINGS
    )
    const [data, setData] = useState<DailySalesSummaryResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        try {
            setSettings(loadGeneralSettings())
        } catch {
            setSettings(DEFAULT_GENERAL_SETTINGS)
        }
    }, [])

    const loadData = useCallback(
        async (targetYear: number, targetMonth: number) => {
            setLoading(true)
            setError(null)
            try {
                const result = await fetchDailySalesSummary(
                    targetYear,
                    targetMonth
                )
                if (!result.ok) {
                    setData(result)
                    setError(
                        result.needsTenantContext
                            ? 'Connect a tenant (Settings → Tenant) to load shift history.'
                            : result.error || 'Failed to load shift summaries.'
                    )
                } else {
                    setData(result)
                }
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : 'Failed to load shift summaries.'
                )
                setData(null)
            } finally {
                setLoading(false)
            }
        },
        []
    )

    useEffect(() => {
        void loadData(year, month)
    }, [year, month, loadData])

    const formatter = useMemo(
        () =>
            buildNumberFormatter(
                settings.locale || 'en-US',
                settings.currencyCode || 'USD'
            ),
        [settings.currencyCode, settings.locale]
    )
    const hoursFormatter = useMemo(
        () =>
            new Intl.NumberFormat(settings.locale || 'en-US', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
            }),
        [settings.locale]
    )
    const dateFormatter = useMemo(
        () => buildDateFormatter(settings.locale || 'en-US'),
        [settings.locale]
    )
    const dateTimeFormatter = useMemo(
        () => buildDateTimeFormatter(settings.locale || 'en-US'),
        [settings.locale]
    )

    const rows: ShiftRow[] = useMemo(() => {
        if (!data?.days?.length) return []
        const result: ShiftRow[] = []
        data.days.forEach((day) => {
            let closures =
                day.shiftClosures && day.shiftClosures.length
                    ? day.shiftClosures
                    : []
            if (!closures.length) {
                const legacy = (
                    day as unknown as {
                        shiftClose?: DailyShiftCloseSummary | null
                    }
                ).shiftClose
                if (legacy) {
                    closures = [legacy]
                }
            }
            closures.forEach((close, idx) => {
                const key = `${day.date}-${close.shiftId || day.day}-${idx}`
                result.push({
                    key,
                    day,
                    shiftId: close.shiftId || '—',
                    closedAt: close.closedAt || '',
                    close,
                })
            })
        })
        return result
    }, [data])

    const changeMonth = useCallback(
        (delta: number) => {
            setMonth((current) => {
                let nextMonth = current + delta
                let nextYear = year
                if (nextMonth < 1) {
                    nextMonth = 12
                    nextYear = year - 1
                } else if (nextMonth > 12) {
                    nextMonth = 1
                    nextYear = year + 1
                }
                if (nextYear !== year) {
                    setYear(nextYear)
                }
                return nextMonth
            })
        },
        [year]
    )

    const formattedMonthLabel = useMemo(() => {
        if (data?.monthName) {
            return `${data.monthName} ${data.year}`
        }
        const date = new Date(year, month - 1, 1)
        return new Intl.DateTimeFormat(settings.locale || 'en-US', {
            month: 'long',
            year: 'numeric',
        }).format(date)
    }, [data?.monthName, data?.year, month, settings.locale, year])

    return (
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 md:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Shift Closures
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Pulled from each daily sheet&apos;s{' '}
                        <code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-800">
                            shift.close
                        </code>{' '}
                        event row.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => changeMonth(-1)}
                        disabled={loading}
                    >
                        Previous
                    </Button>
                    <span className="min-w-[140px] text-center text-sm font-medium text-gray-900 dark:text-gray-100">
                        {formattedMonthLabel}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => changeMonth(1)}
                        disabled={
                            loading ||
                            (year === today.getFullYear() &&
                                month === today.getMonth() + 1)
                        }
                    >
                        Next
                    </Button>
                </div>
            </div>
            {loading ? (
                <div className="py-8 text-sm text-gray-500 dark:text-gray-400">
                    Loading shift summaries…
                </div>
            ) : error ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    {error}
                </div>
            ) : rows.length === 0 ? (
                <div className="py-8 text-sm text-gray-500 dark:text-gray-400">
                    No shift closures recorded for this month yet.
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-[720px] divide-y divide-gray-200 text-sm dark:divide-gray-800">
                        <thead className="bg-gray-50 text-gray-600 dark:bg-gray-900/40 dark:text-gray-300">
                            <tr>
                                <th className="px-3 py-2 text-left font-medium">
                                    Date
                                </th>
                                <th className="px-3 py-2 text-left font-medium">
                                    Shift
                                </th>
                                <th className="px-3 py-2 text-right font-medium">
                                    Gross
                                </th>
                                <th className="px-3 py-2 text-right font-medium">
                                    Net
                                </th>
                                <th className="px-3 py-2 text-right font-medium">
                                    Tax
                                </th>
                                <th className="px-3 py-2 text-right font-medium">
                                    Voids
                                </th>
                                <th className="px-3 py-2 text-right font-medium">
                                    Avg Ticket
                                </th>
                                <th className="px-3 py-2 text-right font-medium">
                                    Cash
                                </th>
                                <th className="px-3 py-2 text-right font-medium">
                                    Card
                                </th>
                                <th className="px-3 py-2 text-right font-medium">
                                    PromptPay
                                </th>
                                <th className="px-3 py-2 text-right font-medium">
                                    Hours
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                            {rows.map(
                                ({ key, day, shiftId, closedAt, close }) => {
                                    const dateLabel = (() => {
                                        try {
                                            const parsed = new Date(
                                                `${day.date}T00:00:00`
                                            )
                                            return `${dateFormatter.format(parsed)}`
                                        } catch {
                                            return day.date
                                        }
                                    })()
                                    const closedAtLabel = (() => {
                                        if (!closedAt) return ''
                                        const parsed = new Date(closedAt)
                                        if (!Number.isNaN(parsed.getTime())) {
                                            return dateTimeFormatter.format(
                                                parsed
                                            )
                                        }
                                        return closedAt
                                    })()
                                    return (
                                        <tr
                                            key={key}
                                            className="bg-white dark:bg-gray-900/60"
                                        >
                                            <td className="px-3 py-2 align-top">
                                                <div className="font-medium text-gray-900 dark:text-gray-100">
                                                    {dateLabel}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                                    {day.weekday}
                                                    {closedAtLabel
                                                        ? ` • ${closedAtLabel}`
                                                        : ''}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 align-top text-gray-900 dark:text-gray-100">
                                                {shiftId || '—'}
                                                {close?.managerOnDuty ? (
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                                        Manager:{' '}
                                                        {close.managerOnDuty}
                                                    </div>
                                                ) : null}
                                                {close?.staffCount != null ? (
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                                        Staff:{' '}
                                                        {close.staffCount}
                                                    </div>
                                                ) : null}
                                            </td>
                                            <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">
                                                {formatNumber(
                                                    formatter,
                                                    close?.grossSales
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">
                                                {formatNumber(
                                                    formatter,
                                                    close?.netSales
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">
                                                {formatNumber(
                                                    formatter,
                                                    close?.taxCollected
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">
                                                {formatNumber(
                                                    formatter,
                                                    close?.voidedAmount
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">
                                                {formatNumber(
                                                    formatter,
                                                    close?.averageTicketValue
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">
                                                {formatNumber(
                                                    formatter,
                                                    close?.cashSales
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">
                                                {formatNumber(
                                                    formatter,
                                                    close?.cardSales
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">
                                                {formatNumber(
                                                    formatter,
                                                    close?.promptPaySales
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">
                                                {close?.hoursOpen != null &&
                                                !Number.isNaN(close.hoursOpen)
                                                    ? `${hoursFormatter.format(
                                                          close.hoursOpen
                                                      )} h`
                                                    : '—'}
                                            </td>
                                        </tr>
                                    )
                                }
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    )
}
