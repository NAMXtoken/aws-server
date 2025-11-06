import { headers } from 'next/headers'
import 'server-only'

import type { DailySalesSummaryResponse } from '@/lib/reports-client'

type ShiftItem = { name: string; qty: number }

export type ShiftSummary = {
    ok: true
    open: {
        cashSales: number
        cardSales: number
        promptPaySales: number
        ticketsCount: number
        itemsSold: ShiftItem[]
    } | null
}

export type InventorySnapshot = {
    ok: true
    rows: Array<{
        id: string
        closingStock: number
        package?: string
        packageUnits?: string
        packageVolume?: number
        addedStock?: number
    }>
    menuAvailability?: Array<{
        id: string
        name: string
        available: number
        limitingIngredient?: string | null
        ingredients: Array<{
            name: string
            required: number
            available: number
            stock: number
        }>
    }>
}

export type MenuItem = {
    id: string
    name: string
    price?: number
    category?: string
}

export type SalesByMonth = {
    ok: true
    year: number
    months: Array<{
        month: number
        total: number
        cash: number
        card: number
        promptpay: number
        count: number
    }>
}

export type SalesByDay = {
    ok: true
    year: number
    month: number
    days: Array<{
        date: string
        total: number
        cash: number
        card: number
        promptpay: number
        count: number
    }>
}

export type TopItemsByMonth = {
    ok: true
    year: number
    month: number
    items: Array<{ name: string; qty: number }>
}

export async function fetchShiftSummary(
    baseUrl?: string
): Promise<ShiftSummary> {
    const origin = await resolveBaseUrl(baseUrl)
    const res = await fetch(`${origin}/api/gas?action=shiftSummary`)
    if (!res.ok) return { ok: true, open: null }
    const data = (await res.json()) as ShiftSummary
    return data
}

export async function fetchDailySalesSummaryReport(
    year?: number,
    month?: number,
    baseUrl?: string
): Promise<DailySalesSummaryResponse> {
    const origin = await resolveBaseUrl(baseUrl)
    const params = new URLSearchParams({ action: 'dailySalesSummary' })
    if (typeof year === 'number' && !isNaN(year)) {
        params.set('year', String(year))
    }
    if (typeof month === 'number' && !isNaN(month)) {
        params.set('month', String(month))
    }
    const res = await fetch(`${origin}/api/gas?${params.toString()}`)
    if (!res.ok) {
        let payload: unknown = null
        try {
            payload = await res.json()
        } catch {
            payload = null
        }
        const fallbackYear = year ?? new Date().getFullYear()
        const fallbackMonth = month ?? new Date().getMonth() + 1
        const errorMessage =
            (payload &&
            typeof payload === 'object' &&
            payload !== null &&
            'error' in payload &&
            typeof (payload as { error?: unknown }).error === 'string'
                ? (payload as { error: string }).error
                : payload &&
                    typeof payload === 'object' &&
                    payload !== null &&
                    'message' in payload &&
                    typeof (payload as { message?: unknown }).message ===
                        'string'
                  ? (payload as { message: string }).message
                  : undefined) || `Request failed with status ${res.status}`
        const needsTenantContext =
            typeof errorMessage === 'string' &&
            errorMessage.toLowerCase().includes('tenant context')
        return {
            ok: false,
            year: fallbackYear,
            month: fallbackMonth,
            monthName: '',
            days: [],
            error: errorMessage,
            needsTenantContext,
        }
    }
    return (await res.json()) as DailySalesSummaryResponse
}

export async function fetchInventorySnapshot(
    baseUrl?: string
): Promise<InventorySnapshot> {
    const origin = await resolveBaseUrl(baseUrl)
    const res = await fetch(`${origin}/api/gas?action=inventorySnapshot`)
    if (!res.ok) return { ok: true, rows: [] }
    const data = (await res.json()) as InventorySnapshot
    return data
}

export async function fetchMenu(baseUrl?: string): Promise<MenuItem[]> {
    const origin = await resolveBaseUrl(baseUrl)
    const res = await fetch(`${origin}/api/gas?action=menu`, {
        cache: 'force-cache',
        next: { revalidate: 60 },
    })
    if (!res.ok) return []
    try {
        const arr = (await res.json()) as any[]
        // Normalize common sheet columns
        return (arr || []).map((r) => ({
            id: String(r.id ?? r.sku ?? r.code ?? ''),
            name: String(r.name ?? r.title ?? r.item ?? ''),
            price: Number(r.price ?? r.unitPrice ?? 0) || undefined,
            category: r.category ? String(r.category) : undefined,
        }))
    } catch {
        return []
    }
}

export async function fetchSalesByMonth(
    year?: number,
    baseUrl?: string
): Promise<SalesByMonth> {
    const origin = await resolveBaseUrl(baseUrl)
    const y = year ?? new Date().getFullYear()
    const res = await fetch(`${origin}/api/gas?action=salesByMonth&year=${y}`)
    if (!res.ok) return { ok: true, year: y, months: [] as any }
    return (await res.json()) as SalesByMonth
}

export async function fetchSalesByDay(
    year: number,
    month: number,
    baseUrl?: string
): Promise<SalesByDay> {
    const origin = await resolveBaseUrl(baseUrl)
    const res = await fetch(
        `${origin}/api/gas?action=salesByDay&year=${year}&month=${month}`
    )
    if (!res.ok) return { ok: true, year, month, days: [] }
    return (await res.json()) as SalesByDay
}

export async function fetchTopItemsByMonth(
    year: number,
    month: number,
    baseUrl?: string
): Promise<TopItemsByMonth> {
    const origin = await resolveBaseUrl(baseUrl)
    const res = await fetch(
        `${origin}/api/gas?action=topItemsByMonth&year=${year}&month=${month}`
    )
    if (!res.ok) return { ok: true, year, month, items: [] }
    return (await res.json()) as TopItemsByMonth
}

async function resolveBaseUrl(provided?: string): Promise<string> {
    if (provided && provided.trim().length > 0) return provided.trim()
    try {
        const h = await headers()
        const proto = h.get('x-forwarded-proto') || 'http'
        const host = h.get('x-forwarded-host') || h.get('host')
        if (host) return `${proto}://${host}`
    } catch {}
    return (
        process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://bynd-pos.vercel.app'
    )
}
