'use client'

import type { CartItem } from '@/components/ecommerce/types/pos'
import { broadcastUpdate } from '@/hooks/use-realtime'
import { db, uuid } from '@/lib/db'
import { addNotification } from '@/lib/local-notifications'
import { enqueue } from '@/lib/sync-queue'
import { getSessionActor, readCookie } from '@/lib/session'
import { loadGeneralSettings } from '@/lib/settings'
import type {
    Ticket as DbTicket,
    TicketItem as DbTicketItem,
    ShiftRecord,
    VoidRequest,
} from '@/types/db'

export type PayMethod = 'cash' | 'card' | 'promptPay'

const normalizeShiftId = (value?: string | null): string => {
    if (!value) return ''
    const digits = String(value)
        .replace(/[^0-9]/g, '')
        .trim()
    return digits ? digits.padStart(3, '0') : String(value).trim()
}

const SHIFT_ID_STORAGE_KEY_PREFIX = 'pos.cache.lastShiftId'

const getShiftIdStorageKey = (): string => {
    const tenant = readCookie('tenantId')
    const normalized = tenant && tenant.trim().length > 0 ? tenant.trim() : null
    return normalized
        ? `${SHIFT_ID_STORAGE_KEY_PREFIX}:${normalized}`
        : SHIFT_ID_STORAGE_KEY_PREFIX
}

const readStoredShiftId = (): string | null => {
    if (typeof window === 'undefined') return null
    try {
        const value = window.localStorage.getItem(getShiftIdStorageKey())
        if (!value) return null
        const trimmed = value.trim()
        return trimmed.length > 0 ? trimmed : null
    } catch {
        return null
    }
}

const persistLastShiftId = (raw: string | null | undefined): void => {
    if (typeof window === 'undefined') return
    if (!raw) return
    const normalized = normalizeShiftId(raw) || String(raw || '').trim()
    if (!normalized) return
    try {
        window.localStorage.setItem(getShiftIdStorageKey(), normalized)
    } catch {
        /* ignore localStorage write errors */
    }
}

const bumpShiftId = (value: string): string | null => {
    const digits = String(value || '').replace(/[^0-9]/g, '')
    if (!digits) return null
    try {
        const next = (BigInt(digits) + BigInt(1)).toString()
        const width = Math.max(digits.length, next.length)
        return next.padStart(width, '0')
    } catch {
        const parsed = parseInt(digits, 10)
        if (!Number.isFinite(parsed)) return null
        const nextNum = parsed + 1
        const nextStr = String(nextNum)
        const width = Math.max(digits.length, nextStr.length)
        return nextStr.padStart(width, '0')
    }
}

const ensureUniqueShiftId = async (initial: string): Promise<string | null> => {
    let candidate = normalizeShiftId(initial) || initial.trim()
    if (!candidate) return null
    let attempts = 0
    while (attempts < 50 && candidate) {
        const clash = await db.shifts.get(candidate)
        if (!clash) return candidate
        const bumped = bumpShiftId(candidate)
        if (!bumped || bumped === candidate) break
        candidate = bumped
        attempts += 1
    }
    return null
}

const rememberLastShiftId = (value: string): void => {
    persistLastShiftId(value)
}

const determineNextShiftId = async (now: number): Promise<string> => {
    const candidates: string[] = []
    const stored = readStoredShiftId()
    if (stored) {
        const normalizedStored = normalizeShiftId(stored)
        const bumped = normalizedStored ? bumpShiftId(normalizedStored) : null
        if (bumped) candidates.push(bumped)
        else if (normalizedStored) candidates.push(normalizedStored)
    }
    try {
        const last = await db.shifts.orderBy('openedAt').last()
        const lastIdRaw = (last as any)?.rawId || last?.id || null
        const normalized = normalizeShiftId(lastIdRaw)
        if (normalized) {
            const bumped = bumpShiftId(normalized)
            if (bumped) candidates.push(bumped)
            else candidates.push(normalized)
        }
    } catch (error) {
        console.warn(
            'determineNextShiftId failed to inspect previous shift',
            error
        )
    }
    for (const candidate of candidates) {
        const unique = await ensureUniqueShiftId(candidate)
        if (unique) return unique
    }
    const todayKey = new Date(now).toISOString().slice(0, 10)
    const shiftsToday = await db.shifts
        .filter((s) => {
            if (!s || typeof s.openedAt !== 'number') return false
            return new Date(s.openedAt).toISOString().slice(0, 10) === todayKey
        })
        .count()
    let seq = shiftsToday + 1
    while (seq < Number.MAX_SAFE_INTEGER) {
        const fallback = String(seq).padStart(3, '0')
        const unique = await ensureUniqueShiftId(fallback)
        if (unique) return unique
        seq += 1
    }
    return String(now)
}

type ShiftMetrics = {
    cashSales: number
    cardSales: number
    promptPaySales: number
    ticketsCount: number
    itemsSold: { sku: string; name: string; qty: number; total: number }[]
}

async function recordAudit(
    action: string,
    entity: string,
    entityId: string,
    details: Record<string, unknown>,
    actor?: string | null
): Promise<void> {
    await db.audit_log.add({
        id: uuid(),
        timestamp: Date.now(),
        action,
        entity,
        entityId,
        actor: actor ?? getSessionActor(),
        details,
    })
}

async function summarizeShift(
    startMs: number,
    endMs?: number
): Promise<ShiftMetrics> {
    const tickets = await db.tickets
        .filter((t) => t.openedAt >= startMs)
        .toArray()
    if (tickets.length === 0) {
        return {
            cashSales: 0,
            cardSales: 0,
            promptPaySales: 0,
            ticketsCount: 0,
            itemsSold: [],
        }
    }
    const ticketIds = tickets.map((t) => t.id)
    const itemRows = ticketIds.length
        ? await db.ticket_items.where('ticketId').anyOf(ticketIds).toArray()
        : []
    const itemsByTicket = new Map<string, DbTicketItem[]>()
    for (const item of itemRows) {
        const bucket = itemsByTicket.get(item.ticketId)
        if (bucket) bucket.push(item)
        else itemsByTicket.set(item.ticketId, [item])
    }

    let cashSales = 0
    let cardSales = 0
    let promptPaySales = 0
    let ticketsCount = 0
    const itemAccumulator = new Map<
        string,
        { sku: string; name: string; qty: number; total: number }
    >()

    for (const ticket of tickets) {
        const closedWithinWindow =
            ticket.status === 'closed' &&
            ticket.closedAt != null &&
            ticket.closedAt >= startMs &&
            (endMs == null || ticket.closedAt <= endMs)
        if (closedWithinWindow) ticketsCount += 1

        const items = itemsByTicket.get(ticket.id) ?? []
        const computedTotal = items.reduce(
            (sum, it) => sum + it.qty * it.price,
            0
        )
        const payAmount = Number(ticket.payAmount)
        const settled = Number.isFinite(payAmount) ? payAmount : computedTotal

        if (closedWithinWindow) {
            if (ticket.payMethod === 'cash') cashSales += settled
            else if (ticket.payMethod === 'card') cardSales += settled
            else if (ticket.payMethod === 'promptPay') promptPaySales += settled
        }

        for (const item of items) {
            const key = item.sku || item.name
            const lineTotal = (item.lineTotal ?? item.qty * item.price) || 0
            if (itemAccumulator.has(key)) {
                const existing = itemAccumulator.get(key)!
                existing.qty += item.qty
                existing.total += lineTotal
            } else {
                itemAccumulator.set(key, {
                    sku: item.sku,
                    name: item.name,
                    qty: item.qty,
                    total: lineTotal,
                })
            }
        }
    }

    return {
        cashSales,
        cardSales,
        promptPaySales,
        ticketsCount,
        itemsSold: Array.from(itemAccumulator.values()),
    }
}

