import { isTenantUuid, tenantSlugToSupabaseId } from '@/lib/tenant-ids'

import {
    SUPABASE_SERVICE_AVAILABLE,
    SUPABASE_SERVICE_ROLE_KEY,
} from './env'
import { getSupabaseServiceRoleClient } from './server'
import type { Database, Json } from './types'

type TenantContext = {
    tenantId: string | null
    supabaseTenantId: string | null
}

type GasPayload = {
    action?: unknown
    [key: string]: unknown
}

const toNumber = (value: unknown): number | null => {
    if (value === null || value === undefined) return null
    if (typeof value === 'number' && Number.isFinite(value)) return value
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

const toInt = (value: unknown): number | null => {
    const num = toNumber(value)
    return num !== null ? Math.trunc(num) : null
}

const toIsoString = (input: unknown): string | null => {
    if (!input && input !== 0) return null
    if (typeof input === 'string') {
        const trimmed = input.trim()
        if (!trimmed) return null
        if (trimmed.includes('T')) return trimmed
        const parsed = Number(trimmed)
        if (Number.isFinite(parsed)) return new Date(parsed).toISOString()
        const date = new Date(trimmed)
        if (!isNaN(date.valueOf())) return date.toISOString()
        return null
    }
    if (typeof input === 'number' && Number.isFinite(input)) {
        return new Date(input).toISOString()
    }
    if (input instanceof Date && !isNaN(input.valueOf())) {
        return input.toISOString()
    }
    return null
}

const eventDateFromIso = (iso: string | null): string => {
    if (!iso) return new Date().toISOString().slice(0, 10)
    return iso.slice(0, 10)
}

const safeJson = (value: unknown): Json | null => {
    if (value === null || value === undefined) return null
    try {
        return JSON.parse(JSON.stringify(value)) as Json
    } catch {
        return null
    }
}

async function resolveTenantSupabaseId(
    tenant: TenantContext
): Promise<string | null> {
    if (tenant.supabaseTenantId) {
        const trimmed = tenant.supabaseTenantId.trim()
        if (isTenantUuid(trimmed)) return trimmed
    }
    if (tenant.tenantId) {
        try {
            return await tenantSlugToSupabaseId(tenant.tenantId)
        } catch {
            return null
        }
    }
    return null
}

type DailyEventsInsert =
    Database['public']['Tables']['daily_events']['Insert']
type ShiftSummaryInsert =
    Database['public']['Tables']['shift_summaries']['Insert']

function normalizeActor(value: unknown): string | null {
    if (!value) return null
    const str = String(value).trim()
    return str.length ? str : null
}

function normalizePaymentMethod(value: unknown): string | null {
    if (!value) return null
    const str = String(value).trim()
    return str.length ? str.toLowerCase() : null
}

function computeItemsSoldCount(items: unknown): number | null {
    if (!Array.isArray(items)) return null
    let total = 0
    for (const entry of items) {
        const qty =
            typeof entry === 'object' && entry !== null
                ? toNumber(
                      (entry as { qty?: unknown; quantity?: unknown }).qty ??
                          (entry as { quantity?: unknown }).quantity
                  )
                : null
        if (qty !== null) total += qty
    }
    return total
}

async function handleRecordTicket(
    payload: Record<string, unknown>,
    tenantId: string
) {
    const supabase = getSupabaseServiceRoleClient()
    const actionRaw = String(
        (payload.eventAction ?? payload.action ?? '').toString()
    ).trim()
    const action =
        actionRaw.length > 0
            ? actionRaw
            : payload.pay || payload.paymentMethod
              ? 'ticket.pay'
              : 'ticket.snapshot'
    const closedAt =
        toIsoString(payload.closedAt) ??
        toIsoString((payload.meta as Record<string, unknown> | undefined)?.closedAt) ??
        null
    const openedAt =
        toIsoString(payload.openedAt) ??
        toIsoString((payload.meta as Record<string, unknown> | undefined)?.openedAt) ??
        null
    const occurredAt = closedAt || openedAt || new Date().toISOString()
    const eventDate = eventDateFromIso(occurredAt)
    const meta =
        (payload.meta && typeof payload.meta === 'object'
            ? (payload.meta as Record<string, unknown>)
            : null) ?? {}
    const totalAmount =
        toNumber(meta.total) ?? toNumber(payload.price) ?? toNumber(payload.amount)
    const subtotalAmount = toNumber(meta.subtotal)
    const taxAmount =
        toNumber(meta.taxAmount) ??
        toNumber(meta.tax) ??
        toNumber(payload.taxAmount)
    const tipsAmount =
        toNumber(meta.tips) ??
        toNumber(payload.tips) ??
        toNumber(payload.tip)
    const surchargeAmount =
        toNumber(meta.surcharge) ??
        toNumber(meta.surcharges) ??
        toNumber(payload.surcharge) ??
        toNumber(payload.surcharges)
    const refundAmount =
        action === 'ticket.refund'
            ? totalAmount
            : toNumber(meta.refundAmount) ?? toNumber(payload.refundAmount)
    const voidAmount =
        toNumber(meta.voidedAmount) ?? toNumber(payload.voidedAmount)
    const itemsArray =
        Array.isArray(payload.items) && payload.items.length
            ? payload.items
            : null
    const itemsSold = computeItemsSoldCount(itemsArray)
    const ticketsDelta =
        action === 'ticket.pay'
            ? 1
            : action === 'ticket.refund'
              ? -1
              : null

    const insert: DailyEventsInsert = {
        tenant_id: tenantId,
        ticket_id: payload.ticketId
            ? String(payload.ticketId)
            : payload.ticketName
              ? String(payload.ticketName)
              : null,
        event_action: action,
        event_date: eventDate,
        occurred_at: occurredAt,
        actor: normalizeActor(payload.actor),
        payment_method:
            normalizePaymentMethod(payload.pay) ??
            normalizePaymentMethod(payload.paymentMethod),
        total_amount: totalAmount,
        subtotal_amount: subtotalAmount,
        tax_amount: taxAmount,
        tips_amount: tipsAmount,
        surcharge_amount: surchargeAmount,
        refund_amount: refundAmount,
        void_amount: voidAmount,
        items_sold: itemsSold,
        tickets_delta: ticketsDelta,
        metadata: safeJson(meta),
        payload: safeJson(payload),
    }

    const { error } = await supabase.from('daily_events').insert(insert)
    if (error) {
        console.error('Supabase daily_events insert failed', error)
    }
}

async function handleRecordShift(
    payload: Record<string, unknown>,
    tenantId: string
) {
    const supabase = getSupabaseServiceRoleClient()
    const itemsSoldJson = (() => {
        const raw = payload.itemsSoldJson
        if (typeof raw === 'string' && raw.trim().length) {
            try {
                return JSON.parse(raw) as unknown
            } catch {
                return null
            }
        }
        if (Array.isArray(payload.itemsSold)) {
            return payload.itemsSold
        }
        return null
    })()
    const itemsCount =
        toNumber(payload.itemsCount) ?? computeItemsSoldCount(itemsSoldJson)
    const openedAt =
        toIsoString(payload.openedAt) ??
        toIsoString((payload.meta as Record<string, unknown> | undefined)?.openedAt)
    const closedAt =
        toIsoString(payload.closedAt) ??
        toIsoString((payload.meta as Record<string, unknown> | undefined)?.closedAt)
    const metadata =
        (payload.meta && typeof payload.meta === 'object'
            ? payload.meta
            : null) ?? {}
    const nowIso = new Date().toISOString()
    const insert: ShiftSummaryInsert = {
        tenant_id: tenantId,
        shift_id: String(payload.shiftId ?? payload.id ?? ''),
        opened_at: openedAt,
        closed_at: closedAt,
        opened_by: normalizeActor(payload.openedBy),
        closed_by: normalizeActor(payload.closedBy),
        cash_sales: toNumber(payload.cashSales),
        card_sales: toNumber(payload.cardSales),
        promptpay_sales: toNumber(payload.promptPaySales),
        tickets_count: toInt(payload.ticketsCount),
        items_count: itemsCount,
        notes:
            payload.notes && String(payload.notes).trim().length
                ? String(payload.notes).trim()
                : null,
        items_sold: safeJson(itemsSoldJson),
        metadata: safeJson(metadata),
        created_at: closedAt ?? openedAt ?? nowIso,
        updated_at: nowIso,
    }

    const { error } = await supabase
        .from('shift_summaries')
        .upsert(insert, { onConflict: 'tenant_id,shift_id' })
    if (error) {
        console.error('Supabase shift_summaries upsert failed', error)
    }
}

async function processPayloadForTenant(
    payload: GasPayload,
    tenantId: string
) {
    if (!payload || typeof payload !== 'object') return
    const actionRaw = payload.action
    const action =
        typeof actionRaw === 'string' ? actionRaw.trim() : String(actionRaw || '')
    if (!action) return

    if (action === 'bulkImport') {
        const items = Array.isArray(payload.items)
            ? (payload.items as Array<Record<string, unknown>>)
            : []
        for (const item of items) {
            if (!item || typeof item !== 'object') continue
            const itemAction = item.action
            const normalizedAction =
                typeof itemAction === 'string'
                    ? itemAction.trim()
                    : String(itemAction || '')
            if (!normalizedAction) continue
            const mergedPayload =
                item.payload && typeof item.payload === 'object'
                    ? {
                          action: normalizedAction,
                          ...(item.payload as Record<string, unknown>),
                      }
                    : {
                          action: normalizedAction,
                          value: item.payload ?? null,
                      }
            try {
                await processPayloadForTenant(mergedPayload, tenantId)
            } catch (error) {
                console.error('Supabase bulk import sync failed', error)
            }
        }
        return
    }

    if (action === 'recordTicket') {
        await handleRecordTicket(
            payload as Record<string, unknown>,
            tenantId
        )
        return
    }

    if (action === 'recordShift') {
        await handleRecordShift(
            payload as Record<string, unknown>,
            tenantId
        )
        return
    }
}

export async function replicateGasPayloadToSupabase(
    payload: GasPayload,
    tenant: TenantContext
) {
    if (!SUPABASE_SERVICE_AVAILABLE || !SUPABASE_SERVICE_ROLE_KEY) {
        return
    }
    const tenantSupabaseId = await resolveTenantSupabaseId(tenant)
    if (!tenantSupabaseId) return
    try {
        await processPayloadForTenant(payload, tenantSupabaseId)
    } catch (error) {
        console.error('Supabase replication failed', error)
    }
}
