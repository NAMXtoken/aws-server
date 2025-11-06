'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
    RealtimeChannel,
    RealtimePostgresInsertPayload,
    RealtimePostgresUpdatePayload,
} from '@supabase/supabase-js'

import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'
import { readCookie } from '@/lib/session'

type PagerEventRow = Database['public']['Tables']['pager_events']['Row']

export type PagerEvent = {
    id: string
    message: string
    createdAt: number
    senderDisplayName?: string | null
    origin?: string | null
}

const POLL_ENDPOINT = '/api/pager'
const SUPABASE_ENABLED =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

function formatRelative(ms: number) {
    const diff = Date.now() - ms
    if (diff < 30_000) return 'just now'
    if (diff < 90_000) return '1 min ago'
    if (diff < 3_600_000) {
        const mins = Math.round(diff / 60_000)
        return `${mins} min${mins === 1 ? '' : 's'} ago`
    }
    const hours = Math.round(diff / 3_600_000)
    return `${hours} hr${hours === 1 ? '' : 's'} ago`
}

function isEventRelevant(
    row: PagerEventRow | null,
    recipientPin: string | null,
    recipientRole: string | null
) {
    if (!row) return false
    if (row.target_pin) {
        if (!recipientPin) return false
        return (
            row.target_pin.replace(/\s+/g, '') ===
            recipientPin.replace(/\s+/g, '')
        )
    }
    if (row.target_role) {
        if (!recipientRole) return false
        return row.target_role === recipientRole
    }
    return true
}

function mapRowToEvent(row: PagerEventRow): PagerEvent {
    return {
        id: row.id,
        message: row.message,
        createdAt: Date.parse(row.created_at) || Date.now(),
        senderDisplayName: row.sender_display_name,
        origin: row.origin,
    }
}

