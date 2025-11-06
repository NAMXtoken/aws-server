'use client'

import { db } from '@/lib/db'
import { exportCsv as exportQueueCsv } from '@/lib/sync-queue'
import type { UnitRow, RestockRecord, AuditLogEntry, MenuRow } from '@/types/db'

function toCsv<T extends Record<string, any>>(
    rows: T[],
    columns: (keyof T)[]
): string {
    const header = columns.map(String).join(',')
    const esc = (v: unknown) => {
        if (v === undefined || v === null) return ''
        const s = String(v)
        if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
        return s
    }
    const body = rows.map((r) =>
        columns.map((c) => esc((r as any)[c])).join(',')
    )
    return [header, ...body].join('\n')
}

const iso = (value?: number | null): string => {
    if (!value) return ''
    try {
        return new Date(value).toISOString()
    } catch {
        return ''
    }
}

const isoDate = (value?: number | null): string => {
    if (!value) return ''
    try {
        return new Date(value).toISOString().slice(0, 10)
    } catch {
        return ''
    }
}

export async function exportTicketsCsv(): Promise<string> {
    const rows = await db.tickets.toArray()
    const formatted = rows.map((t) => ({
        ticketId: t.id,
        ticketName: t.name,
        openedBy: t.openedBy ?? '',
        openedAt: iso(t.openedAt),
        status: t.status,
        price: Number(t.payAmount ?? 0).toFixed(2),
        date: isoDate(t.openedAt),
        pay: t.payMethod ?? '',
        closedAt: iso(t.closedAt ?? null),
    }))
    return toCsv(formatted, [
        'ticketId',
        'ticketName',
        'openedBy',
        'openedAt',
        'status',
        'price',
        'date',
        'pay',
        'closedAt',
    ])
}

export async function exportTicketItemsCsv(): Promise<string> {
    const rows = await db.ticket_items.toArray()
    const formatted = rows.map((r) => ({
        ticketId: r.ticketId,
        itemName: r.name,
        qty: r.qty,
        price: r.price,
        lineTotal: r.lineTotal ?? r.qty * r.price,
    }))
    return toCsv(formatted, [
        'ticketId',
        'itemName',
        'qty',
        'price',
        'lineTotal',
    ])
}

export async function exportInventoryEventsCsv(): Promise<string> {
    const rows = await db.inventory_events.toArray()
    const formatted = rows.map((r) => ({
        id: r.id,
        sku: r.sku,
        type: r.type,
        deltaUnits: r.deltaUnits,
        createdAt: iso(r.createdAt),
        actor: r.actor ?? '',
    }))
    return toCsv(formatted, [
        'id',
        'sku',
        'type',
        'deltaUnits',
        'createdAt',
        'actor',
    ])
}

export async function exportShiftsCsv(): Promise<string> {
    const rows = await db.shifts.toArray()
    const formatted = rows.map((r) => ({
        shiftId: r.id,
        openedAt: iso(r.openedAt),
        openedBy: r.openedBy ?? '',
        closedAt: iso(r.closedAt ?? null),
        closedBy: r.closedBy ?? '',
        status: r.status,
        cashSales: Number(r.cashSales ?? 0),
        cardSales: Number(r.cardSales ?? 0),
        promptPaySales: Number(r.promptPaySales ?? 0),
        ticketsCount: Number(r.ticketsCount ?? 0),
        itemsSoldJson: r.itemsSoldJson ?? '',
        notes: r.notes ?? '',
    }))
    return toCsv(formatted, [
        'shiftId',
        'openedAt',
        'openedBy',
        'closedAt',
        'closedBy',
        'status',
        'cashSales',
        'cardSales',
        'promptPaySales',
        'ticketsCount',
        'itemsSoldJson',
        'notes',
    ])
}

export async function exportUnitsCsv(): Promise<string> {
    const rows = await db.units.toArray()
    const formatted = rows.map((r: UnitRow) => ({
        id: r.id,
        unit: r.unit,
        package: r.package,
        unitsPerPackage: r.unitsPerPackage,
        updatedAt: iso(r.updatedAt ?? null),
    }))
    return toCsv(formatted, [
        'id',
        'unit',
        'package',
        'unitsPerPackage',
        'updatedAt',
    ])
}

