'use client'

import { SyncQueue } from '@/lib/sync-queue'

type TicketEventPayload = Record<string, unknown>

const shiftIdCache: {
    value: string | null
    lastTicketId: string | null
} = {
    value: null,
    lastTicketId: null,
}

async function resolveShiftId(ticketId: string | null): Promise<string | null> {
    if (!ticketId) return shiftIdCache.value
    if (shiftIdCache.lastTicketId === ticketId && shiftIdCache.value) {
        return shiftIdCache.value
    }
    try {
        const localPosModule = await import('@/lib/local-pos')
        if (typeof localPosModule.getCurrentShift === 'function') {
            const shift = await localPosModule.getCurrentShift()
            if (shift && shift.id) {
                shiftIdCache.value = shift.id
                shiftIdCache.lastTicketId = ticketId
                return shift.id
            }
        }
    } catch (error) {
        console.warn('resolveShiftId failed', error)
    }
    return shiftIdCache.value
}

export async function queueTicketEvent(
    eventAction: string,
    payload: TicketEventPayload,
    timestamp = Date.now()
) {
    const sourceTicketId =
        typeof payload.sourceTicketId === 'string'
            ? payload.sourceTicketId
            : null
    const ticketId =
        typeof payload.ticketId === 'string' ? payload.ticketId : null
    const shiftId =
        (typeof payload.shiftId === 'string' && payload.shiftId) ||
        (await resolveShiftId(sourceTicketId || ticketId || null)) ||
        null
    const body = {
        eventAction,
        ...payload,
        shiftId,
    }
    let sent = false
    if (typeof fetch !== 'undefined') {
        try {
            const res = await fetch('/api/gas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'recordTicket',
                    ...body,
                }),
                cache: 'no-store',
            })
            if (!res.ok) throw new Error(`recordTicket failed: ${res.status}`)
            sent = true
        } catch (error) {
            console.warn('recordTicket immediate send failed', error)
        }
    }
    if (sent) return
    try {
        await SyncQueue.enqueue({
            action: 'recordTicket',
            payload: body,
            ts: timestamp,
        })
    } catch (queueError) {
        console.warn('Failed to enqueue ticket event', queueError)
    }
}