function getDefaultTaxRatePercent(): number {
    try {
        const s = loadGeneralSettings()
        const raw = String(s.defaultTaxRate || '').replace(',', '.')
        const n = parseFloat(raw)
        return Number.isFinite(n) ? n : 0
    } catch {
        return 0
    }
}

function computeTotalsFromItems(
    items: DbTicketItem[],
    taxRatePct?: number
): {
    subtotal: number
    taxRate: number
    taxAmount: number
    total: number
} {
    const subtotal = items.reduce(
        (sum, it) => sum + (it.lineTotal ?? it.qty * it.price),
        0
    )
    const rate = Number.isFinite(taxRatePct as number)
        ? (taxRatePct as number)
        : getDefaultTaxRatePercent()
    const taxAmount = (subtotal * rate) / 100
    const total = subtotal + taxAmount
    return { subtotal, taxRate: rate, taxAmount, total }
}

export async function listOpenTickets(): Promise<DbTicket[]> {
    return db.tickets
        .filter((t) => (t.status ?? 'open') === 'open')
        .reverse()
        .sortBy('openedAt')
}

export async function getTicketItems(
    ticketId: string
): Promise<DbTicketItem[]> {
    return db.ticket_items.where('ticketId').equals(ticketId).sortBy('addedAt')
}

export async function openTicket(
    openedBy?: string,
    options?: { covers?: number | null; notes?: string | null }
): Promise<{
    ticketId: string
    openedAt: number
    name: string
    covers?: number | null
    notes?: string | null
}> {
    const actor =
        openedBy && openedBy.trim().length > 0
            ? openedBy.trim()
            : getSessionActor()
    const now = Date.now()
    const shift = await getCurrentShift()
    if (!shift) throw new Error('No open shift')
    const rawShiftId = (shift as any).rawId || shift.id
    const normalizedShiftId = normalizeShiftId(rawShiftId)
    const shiftId = normalizedShiftId || rawShiftId
    const prefixes = Array.from(
        new Set([
            rawShiftId ? `${rawShiftId}-` : null,
            shiftId ? `${shiftId}-` : null,
        ])
    ).filter(
        (prefix): prefix is string =>
            typeof prefix === 'string' && prefix.trim().length > 0
    )
    const existingForShift = await db.tickets
        .filter((t) => {
            if (typeof t.id !== 'string') return false
            return prefixes.some((prefix) => t.id.startsWith(prefix))
        })
        .count()
    let seq = existingForShift + 1
    let ticketSuffix = ''
    let ticketId = ''
    // Keep bumping the sequence until we find an unused `${shiftId}-###` pair
    while (true) {
        ticketSuffix = String(seq).padStart(3, '0')
        ticketId = `${shiftId}-${ticketSuffix}`
        const clash = await db.tickets.get(ticketId)
        if (!clash) break
        seq += 1
    }
    const normalizedCovers =
        options && Object.prototype.hasOwnProperty.call(options, 'covers')
            ? (() => {
                  const raw = options?.covers
                  if (raw == null || Number.isNaN(raw)) return null
                  const parsed = Math.max(0, Math.floor(Number(raw)))
                  return Number.isFinite(parsed) ? parsed : null
              })()
            : null
    const normalizedNotes =
        options && typeof options.notes === 'string'
            ? options.notes.trim() || null
            : (options?.notes ?? null)
    const ticket: DbTicket = {
        id: ticketId,
        name: ticketSuffix,
        openedBy: actor,
        openedAt: now,
        openedAtIso: new Date(now).toISOString(),
        status: 'open',
        notes: normalizedNotes ?? null,
        covers: normalizedCovers ?? null,
    } as DbTicket
    // Attach default tax rate from settings
    ;(ticket as any).taxRate = getDefaultTaxRatePercent()

    await db.transaction('readwrite', db.tickets, db.audit_log, async () => {
        await db.tickets.add(ticket)
        await recordAudit(
            'openTicket',
            'Ticket',
            ticketId,
            { ticketId, openedBy: actor, openedAt: ticket.openedAtIso },
            actor
        )
    })
    return {
        ticketId,
        openedAt: now,
        name: ticketSuffix,
        covers: normalizedCovers ?? null,
        notes: normalizedNotes ?? null,
    }
}

export async function updateTicketDetails(
    ticketId: string,
    updates: { covers?: number | null; notes?: string | null }
): Promise<{ covers?: number | null; notes?: string | null }> {
    const payload: Partial<DbTicket> = {}
    const details: Record<string, unknown> = {}

    if (Object.prototype.hasOwnProperty.call(updates, 'covers')) {
        const raw = updates.covers
        let normalized: number | null = null
        if (raw != null && !Number.isNaN(raw)) {
            const rounded = Math.floor(Number(raw))
            if (Number.isFinite(rounded) && rounded >= 0) {
                normalized = rounded
            } else {
                normalized = null
            }
        }
        payload.covers = normalized
        details.covers = normalized
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'notes')) {
        const raw = updates.notes
        const normalized =
            typeof raw === 'string'
                ? raw.trim().length > 0
                    ? raw.trim()
                    : null
                : (raw ?? null)
        payload.notes = normalized
        details.notes = normalized
    }

    if (Object.keys(payload).length === 0) {
        return {}
    }

    await db.transaction('readwrite', db.tickets, db.audit_log, async () => {
        await db.tickets.update(ticketId, payload)
        await recordAudit(
            'updateTicket',
            'Ticket',
            ticketId,
            { ticketId, ...details },
            getSessionActor()
        )
    })

    return {
        covers: payload.covers,
        notes: payload.notes,
    }
}