export async function exportRestockCsv(): Promise<string> {
    const rows = await db.restock_records.orderBy('timestamp').toArray()
    const formatted = rows.map((r: RestockRecord) => ({
        timestamp: iso(r.timestamp),
        id: r.itemId,
        unit: r.unit,
        package: r.package,
        unitsPerPackage: r.unitsPerPackage,
        packages: r.packages,
        extraUnits: r.extraUnits,
        totalUnits: r.totalUnits,
        actor: r.actor ?? '',
        notes: r.notes ?? '',
    }))
    return toCsv(formatted, [
        'timestamp',
        'id',
        'unit',
        'package',
        'unitsPerPackage',
        'packages',
        'extraUnits',
        'totalUnits',
        'actor',
        'notes',
    ])
}

export async function exportAuditLogCsv(): Promise<string> {
    const rows = await db.audit_log.orderBy('timestamp').toArray()
    const formatted = rows.map((r: AuditLogEntry) => ({
        Timestamp: iso(r.timestamp),
        Action: r.action,
        Actor: r.actor ?? '',
        Entity: r.entity ?? '',
        EntityId: r.entityId ?? '',
        DetailsJSON: JSON.stringify(r.details ?? {}),
    }))
    return toCsv(formatted, [
        'Timestamp',
        'Action',
        'Actor',
        'Entity',
        'EntityId',
        'DetailsJSON',
    ])
}

export async function exportInventorySalesCsv(): Promise<string> {
    const items = await db.ticket_items.toArray()
    if (items.length === 0) {
        return toCsv(
            [],
            [
                'item',
                'price',
                'openingStock',
                'deliveries',
                'sales',
                'netChange',
                'closingStock',
                'stockTake',
                'difference',
                'id',
            ]
        )
    }
    const menuRows = await db.menu_items.toArray()
    const menuMap = new Map<string, MenuRow>()
    for (const m of menuRows) menuMap.set(m.id, m)
    const summary = new Map<
        string,
        { item: string; price: number; sales: number; id: string }
    >()
    for (const row of items) {
        const key = row.sku || row.name
        const existing = summary.get(key)
        const menu = row.sku ? menuMap.get(row.sku) : undefined
        const name = menu?.name ?? row.name
        const price = menu?.price ?? row.price
        if (existing) {
            existing.sales += row.qty
            existing.price = price
        } else {
            summary.set(key, {
                item: name,
                price,
                sales: row.qty,
                id: row.sku || key,
            })
        }
    }
    const formatted = Array.from(summary.values()).map((entry) => ({
        item: entry.item,
        price: Number(entry.price ?? 0),
        openingStock: '',
        deliveries: '',
        sales: Number(entry.sales ?? 0),
        netChange: '',
        closingStock: '',
        stockTake: '',
        difference: '',
        id: entry.id,
    }))
    return toCsv(formatted, [
        'item',
        'price',
        'openingStock',
        'deliveries',
        'sales',
        'netChange',
        'closingStock',
        'stockTake',
        'difference',
        'id',
    ])
}

export async function exportAllCsvs(): Promise<Record<string, string>> {
    const [
        tickets,
        items,
        shifts,
        units,
        restocks,
        audit,
        inventorySales,
        inventoryEvents,
    ] = await Promise.all([
        exportTicketsCsv(),
        exportTicketItemsCsv(),
        exportShiftsCsv(),
        exportUnitsCsv(),
        exportRestockCsv(),
        exportAuditLogCsv(),
        exportInventorySalesCsv(),
        exportInventoryEventsCsv(),
    ])
    const date = new Date()
    const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const out: Record<string, string> = {
        [`tickets_${stamp}.csv`]: tickets,
        [`ticket_items_${stamp}.csv`]: items,
        [`shifts_${stamp}.csv`]: shifts,
        [`units_${stamp}.csv`]: units,
        [`restock_${stamp}.csv`]: restocks,
        [`audit_log_${stamp}.csv`]: audit,
        [`inventory_sales_${stamp}.csv`]: inventorySales,
        [`inventory_events_${stamp}.csv`]: inventoryEvents,
    }
    if (
        [
            tickets,
            items,
            shifts,
            units,
            restocks,
            audit,
            inventorySales,
            inventoryEvents,
        ].every((s) => s.split('\n').length <= 1)
    ) {
        const queueCsv = await exportQueueCsv()
        out[`sync_queue_${stamp}.csv`] = queueCsv
    }
    return out
}

export function csvToBase64(csv: string): string {
    return btoa(unescape(encodeURIComponent(csv)))
}