export default function PagerAlert() {
    const [alert, setAlert] = useState<PagerEvent | null>(null)
    const [tenantId, setTenantId] = useState<string | null>(null)
    const [pin, setPin] = useState<string | null>(null)
    const [role, setRole] = useState<string | null>(null)
    const channelRef = useRef<RealtimeChannel | null>(null)
    const vibratingRef = useRef<number | null>(null)
    const lastAlertRef = useRef<string | null>(null)

    useEffect(() => {
        setTenantId(readCookie('tenantId'))
        setPin(readCookie('pin'))
        setRole(readCookie('role'))
    }, [])

    const stopHaptics = useCallback(() => {
        if (typeof window !== 'undefined') {
            const bridge = (window as any).AndroidPagerBridge
            if (bridge && typeof bridge.stopAlert === 'function') {
                try {
                    bridge.stopAlert()
                } catch {}
            }
        }
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try {
                navigator.vibrate(0)
            } catch {}
        }
        if (vibratingRef.current && typeof window !== 'undefined') {
            window.clearInterval(vibratingRef.current)
            vibratingRef.current = null
        }
    }, [])

    const startHaptics = useCallback(() => {
        if (typeof window !== 'undefined') {
            const bridge = (window as any).AndroidPagerBridge
            if (bridge && typeof bridge.startAlert === 'function') {
                try {
                    bridge.startAlert()
                } catch {}
            }
        }
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try {
                navigator.vibrate([0, 200, 120, 200])
            } catch {}
        }
        if (vibratingRef.current && typeof window !== 'undefined') {
            window.clearInterval(vibratingRef.current)
        }
        if (typeof window === 'undefined') return
        vibratingRef.current = window.setInterval(() => {
            const bridge = (window as any).AndroidPagerBridge
            if (bridge && typeof bridge.startAlert === 'function') {
                try {
                    bridge.startAlert()
                } catch {}
            }
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                try {
                    navigator.vibrate([0, 160, 80, 180])
                } catch {}
            }
        }, 6000)
    }, [])

    const fetchLatest = useCallback(
        async (tenant: string, recipientPin: string | null, recipientRole: string | null) => {
            try {
                const params = new URLSearchParams({ tenantId: tenant })
                if (recipientPin) params.set('pin', recipientPin)
                if (recipientRole) params.set('role', recipientRole)
                const res = await fetch(`${POLL_ENDPOINT}?${params.toString()}`, {
                    method: 'GET',
                    credentials: 'same-origin',
                })
                if (!res.ok) return
                const json = (await res.json()) as {
                    ok?: boolean
                    event?: {
                        id: string
                        message: string
                        createdAt: string
                        senderDisplayName?: string | null
                        origin?: string | null
                    }
                }
                if (json?.ok && json.event) {
                    setAlert({
                        id: json.event.id,
                        message: json.event.message,
                        createdAt: Date.parse(json.event.createdAt) || Date.now(),
                        senderDisplayName: json.event.senderDisplayName,
                        origin: json.event.origin ?? null,
                    })
                }
            } catch (error) {
                console.warn('Failed to fetch latest pager event', error)
            }
        },
        []
    )

    useEffect(() => {
        if (!SUPABASE_ENABLED || !tenantId) return
        const supabase = getSupabaseBrowserClient()

        // Initial fetch
        fetchLatest(tenantId, pin, role)

        const channel = supabase
            .channel(`pager:${tenantId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'pager_events',
                    filter: `tenant_id=eq.${tenantId}`,
                },
                (payload: RealtimePostgresInsertPayload<PagerEventRow>) => {
                    const row = payload.new
                    if (!row || row.acknowledged_at) return
                    if (!isEventRelevant(row, pin, role)) return
                    setAlert(mapRowToEvent(row))
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'pager_events',
                    filter: `tenant_id=eq.${tenantId}`,
                },
                (payload: RealtimePostgresUpdatePayload<PagerEventRow>) => {
                    const row = payload.new
                    if (!row || !row.acknowledged_at) return
                    setAlert((current) =>
                        current?.id === row.id ? null : current
                    )
                }
            )
            .subscribe()

        channelRef.current = channel

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current)
                channelRef.current = null
            }
            stopHaptics()
        }
    }, [tenantId, pin, role, fetchLatest, stopHaptics])

    useEffect(() => {
        if (alert && alert.id !== lastAlertRef.current) {
            lastAlertRef.current = alert.id
            startHaptics()
        }
        if (!alert) {
            lastAlertRef.current = null
            stopHaptics()
        }
    }, [alert, startHaptics, stopHaptics])

    const acknowledge = useCallback(async () => {
        if (!alert || !tenantId) return
        const payload = {
            id: alert.id,
            tenantId,
            acknowledgedByDisplayName: readCookie('name') || null,
        }
        let acknowledged = false
        try {
            const res = await fetch(POLL_ENDPOINT, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            if (res.ok) {
                acknowledged = true
            }
        } catch (error) {
            console.warn('Supabase pager ack failed, falling back', error)
        }
        if (!acknowledged) {
            await fetch('/api/gas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'ackPager', id: alert.id }),
            }).catch(() => undefined)
        }
        stopHaptics()
        setAlert(null)
    }, [alert, stopHaptics, tenantId])

    const subtitle = useMemo(() => {
        if (!alert) return undefined
        if (alert.senderDisplayName && alert.senderDisplayName.trim().length > 0)
            return `From ${alert.senderDisplayName}`
        if (alert.origin && alert.origin.trim().length > 0) return alert.origin
        return undefined
    }, [alert])

    if (!alert) return null
    if (!SUPABASE_ENABLED) return null

    return (
        <div className="flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50/95 px-3 py-1.5 text-amber-800 shadow-sm backdrop-blur dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-100">
            <span className="relative inline-flex h-3 w-3 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/60"></span>
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500"></span>
            </span>
            <div className="flex min-w-0 flex-col text-xs">
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-amber-600 dark:text-amber-100">
                    Pager
                </span>
                <span className="truncate text-sm font-semibold leading-tight">
                    {alert.message || 'Order ready'}
                </span>
                <span className="text-[0.7rem] text-amber-600 dark:text-amber-200">
                    {subtitle ? `${subtitle} • ` : ''}
                    {formatRelative(alert.createdAt)}
                </span>
            </div>
            <button
                type="button"
                onClick={acknowledge}
                className="ml-auto rounded-full bg-amber-500/90 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-600"
            >
                Acknowledge
            </button>
        </div>
    )
}