export async function saveCart(
    ticketId: string,
    items: CartItem[],
    actorInput?: string
): Promise<void> {
    const now = Date.now()
    const actor =
        actorInput && actorInput.trim().length > 0
            ? actorInput.trim()
            : getSessionActor()
    await db.transaction(
        'readwrite',
        db.ticket_items,
        db.audit_log,
        async () => {
            await db.ticket_items.where('ticketId').equals(ticketId).delete()
            if (items.length === 0) return
            const rows: DbTicketItem[] = items.map((item) => ({
                id: uuid(),
                ticketId,
                sku: item.id,
                name: item.name,
                qty: item.quantity,
                price: item.price,
                addedAt: now,
                lineTotal: Number(item.quantity) * Number(item.price),
            }))
            await db.ticket_items.bulkAdd(rows)
            for (const row of rows) {
                await recordAudit(
                    'addItem',
                    'Ticket',
                    ticketId,
                    {
                        ticketId,
                        itemName: row.name,
                        qty: row.qty,
                        price: row.price,
                    },
                    actor
                )
            }
        }
    )
}

export async function computeTicketTotal(ticketId: string): Promise<number> {
    const items = await getTicketItems(ticketId)
    return items.reduce(
        (sum, it) => sum + (it.lineTotal ?? it.qty * it.price),
        0
    )
}

export async function payTicket(
    ticketId: string,
    method: PayMethod,
    actorInput?: string
): Promise<{ ok: true; amount: number; closedAt: number }> {
    const lineItems = await getTicketItems(ticketId)
    const existingTicket = await db.tickets.get(ticketId)
    const defRate =
        (existingTicket as any)?.taxRate ?? getDefaultTaxRatePercent()
    const totals = computeTotalsFromItems(lineItems, defRate)
    const amount = totals.total
    const closedAt = Date.now()
    let ticketSnapshot = await db.tickets.get(ticketId)
    // Snapshot items for event logging
    const items = lineItems
    const actor =
        actorInput && actorInput.trim().length > 0
            ? actorInput.trim()
            : getSessionActor()
    await db.transaction('readwrite', db.tickets, db.audit_log, async () => {
        await db.tickets.update(ticketId, {
            status: 'closed',
            closedAt,
            closedBy: actor,
            payMethod: method,
            payAmount: amount,
            subtotal: totals.subtotal,
            taxRate: totals.taxRate,
            taxAmount: totals.taxAmount,
            total: totals.total,
        })
        await recordAudit(
            'closeTicket',
            'Ticket',
            ticketId,
            {
                ticketId,
                method,
                amount,
                subtotal: totals.subtotal,
                tax: totals.taxAmount,
                taxRate: totals.taxRate,
            },
            actor
        )
    })
    // Fire-and-forget: persist to GAS daily events sheet
    try {
        if (!ticketSnapshot) ticketSnapshot = await db.tickets.get(ticketId)
        const payload = {
            action: 'recordTicket',
            eventAction: 'ticket.pay',
            ticketId,
            ticketName: ticketSnapshot?.name || ticketId,
            openedBy: ticketSnapshot?.openedBy || actor,
            openedAt: ticketSnapshot?.openedAt || undefined,
            status: 'closed',
            price: amount,
            pay: method,
            closedAt,
            actor,
            meta: {
                subtotal: totals.subtotal,
                taxRate: totals.taxRate,
                taxAmount: totals.taxAmount,
                total: totals.total,
            },
            items: items.map((it) => ({
                itemId: it.sku || '',
                itemName: it.name || '',
                category: '',
                qty: it.qty,
                unitPrice: it.price,
                lineTotal: it.lineTotal ?? it.qty * it.price,
            })),
        }
        void fetch('/api/gas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            cache: 'no-store',
        }).catch(() => {})
    } catch {}
    return { ok: true, amount, closedAt }
}

// ------------------------------
// Void Requests (local-first)
// ------------------------------

export async function createVoidRequest(input: {
    ticketId: string
    ticketName?: string
    itemName: string
    itemSku?: string
    requestedQty: number
    approverId: string
    reason: string
    requestedBy?: string
}): Promise<VoidRequest> {
    const now = Date.now()
    const actor =
        (input.requestedBy && input.requestedBy.trim()) || getSessionActor()
    // Prefer storing the requester's PIN as the requestedBy id for reliable notification routing
    let requesterId: string | null = null
    try {
        requesterId = readCookie('pin') || null
    } catch {}
    const row: VoidRequest = {
        id: uuid(),
        ticketId: input.ticketId,
        ticketName: input.ticketName || null,
        itemSku: input.itemSku || null,
        itemName: input.itemName,
        requestedQty: Number(input.requestedQty || 0) || 0,
        approverId: String(input.approverId || ''),
        reason: String(input.reason || ''),
        requestedBy: (requesterId && requesterId.trim()) || actor,
        status: 'pending',
        createdAt: now,
        decidedAt: null as any,
    }
    await db.transaction(
        'readwrite',
        db.void_requests,
        db.audit_log,
        async () => {
            await db.void_requests.add(row)
            await recordAudit(
                'requestVoid',
                'Ticket',
                input.ticketId,
                {
                    ticketId: input.ticketId,
                    ticketName: input.ticketName || null,
                    itemName: input.itemName,
                    itemSku: input.itemSku || null,
                    qty: row.requestedQty,
                    approverId: row.approverId,
                    reason: row.reason,
                },
                actor
            )
        }
    )
    // Notify the approver
    try {
        const requesterDisplay = ((): string => {
            const name = readCookie('name')
            if (name && name.trim().length > 0) return `NAME ${name.trim()}`
            return actor
        })()
        await addNotification({
            userId: input.approverId,
            title: 'Void request',
            body: `${requesterDisplay} requested to void ${row.requestedQty} x ${row.itemName} on ${row.ticketName || row.ticketId}`,
            meta: { type: 'void-request', requestId: row.id },
        })
    } catch {}
    try {
        void fetch('/api/push/void', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                requestId: row.id,
                approverId: row.approverId,
                ticketId: row.ticketId,
                ticketName: row.ticketName,
                itemName: row.itemName,
                requestedQty: row.requestedQty,
                requestedBy: row.requestedBy,
                reason: row.reason,
            }),
        }).catch(() => undefined)
    } catch {}
    return row
}

export async function getVoidRequest(
    id: string
): Promise<VoidRequest | undefined> {
    return db.void_requests.get(id)
}

