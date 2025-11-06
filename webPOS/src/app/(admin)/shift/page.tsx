'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import Button from '@/components/ui/button/Button'

import { useToast } from '@/components/uiz/use-toast'

import { useRealtime, broadcastUpdate } from '@/hooks/use-realtime'

import ExportToDriveModal from '@/components/ecommerce/ExportToDriveModal'

import { getSessionActor } from '@/lib/session'

import { syncMenuFromRemote, clearCatalog } from '@/lib/local-catalog'

import {
    getCurrentShift as dbGetCurrentShift,
    openShift as dbOpenShift,
    closeShift as dbCloseShift,
    shiftLiveSummary as dbShiftLiveSummary,
} from '@/lib/local-pos'
import {
    DEFAULT_GENERAL_SETTINGS,
    GENERAL_SETTINGS_STORAGE_KEY,
    deriveCurrencySymbol,
    loadGeneralSettings,
} from '@/lib/settings'

type Shift = { shiftId: string; openedAt: string; openedBy: string } | null

type Summary = {
    cashSales: number
    cardSales: number
    promptPaySales: number
    ticketsCount: number
    itemsSold: { name: string; qty: number }[]
}

const formatDateTime = (
    value: string | number | Date | null | undefined,
    locale?: string,
    timeZone?: string
): string => {
    if (!value) return '-'
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    try {
        const options: Intl.DateTimeFormatOptions = {
            dateStyle: 'medium',
            timeStyle: 'short',
        }
        if (timeZone) {
            options.timeZone = timeZone
        }
        return new Intl.DateTimeFormat(locale || undefined, options).format(
            date
        )
    } catch {
        return date.toLocaleString()
    }
}

const toMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