function deriveUserIdForNotifications(s: string | null | undefined): string {
    const v = String(s || '').trim()
    if (!v) return 'local-user'
    const m = /^([a-zA-Z]+):(.*)$/.exec(v)
    if (m && m[2]) return m[2]
    if (v.startsWith('pin:')) return v.slice(4)
    return v
}

export async function approveVoidRequest(
    id: string,
    approverId?: string
): Promise<VoidRequest | null> {
    const row = await db.void_requests.get(id)
    if (!row) return null
    const now = Date.now()
    const approver = (approverId && approverId.trim()) || getSessionActor()
    // Apply qty reduction to the ticket cart locally
    try {
        const items = await db.ticket_items
            .where('ticketId')
            .equals(row.ticketId)
            .toArray()
        const qtyToRemove = Math.abs(Number(row.requestedQty || 0) || 0)
        let affected = false
        let matchedPrice = 0
        let matchedSku: string | null = null
        for (const it of items) {
            const matchBySku =
                row.itemSku &&
                it.sku &&
                String(it.sku).trim() === String(row.itemSku).trim()
            const matchByName =
                String(it.name || '')
                    .trim()
                    .toLowerCase() ===
                String(row.itemName || '')
                    .trim()
                    .toLowerCase()
            if (matchBySku || matchByName) {
                const newQty = Math.max(0, Number(it.qty || 0) - qtyToRemove)
                matchedPrice = Number(it.price || 0) || 0
                matchedSku = it.sku || null
                if (newQty === 0) {
                    await db.ticket_items.delete(it.id)
                } else {
                    await db.ticket_items.update(it.id, {
                        qty: newQty,
                        lineTotal: (it.price || 0) * newQty,
                    } as any)
                }
                affected = true
                break
            }
        }
        if (affected) {
            await recordAudit(
                'voidAdjustCart',
                'Ticket',
                row.ticketId,
                {
                    requestId: id,
                    itemName: row.itemName,
                    itemSku: row.itemSku || null,
                    removedQty: qtyToRemove,
                },
                approver
            )
        }
        // Also log a cart correction event to GAS daily sheet
        try {
            const payload = {
                action: 'recordTicket',
                eventAction: 'cart.correct',
                ticketId: row.ticketId,
                ticketName: row.ticketName || undefined,
                actor: approver,
                status: 'open',
                items: [
                    {
                        itemId: matchedSku || row.itemSku || '',
                        itemName: row.itemName,
                        category: '',
                        qty: -qtyToRemove,
                        unitPrice: matchedPrice,
                        lineTotal: -qtyToRemove * matchedPrice,
                    },
                ],
                note: row.reason || '',
                meta: { requestId: id, type: 'voidAdjust' },
            }
            void fetch('/api/gas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                cache: 'no-store',
            }).catch(() => {})
        } catch {}
    } catch (e) {
        console.warn('Failed to adjust cart on void approval', e)
    }
    await db.transaction(
        'readwrite',
        db.void_requests,
        db.audit_log,
        async () => {
            await db.void_requests.update(id, {
                status: 'approved',
                decidedAt: now,
            })
            await recordAudit(
                'approveVoid',
                'Ticket',
                row.ticketId,
                { requestId: id, approverId: approver },
                approver
            )
        }
    )
    try {
        broadcastUpdate('tickets')
    } catch {}
    try {
        const target = deriveUserIdForNotifications((row as any).requestedBy)
        await addNotification({
            userId: target,
            title: 'Void request approved',
            body: `${row.requestedQty} x ${row.itemName} on ${row.ticketName || row.ticketId} approved`,
            meta: { type: 'void-request-approved', requestId: row.id },
        })
        void fetch('/api/push/void', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                requestId: row.id,
                targetUserId: target,
                ticketId: row.ticketId,
                ticketName: row.ticketName,
                itemName: row.itemName,
                requestedQty: row.requestedQty,
                requestedBy: row.requestedBy,
                reason: row.reason,
                title: 'Void request approved',
                body: `${row.requestedQty} x ${row.itemName} on ${row.ticketName || row.ticketId} approved`,
                data: {
                    type: 'void-request-approved',
                    status: 'approved',
                    decidedAt: now,
                },
            }),
        }).catch(() => undefined)
    } catch {}
    // On approval, log a void.approve event to GAS daily sheet (non-blocking)
    try {
        const ticketId = row.ticketId
        const ticket = await db.tickets.get(ticketId)
        const price = await computeTicketTotal(ticketId)
        const payload = {
            action: 'recordTicket',
            eventAction: 'void.approve',
            ticketId,
            ticketName: ticket?.name || ticketId,
            openedBy: ticket?.openedBy || undefined,
            openedAt: ticket?.openedAt || undefined,
            status: String(ticket?.status || 'open'),
            price,
            // pay and closedAt left blank on void approval snapshot
            actor: approver,
            itemName: row.itemName,
            qty: -Math.abs(Number(row.requestedQty || 0) || 0),
            inventoryDelta: -Math.abs(Number(row.requestedQty || 0) || 0),
            note: row.reason || '',
            meta: {
                requestId: row.id,
                approverId: approver,
                itemSku: row.itemSku || null,
            },
        }
        void fetch('/api/gas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            cache: 'no-store',
        }).catch(() => {})
    } catch {}
    return { ...(row as any), status: 'approved', decidedAt: now }
}

export async function rejectVoidRequest(
    id: string,
    approverId?: string,
    reason?: string
): Promise<VoidRequest | null> {
    const row = await db.void_requests.get(id)
    if (!row) return null
    const now = Date.now()
    const approver = (approverId && approverId.trim()) || getSessionActor()
    await db.transaction(
        'readwrite',
        db.void_requests,
        db.audit_log,
        async () => {
            await db.void_requests.update(id, {
                status: 'rejected',
                decidedAt: now,
            })
            await recordAudit(
                'rejectVoid',
                'Ticket',
                row.ticketId,
                {
                    requestId: id,
                    approverId: approver,
                    reason: String(reason || ''),
                },
                approver
            )
        }
    )
    try {
        const target = deriveUserIdForNotifications((row as any).requestedBy)
        await addNotification({
            userId: target,
            title: 'Void request denied',
            body: `${row.requestedQty} x ${row.itemName} on ${row.ticketName || row.ticketId} denied${reason ? ': ' + reason : ''}`,
            meta: { type: 'void-request-rejected', requestId: row.id },
        })
        void fetch('/api/push/void', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                requestId: row.id,
                targetUserId: target,
                ticketId: row.ticketId,
                ticketName: row.ticketName,
                itemName: row.itemName,
                requestedQty: row.requestedQty,
                requestedBy: row.requestedBy,
                reason: reason || row.reason,
                title: 'Void request denied',
                body: `${row.requestedQty} x ${row.itemName} on ${row.ticketName || row.ticketId} denied${reason ? ': ' + reason : ''}`,
                data: {
                    type: 'void-request-rejected',
                    status: 'rejected',
                    decidedAt: now,
                },
            }),
        }).catch(() => undefined)
    } catch {}
    return { ...(row as any), status: 'rejected', decidedAt: now }
}

export async function pageStaffMember(
    targetPin: string,
    options: { message: string; origin?: string }
): Promise<boolean> {
    const trimmedPin = targetPin.trim()
    if (!trimmedPin) throw new Error('Target PIN is required')

    const tenantId = readCookie('tenantId') || ''
    const senderDisplay = readCookie('name') || null
    const senderPin = readCookie('pin') || null

    if (tenantId) {
        try {
            const supabaseRes = await fetch('/api/pager', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId,
                    targetPin: trimmedPin,
                    message: options.message,
                    origin: options.origin ?? '',
                    sender: {
                        displayName: senderDisplay,
                        pin: senderPin,
                    },
                }),
            })
            if (supabaseRes.ok) {
                return true
            }
        } catch (error) {
            console.warn('Supabase pager enqueue failed, falling back', error)
        }
    }

    const payload = {
        action: 'pageUser' as const,
        targetPin: trimmedPin,
        message: options.message,
        origin: options.origin ?? '',
    }

    try {
        const res = await fetch('/api/gas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error(`pageUser ${res.status}`)
        return true
    } catch (error) {
        await enqueue({ action: 'pageUser', payload })
        return false
    }
}

export async function getCurrentShift(): Promise<
    (ShiftRecord & { rawId?: string }) | null
> {
    const candidates = await db.shifts
        .filter(
            (s) =>
                (s.status ?? (s.closedAt == null ? 'open' : 'closed')) ===
                'open'
        )
        .sortBy('openedAt')
    if (!candidates.length) return null
    const record = candidates[candidates.length - 1]
    const rawId = record?.id ?? ''
    const normalized = normalizeShiftId(rawId)
    if (!normalized || normalized === rawId) {
        return Object.assign({}, record, { rawId })
    }
    return Object.assign({}, record, { id: normalized, rawId })
}

export async function openShift(
    openedBy?: string
): Promise<{ shiftId: string; openedAt: number }> {
    const existing = await getCurrentShift()
    if (existing) {
        const normalizedId = normalizeShiftId(existing.id)
        return {
            shiftId: normalizedId || existing.id,
            openedAt: existing.openedAt,
        }
    }
    const now = Date.now()
    const actor =
        openedBy && openedBy.trim().length > 0
            ? openedBy.trim()
            : getSessionActor()
    const shiftId = await determineNextShiftId(now)
    const rec: ShiftRecord = {
        id: shiftId,
        openedAt: now,
        openedBy: actor,
        status: 'open',
        cashSales: 0,
        cardSales: 0,
        promptPaySales: 0,
        ticketsCount: 0,
        itemsSoldJson: null,
        notes: null,
    }
    await db.transaction('readwrite', db.shifts, db.audit_log, async () => {
        await db.shifts.add(rec)
        await recordAudit(
            'openShift',
            'Shift',
            shiftId,
            { shiftId, openedAt: now, openedBy: actor },
            actor
        )
    })
    rememberLastShiftId(shiftId)
    return { shiftId, openedAt: now }
}

export async function closeShift(closedBy?: string): Promise<{
    shiftId: string
    ticketsCount: number
    cashSales: number
    cardSales: number
    promptPaySales: number
    itemsSold: { name: string; qty: number }[]
    itemsSoldDetailed: ShiftMetrics['itemsSold']
}> {
    const cur = await getCurrentShift()
    if (!cur) throw new Error('no open shift')
    const end = Date.now()
    const actor =
        closedBy && closedBy.trim().length > 0
            ? closedBy.trim()
            : getSessionActor()
    const summary = await summarizeShift(cur.openedAt, end)
    const itemsSold = summary.itemsSold.map(({ name, qty }) => ({ name, qty }))
    const itemsSoldJson = JSON.stringify(itemsSold)
    const dbShiftId = ((cur as any).rawId as string | undefined) || cur.id

    await db.transaction('readwrite', db.shifts, db.audit_log, async () => {
        await db.shifts.update(dbShiftId, {
            closedAt: end,
            closedBy: actor,
            status: 'closed',
            cashSales: summary.cashSales,
            cardSales: summary.cardSales,
            promptPaySales: summary.promptPaySales,
            ticketsCount: summary.ticketsCount,
            itemsSoldJson,
        })
        await recordAudit(
            'closeShift',
            'Shift',
            cur.id,
            {
                shiftId: cur.id,
                closedAt: end,
                closedBy: actor,
                summary: {
                    cashSales: summary.cashSales,
                    cardSales: summary.cardSales,
                    promptPaySales: summary.promptPaySales,
                    ticketsCount: summary.ticketsCount,
                    itemsSold,
                },
            },
            actor
        )
    })

    rememberLastShiftId(cur.id)

    // Fire-and-forget: persist enhanced shift summary to GAS daily events
    try {
        // Additional enriched metrics
        const totalSales =
            summary.cashSales + summary.cardSales + summary.promptPaySales
        const avgTicket =
            summary.ticketsCount > 0 ? totalSales / summary.ticketsCount : 0
        const itemsCount = summary.itemsSold.reduce(
            (s, r) => s + (Number((r as any).qty) || 0),
            0
        )
        let cashAdjustmentsNet = 0
        try {
            const adj = await listCashAdjustmentsForCurrentShift()
            cashAdjustmentsNet = Number(adj?.netAdjustments || 0) || 0
        } catch {}
        let voidsApprovedCount = 0
        try {
            const reqs = await db.void_requests
                .filter(
                    (r) =>
                        r.status === 'approved' &&
                        (r.decidedAt || 0) >= cur.openedAt &&
                        (r.decidedAt || 0) <= end
                )
                .toArray()
            voidsApprovedCount = reqs.length
        } catch {}

        const shiftIdForPayload = normalizeShiftId(cur.id)
        const payload = {
            action: 'recordShift',
            shiftId: shiftIdForPayload,
            openedAt: cur.openedAt,
            openedBy: cur.openedBy,
            closedAt: end,
            closedBy: actor,
            status: 'closed',
            cashSales: summary.cashSales,
            cardSales: summary.cardSales,
            promptPaySales: summary.promptPaySales,
            ticketsCount: summary.ticketsCount,
            itemsSoldJson: itemsSoldJson,
            notes: cur.notes || '',
            meta: {
                openedAt: cur.openedAt,
                openedBy: cur.openedBy || '',
                closedAt: end,
                closedBy: actor || '',
                shiftDurationMin: Math.round((end - cur.openedAt) / 60000),
                totalSales,
                averageTicketValue: avgTicket,
                itemsCount,
                cashAdjustmentsNet,
                voidsApprovedCount,
                // Float/Petty if tracked locally
                floatOpening: (cur as any).floatOpening ?? null,
                floatClosing: (cur as any).floatClosing ?? null,
                floatWithdrawn: (cur as any).floatWithdrawn ?? null,
                pettyOpening: (cur as any).pettyOpening ?? null,
                pettyClosing: (cur as any).pettyClosing ?? null,
                pettyWithdrawn: (cur as any).pettyWithdrawn ?? null,
            },
        }
        void fetch('/api/gas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            cache: 'no-store',
        }).catch(() => {})
    } catch {}

    return {
        shiftId: normalizeShiftId(cur.id),
        ticketsCount: summary.ticketsCount,
        cashSales: summary.cashSales,
        cardSales: summary.cardSales,
        promptPaySales: summary.promptPaySales,
        itemsSold,
        itemsSoldDetailed: summary.itemsSold,
    }
}