export default function ShiftPage() {
    const { toast } = useToast()

    const menuSyncedRef = useRef(false)

    const [settings, setSettings] = useState(DEFAULT_GENERAL_SETTINGS)
    const [loading, setLoading] = useState(true)

    const [shift, setShift] = useState<Shift>(null)

    const [live, setLive] = useState<Summary | null>(null)

    const [busy, setBusy] = useState(false)

    const [showExport, setShowExport] = useState(false)

    const ensureMenuSynced = useCallback(async () => {
        if (menuSyncedRef.current) return

        try {
            await syncMenuFromRemote({ ignoreBootstrap: true })

            menuSyncedRef.current = true
        } catch (err) {
            console.error('Menu sync failed', err)

            toast({ title: 'Menu sync failed', description: toMessage(err) })
        }
    }, [toast])

    const load = useCallback(async () => {
        try {
            setLoading(true)

            const cur = await dbGetCurrentShift()

            setShift(
                cur
                    ? {
                          shiftId: cur.id,
                          openedAt: new Date(cur.openedAt).toISOString(),
                          openedBy: cur.openedBy || '-',
                      }
                    : null
            )

            if (cur) {
                const s = await dbShiftLiveSummary()

                setLive(s)

                if (!menuSyncedRef.current) {
                    void ensureMenuSynced()
                }
            } else {
                setLive(null)
            }
        } finally {
            setLoading(false)
        }
    }, [ensureMenuSynced])

    useEffect(() => {
        void load()
    }, [load])

    useEffect(() => {
        const refreshSettings = () => {
            try {
                setSettings(loadGeneralSettings())
            } catch {
                setSettings(DEFAULT_GENERAL_SETTINGS)
            }
        }
        refreshSettings()
        const onStorage = (event: StorageEvent) => {
            if (!event.key || event.key === GENERAL_SETTINGS_STORAGE_KEY) {
                refreshSettings()
            }
        }
        window.addEventListener('storage', onStorage)
        window.addEventListener(
            'pos:settings:updated',
            refreshSettings as EventListener
        )
        return () => {
            window.removeEventListener('storage', onStorage)
            window.removeEventListener(
                'pos:settings:updated',
                refreshSettings as EventListener
            )
        }
    }, [])

    const currencySymbol = useMemo(() => {
        return (
            settings.currencySymbol ||
            deriveCurrencySymbol(settings.currencyCode, settings.locale) ||
            '$'
        )
    }, [settings])

    // Realtime refresh: shift summary/current shift

    useRealtime({
        onShift: () => {
            void load()
        },
    })

    const openShift = async () => {
        try {
            setBusy(true)

            const actor = getSessionActor()
            // Kick off Drive/Sheets bootstrap via GAS (non-blocking)
            try {
                void fetch('/api/gas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'openShift' }),
                    cache: 'no-store',
                })
                    .then(async (res) => {
                        if (!res.ok) {
                            const text = await res.text()
                            throw new Error(
                                `GAS openShift failed: ${res.status} ${text.slice(0, 200)}`
                            )
                        }
                        return res.json().catch(() => ({}))
                    })
                    .catch((err) => {
                        console.warn('GAS openShift error', err)
                        // Surface as a non-blocking warning toast
                        try {
                            toast({
                                title: 'Google Sheets init failed',
                                description:
                                    (err instanceof Error
                                        ? err.message
                                        : String(err)) || 'Unknown error',
                                variant: 'destructive',
                            })
                        } catch {}
                    })
            } catch (err) {
                console.warn('Failed to trigger GAS openShift', err)
            }

            const data = await dbOpenShift(actor)

            menuSyncedRef.current = false

            void ensureMenuSynced()

            toast({
                title: 'Shift opened',
                description: `Shift ${data.shiftId}`,
            })

            try {
                broadcastUpdate('shift')
            } catch {}

            // Log shift.open to daily sheet with shiftId
            try {
                void fetch('/api/gas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'recordShift',
                        eventAction: 'shift.open',
                        shiftId: data.shiftId,
                        status: 'open',
                    }),
                })
            } catch {}

            await load()
        } catch (e) {
            toast({
                title: 'Failed to open shift',
                description: toMessage(e),
                variant: 'destructive',
            })
        } finally {
            setBusy(false)
        }
    }

    const closeShift = async () => {
        try {
            setBusy(true)

            const actor = getSessionActor()

            const result = await dbCloseShift(actor)

            try {
                await clearCatalog()
            } catch (err) {
                console.warn('Failed to clear menu cache', err)
            }

            menuSyncedRef.current = false

            toast({
                title: 'Shift closed',
                description: `Tickets: ${result.ticketsCount}, Cash: ${currencySymbol}${result.cashSales.toFixed(2)}`,
            })

            try {
                broadcastUpdate('shift')
            } catch {}

            await load()

            setShowExport(true)

            setBusy(false)
        } catch (e) {
            toast({
                title: 'Failed to close shift',
                description: toMessage(e),
                variant: 'destructive',
            })
        } finally {
            // handled above
        }
    }

    return (
        <div className="py-4 sm:py-6">
            <div className="mb-4">
                <h1 className="text-lg font-semibold">Shift</h1>

                <p className="text-sm text-gray-500">
                    Open or close a shift and view sales summary.
                </p>
            </div>

            {loading ? (
                <div className="text-sm text-gray-500">Loading...</div>
            ) : !shift ? (
                <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
                    <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
                        No shift is currently open.
                    </p>

                    <Button onClick={openShift} disabled={busy}>
                        {busy ? 'Opening...' : 'Open Shift'}
                    </Button>
                </div>
            ) : (
                <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
                    <div className="mb-4 grid gap-2 sm:grid-cols-2">
                        <div>
                            <div className="text-sm text-gray-500">
                                Shift ID
                            </div>

                            <div className="font-medium">{shift.shiftId}</div>
                        </div>

                        <div>
                            <div className="text-sm text-gray-500">
                                Opened At
                            </div>

                            <div className="font-medium">
                                {formatDateTime(
                                    shift.openedAt,
                                    settings.locale,
                                    settings.timeZone
                                )}
                            </div>
                        </div>

                        <div>
                            <div className="text-sm text-gray-500">
                                Opened By
                            </div>

                            <div className="font-medium">
                                {shift.openedBy || '-'}
                            </div>
                        </div>
                    </div>

                    <div className="mb-4">
                        <h2 className="text-base font-semibold">
                            Live Summary
                        </h2>

                        {!live ? (
                            <div className="text-sm text-gray-500">
                                No data yet.
                            </div>
                        ) : (
                            <div className="mt-2 grid gap-3 sm:grid-cols-3">
                                <div className="rounded-md border p-3 dark:border-gray-800">
                                    <div className="text-xs text-gray-500">
                                        Cash Sales
                                    </div>

                                    <div className="font-medium">
                                        {currencySymbol}
                                        {live.cashSales.toFixed(2)}
                                    </div>
                                </div>

                                <div className="rounded-md border p-3 dark:border-gray-800">
                                    <div className="text-xs text-gray-500">
                                        Card Sales
                                    </div>

                                    <div className="font-medium">
                                        {currencySymbol}
                                        {live.cardSales.toFixed(2)}
                                    </div>
                                </div>

                                <div className="rounded-md border p-3 dark:border-gray-800">
                                    <div className="text-xs text-gray-500">
                                        PromptPay Sales
                                    </div>

                                    <div className="font-medium">
                                        {currencySymbol}
                                        {live.promptPaySales.toFixed(2)}
                                    </div>
                                </div>

                                <div className="rounded-md border p-3 dark:border-gray-800 sm:col-span-3">
                                    <div className="text-xs text-gray-500">
                                        Tickets
                                    </div>

                                    <div className="font-medium">
                                        {live.ticketsCount}
                                    </div>
                                </div>

                                <div className="rounded-md border p-3 dark:border-gray-800 sm:col-span-3">
                                    <div className="text-xs text-gray-500 mb-1">
                                        Items Sold
                                    </div>

                                    {live.itemsSold.length === 0 ? (
                                        <div className="text-sm text-gray-500">
                                            No items yet.
                                        </div>
                                    ) : (
                                        <ul className="text-sm">
                                            {live.itemsSold.map((it, idx) => (
                                                <li key={`${it.name}-${idx}`}>
                                                    {it.qty} x {it.name}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2">
                        <Button
                            variant="primary"
                            onClick={closeShift}
                            disabled={busy}
                        >
                            {busy ? 'Closing...' : 'Close Shift'}
                        </Button>
                    </div>
                </div>
            )}

            <ExportToDriveModal
                open={showExport}
                onClose={() => setShowExport(false)}
            />
        </div>
    )
}