export async function shiftLiveSummary(): Promise<{
    cashSales: number
    cardSales: number
    promptPaySales: number
    ticketsCount: number
    itemsSold: { name: string; qty: number }[]
}> {
    const cur = await getCurrentShift()
    if (!cur) {
        return {
            cashSales: 0,
            cardSales: 0,
            promptPaySales: 0,
            ticketsCount: 0,
            itemsSold: [],
        }
    }
    const summary = await summarizeShift(cur.openedAt)
    const itemsSold = summary.itemsSold.map(({ name, qty }) => ({ name, qty }))
    return {
        cashSales: summary.cashSales,
        cardSales: summary.cardSales,
        promptPaySales: summary.promptPaySales,
        ticketsCount: summary.ticketsCount,
        itemsSold,
    }
}

export async function clearLocalTickets(): Promise<{
    tickets: number
    items: number
}> {
    const [items, tickets] = await Promise.all([
        db.ticket_items.count(),
        db.tickets.count(),
    ])
    await db.transaction('readwrite', db.ticket_items, db.tickets, async () => {
        await db.ticket_items.clear()
        await db.tickets.clear()
    })
    return { tickets, items }
}

// ------------------------------
// Cash Float (local persistence)
// ------------------------------

export type CashAdjustmentType = 'topup' | 'withdrawal' | 'adjustment'

export type CashAdjustment = {
    id: string
    shiftId: string
    type: CashAdjustmentType
    amount: number
    description?: string
    timestamp: number
}

export async function getStartingFloatForCurrentShift(): Promise<{
    shiftId: string
    startingFloat: number
} | null> {
    const cur = await getCurrentShift()
    if (!cur) return null
    const startingFloat = Number((cur as any).floatOpening ?? 0) || 0
    return { shiftId: cur.id, startingFloat }
}

export async function setStartingFloatForCurrentShift(value: number): Promise<{
    shiftId: string
    startingFloat: number
}> {
    const cur = await getCurrentShift()
    if (!cur) throw new Error('No open shift')
    const val = Number(value)
    const normalized = Number.isFinite(val) ? val : 0
    const dbShiftId = ((cur as any).rawId as string | undefined) || cur.id
    await db.shifts.update(dbShiftId, { floatOpening: normalized })
    await recordAudit('setStartingFloat', 'Shift', cur.id, {
        shiftId: cur.id,
        startingFloat: normalized,
    })
    return { shiftId: cur.id, startingFloat: normalized }
}

export async function addCashAdjustmentForCurrentShift(
    type: CashAdjustmentType,
    amount: number,
    description?: string
): Promise<CashAdjustment> {
    const cur = await getCurrentShift()
    if (!cur) throw new Error('No open shift')
    if (!description || description.trim().length === 0) {
        throw new Error('Description is required for cash adjustments')
    }
    const id = uuid()
    const ts = Date.now()
    const raw = Number(amount) || 0
    const normalized =
        type === 'withdrawal'
            ? -Math.abs(raw)
            : type === 'topup'
              ? Math.abs(raw)
              : raw
    const adj: CashAdjustment = {
        id,
        shiftId: cur.id,
        type,
        amount: normalized,
        description: description || '',
        timestamp: ts,
    }
    await recordAudit('cashAdjustment', 'Shift', cur.id, adj)
    return adj
}

export async function listCashAdjustmentsForCurrentShift(): Promise<{
    adjustments: CashAdjustment[]
    netAdjustments: number
}> {
    const cur = await getCurrentShift()
    if (!cur) return { adjustments: [], netAdjustments: 0 }
    const shiftIdVariants = Array.from(
        new Set([cur.id, ((cur as any).rawId as string | undefined) || cur.id])
    ).filter((id) => id && id.length > 0)
    const all = await db.audit_log.toArray()
    const mineRaw = all
        .filter((e) => e.action === 'cashAdjustment')
        .map((e) => e.details as unknown as CashAdjustment)
        .filter((d) => {
            if (!d) return false
            const id = String(d.shiftId || '')
            return shiftIdVariants.some((candidate) => candidate === id)
        })
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    const mine = mineRaw.map((a) => {
        const raw = Number(a.amount) || 0
        const normalized =
            a.type === 'withdrawal'
                ? -Math.abs(raw)
                : a.type === 'topup'
                  ? Math.abs(raw)
                  : raw
        return { ...a, amount: normalized }
    })
    const net = mine.reduce((s, a) => s + (Number(a.amount) || 0), 0)
    return { adjustments: mine, netAdjustments: net }
}

// ------------------------------
// Petty Cash (local persistence)
// ------------------------------

export type PettyCashCategory = 'expense' | 'reimbursement' | 'topup'

export type PettyCashEntry = {
    id: string
    shiftId: string
    category: PettyCashCategory
    amount: number
    description: string
    timestamp: number
    receiptUrl?: string
}

export async function getStartingPettyForCurrentShift(): Promise<{
    shiftId: string
    startingPetty: number
} | null> {
    const cur = await getCurrentShift()
    if (!cur) return null
    const startingPetty = Number((cur as any).pettyOpening ?? 0) || 0
    return { shiftId: cur.id, startingPetty }
}

export async function setStartingPettyForCurrentShift(value: number): Promise<{
    shiftId: string
    startingPetty: number
}> {
    const cur = await getCurrentShift()
    if (!cur) throw new Error('No open shift')
    const val = Number(value)
    const normalized = Number.isFinite(val) ? val : 0
    const dbShiftId = ((cur as any).rawId as string | undefined) || cur.id
    await db.shifts.update(dbShiftId, { pettyOpening: normalized })
    await recordAudit('setStartingPetty', 'Shift', cur.id, {
        shiftId: cur.id,
        startingPetty: normalized,
    })
    return { shiftId: cur.id, startingPetty: normalized }
}

export async function addPettyCashEntryForCurrentShift(
    category: PettyCashCategory,
    amount: number,
    description: string,
    receiptUrl?: string
): Promise<PettyCashEntry> {
    const cur = await getCurrentShift()
    if (!cur) throw new Error('No open shift')
    if (!description || description.trim().length === 0) {
        throw new Error('Description is required for petty cash entries')
    }
    const id = uuid()
    const ts = Date.now()
    const raw = Number(amount) || 0
    const normalized = category === 'expense' ? -Math.abs(raw) : Math.abs(raw)
    const entry: PettyCashEntry = {
        id,
        shiftId: cur.id,
        category,
        amount: normalized,
        description: description.trim(),
        timestamp: ts,
        ...(receiptUrl ? { receiptUrl } : {}),
    }
    await recordAudit('pettyCashEntry', 'Shift', cur.id, entry)
    return entry
}

export async function listPettyCashEntriesForCurrentShift(): Promise<{
    entries: PettyCashEntry[]
    netChange: number
}> {
    const cur = await getCurrentShift()
    if (!cur) return { entries: [], netChange: 0 }
    const shiftIdVariants = Array.from(
        new Set([cur.id, ((cur as any).rawId as string | undefined) || cur.id])
    ).filter((id) => id && id.length > 0)
    const all = await db.audit_log.toArray()
    const mineRaw = all
        .filter((e) => e.action === 'pettyCashEntry')
        .map((e) => e.details as unknown as PettyCashEntry)
        .filter((d) => {
            if (!d) return false
            const id = String(d.shiftId || '')
            return shiftIdVariants.some((candidate) => candidate === id)
        })
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    const mine = mineRaw.map((p) => {
        const raw = Number(p.amount) || 0
        const normalized =
            p.category === 'expense' ? -Math.abs(raw) : Math.abs(raw)
        return { ...p, amount: normalized }
    })
    const net = mine.reduce((s, a) => s + (Number(a.amount) || 0), 0)
    return { entries: mine, netChange: net }
}

function coercePositiveInteger(value: unknown): number | null {
    const n = Number(value)
    if (!Number.isFinite(n)) return null
    const normalized = Math.floor(Math.abs(n))
    return normalized >= 0 ? normalized : null
}

function coerceTimestamp(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Date.parse(value)
        if (Number.isFinite(parsed)) return parsed
    }
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return value.getTime()
    }
    return fallback
}

function coerceNumber(value: unknown, defaultValue = 0): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : defaultValue
}

function normalizeTicketItems(
    ticketId: string,
    rawItems: unknown[]
): DbTicketItem[] {
    if (!Array.isArray(rawItems) || rawItems.length === 0) return []
    const items: DbTicketItem[] = []
    for (const raw of rawItems) {
        const name = String((raw as any)?.name ?? '').trim()
        const quantity = Number((raw as any)?.qty ?? (raw as any)?.quantity)
        if (!name || !Number.isFinite(quantity)) continue
        const price = Number((raw as any)?.price ?? 0) || 0
        items.push({
            id: uuid(),
            ticketId,
            sku: String((raw as any)?.sku ?? '').trim(),
            name,
            qty: quantity,
            price,
            addedAt: Date.now(),
            lineTotal: Number((raw as any)?.lineTotal ?? quantity * price) || 0,
            basePrice: Number((raw as any)?.basePrice ?? price) || price,
            variantKey: String((raw as any)?.variantKey ?? '').trim() || null,
        })
    }
    return items
}

export async function syncOpenTicketsFromRemote(): Promise<{
    tickets: number
    items: number
}> {
    if (typeof fetch === 'undefined') return { tickets: 0, items: 0 }
    try {
        const res = await fetch('/api/gas?action=listOpenTickets', {
            cache: 'no-store',
        })
        if (!res.ok) throw new Error(`listOpenTickets ${res.status}`)
        const payload = await res.json().catch(() => null as any)
        const rawTickets = Array.isArray(payload?.tickets)
            ? payload.tickets
            : Array.isArray(payload?.data)
              ? payload.data
              : Array.isArray(payload)
                ? payload
                : []
        const normalizedTickets: DbTicket[] = []
        const normalizedItems: DbTicketItem[] = []
        const seenTicketIds = new Set<string>()
        const now = Date.now()

        for (const raw of rawTickets) {
            const idSource =
                (raw as any)?.ticketId ??
                (raw as any)?.id ??
                (raw as any)?.ticket_id ??
                ''
            const ticketId = String(idSource || '').trim()
            if (!ticketId) continue
            if (seenTicketIds.has(ticketId)) continue
            seenTicketIds.add(ticketId)
            const nameSource =
                (raw as any)?.ticketName ??
                (raw as any)?.name ??
                (raw as any)?.ticket_number ??
                ''
            const ticketName = String(nameSource || '').trim()
            const openedAtRaw =
                (raw as any)?.openedAt ??
                (raw as any)?.opened_at ??
                (raw as any)?.opened ??
                now
            const openedAt = coerceTimestamp(openedAtRaw, now)
            const openedBy = String((raw as any)?.openedBy ?? '').trim()
            const covers = coercePositiveInteger((raw as any)?.covers)
            const notesRaw = (raw as any)?.notes
            const notes =
                typeof notesRaw === 'string'
                    ? notesRaw.trim() || null
                    : (notesRaw ?? null)
            const payAmount = coerceNumber((raw as any)?.payAmount, NaN)
            const payMethodRaw = String(
                (raw as any)?.payMethod ?? (raw as any)?.paymentMethod ?? ''
            ).trim()
            const payMethodLower = payMethodRaw.toLowerCase()
            let payMethod: PayMethod | null = null
            if (payMethodLower === 'cash' || payMethodLower === 'card') {
                payMethod = payMethodLower as PayMethod
            } else if (payMethodLower === 'promptpay') {
                payMethod = 'promptPay'
            }
            const taxRateValue = Number((raw as any)?.taxRate)
            const taxAmountValue = Number((raw as any)?.taxAmount)
            const subtotalValue = Number((raw as any)?.subtotal)
            const totalValue = Number((raw as any)?.total)
            const dbTicket: DbTicket = {
                id: ticketId,
                name: ticketName || ticketId.split('-').pop() || ticketId,
                openedBy,
                openedAt,
                openedAtIso: new Date(openedAt).toISOString(),
                status: 'open',
                closedAt: null,
                closedBy: null,
                payMethod,
                payAmount: Number.isFinite(payAmount) ? payAmount : null,
                payReference: null,
                notes,
                covers: covers ?? null,
                taxRate: Number.isFinite(taxRateValue) ? taxRateValue : null,
                taxAmount: Number.isFinite(taxAmountValue)
                    ? taxAmountValue
                    : null,
                subtotal: Number.isFinite(subtotalValue) ? subtotalValue : null,
                total: Number.isFinite(totalValue) ? totalValue : null,
            }
            normalizedTickets.push(dbTicket)
            const rawItems = Array.isArray((raw as any)?.items)
                ? ((raw as any)?.items as unknown[])
                : []
            const ticketItems = normalizeTicketItems(ticketId, rawItems)
            normalizedItems.push(...ticketItems)
        }

        await db.transaction(
            'readwrite',
            db.tickets,
            db.ticket_items,
            async () => {
                const openIds = (await db.tickets
                    .filter((t) => (t.status ?? 'open') === 'open')
                    .primaryKeys()) as string[]
                if (openIds.length) {
                    await db.tickets.bulkDelete(openIds)
                    await db.ticket_items
                        .where('ticketId')
                        .anyOf(openIds)
                        .delete()
                }
                if (normalizedTickets.length) {
                    await db.tickets.bulkPut(normalizedTickets)
                }
                if (normalizedItems.length) {
                    await db.ticket_items.bulkPut(normalizedItems)
                }
            }
        )
        return {
            tickets: normalizedTickets.length,
            items: normalizedItems.length,
        }
    } catch (error) {
        console.warn('syncOpenTicketsFromRemote failed', error)
        return { tickets: 0, items: 0 }
    }
}

export async function syncCurrentShiftFromRemote(): Promise<
    (ShiftRecord & { rawId?: string }) | null
> {
    if (typeof fetch === 'undefined') return null
    const now = Date.now()
    let summaryOpen: any = null
    try {
        const summaryRes = await fetch('/api/gas?action=shiftSummary', {
            cache: 'no-store',
        })
        if (summaryRes.ok) {
            const summaryPayload = await summaryRes
                .json()
                .catch(() => null as any)
            if (summaryPayload && summaryPayload.open) {
                summaryOpen = summaryPayload.open
                if (typeof window !== 'undefined') {
                    try {
                        const tenantCookie = readCookie('tenantId')
                        const summaryKey = tenantCookie
                            ? `pos.cache.shiftSummary:${tenantCookie}`
                            : 'pos.cache.shiftSummary'
                        window.localStorage.setItem(
                            summaryKey,
                            JSON.stringify({
                                fetchedAt: Date.now(),
                                summary: summaryPayload.open,
                            })
                        )
                    } catch {}
                }
            }
        }
    } catch (err) {
        console.warn('syncCurrentShiftFromRemote summary failed', err)
    }

    try {
        const res = await fetch('/api/gas?action=getCurrentShift', {
            cache: 'no-store',
        })
        const shiftPayload = await res.json().catch(() => null as any)
        const rawShift =
            (shiftPayload && shiftPayload.shift) || shiftPayload || null
        const shiftIdRaw = String(
            rawShift?.shiftId ?? rawShift?.id ?? rawShift?.shift_id ?? ''
        ).trim()
        let normalizedShiftId = shiftIdRaw
        if (normalizedShiftId) {
            normalizedShiftId =
                normalizeShiftId(normalizedShiftId) || normalizedShiftId
        }
        if (!normalizedShiftId) {
            await db.shifts
                .filter((s) => (s.status ?? 'open') === 'open')
                .modify((entry) => {
                    entry.status = 'closed'
                    entry.closedAt = entry.closedAt ?? now
                })
            return null
        }
        const openedAt = coerceTimestamp(
            rawShift?.openedAt ?? rawShift?.opened_at ?? rawShift?.opened,
            now
        )
        const closedAtRaw =
            rawShift?.closedAt ?? rawShift?.closed_at ?? rawShift?.closed
        const closedAt =
            closedAtRaw != null ? coerceTimestamp(closedAtRaw, now) : null
        const record: ShiftRecord = {
            id: normalizedShiftId,
            openedAt,
            openedBy:
                rawShift?.openedBy ??
                rawShift?.opened_by ??
                rawShift?.actor ??
                null,
            closedAt,
            closedBy: rawShift?.closedBy ?? rawShift?.closed_by ?? null,
            status: 'open',
            cashSales: coerceNumber(
                summaryOpen?.cashSales ?? rawShift?.cashSales,
                0
            ),
            cardSales: coerceNumber(
                summaryOpen?.cardSales ?? rawShift?.cardSales,
                0
            ),
            promptPaySales: coerceNumber(
                summaryOpen?.promptPaySales ?? rawShift?.promptPaySales,
                0
            ),
            ticketsCount: coerceNumber(
                summaryOpen?.ticketsCount ?? rawShift?.ticketsCount,
                0
            ),
            itemsSoldJson: summaryOpen?.itemsSold
                ? JSON.stringify(summaryOpen.itemsSold)
                : (rawShift?.itemsSoldJson ?? null),
            notes: typeof rawShift?.notes === 'string' ? rawShift.notes : null,
            floatOpening:
                rawShift?.floatOpening != null
                    ? Number(rawShift.floatOpening) || 0
                    : undefined,
            floatClosing:
                rawShift?.floatClosing != null
                    ? Number(rawShift.floatClosing) || null
                    : undefined,
            floatWithdrawn:
                rawShift?.floatWithdrawn != null
                    ? Number(rawShift.floatWithdrawn) || 0
                    : undefined,
            pettyOpening:
                rawShift?.pettyOpening != null
                    ? Number(rawShift.pettyOpening) || 0
                    : undefined,
            pettyClosing:
                rawShift?.pettyClosing != null
                    ? Number(rawShift.pettyClosing) || null
                    : undefined,
            pettyWithdrawn:
                rawShift?.pettyWithdrawn != null
                    ? Number(rawShift.pettyWithdrawn) || 0
                    : undefined,
        }

        await db.transaction('readwrite', db.shifts, async () => {
            await db.shifts
                .filter(
                    (s) =>
                        (s.status ?? 'open') === 'open' &&
                        s.id !== normalizedShiftId
                )
                .modify((entry) => {
                    entry.status = 'closed'
                    entry.closedAt = entry.closedAt ?? now
                })
            await db.shifts.put(record)
        })
        rememberLastShiftId(normalizedShiftId)
        return Object.assign({}, record, { rawId: shiftIdRaw })
    } catch (error) {
        console.warn('syncCurrentShiftFromRemote failed', error)
        return null
    }
}
