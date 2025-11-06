'use client'

import { db, uuid } from '@/lib/db'
import { getSessionActor } from '@/lib/session'
import { SyncQueue } from '@/lib/sync-queue'
import type { InventoryItem } from '@/types/db'
import type { MenuRow, RestockRecord, UnitRow } from '@/types/db'

async function recordAudit(
    action: string,
    entity: string,
    entityId: string,
    details: Record<string, unknown>,
    actor?: string | null
) {
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

const RESTOCK_ACTION = 'recordRestock'

const toNumber = (value: unknown): number => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

async function persistRestockRemote(
    record: RestockRecord,
    itemName: string
): Promise<void> {
    if (typeof fetch === 'undefined') return
    const payload = {
        id: record.id,
        itemId: record.itemId,
        itemName,
        timestamp: record.timestamp,
        unit: record.unit,
        package: record.package,
        unitsPerPackage: record.unitsPerPackage,
        packages: record.packages,
        extraUnits: record.extraUnits,
        totalUnits: record.totalUnits,
        actor: record.actor ?? null,
        notes: record.notes ?? null,
    }
    try {
        const res = await fetch('/api/gas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: RESTOCK_ACTION, ...payload }),
        })
        if (!res.ok) throw new Error(`restock remote failed: ${res.status}`)
        // do not parse body eagerly; success acknowledged
    } catch (error) {
        try {
            await SyncQueue.enqueue({
                action: RESTOCK_ACTION,
                payload,
                ts: record.timestamp,
            })
        } catch (queueErr) {
            console.warn('Failed to queue restock for sync', queueErr)
        }
    }
}

const normalizeRestockRecord = (input: any): RestockRecord | null => {
    const id = String(input?.id ?? input?.restockId ?? '').trim()
    const itemId = String(input?.itemId ?? '').trim()
    if (!id || !itemId) return null
    return {
        id,
        itemId,
        timestamp: toNumber(input?.timestamp ?? Date.now()),
        unit: String(input?.unit ?? '').trim(),
        package: String(input?.package ?? '').trim(),
        unitsPerPackage: toNumber(input?.unitsPerPackage ?? 0),
        packages: toNumber(input?.packages ?? 0),
        extraUnits: toNumber(input?.extraUnits ?? 0),
        totalUnits: toNumber(input?.totalUnits ?? 0),
        actor: input?.actor ? String(input.actor).trim() : null,
        notes: input?.notes ? String(input.notes).trim() : null,
    }
}

export async function listUnits(): Promise<UnitRow[]> {
    return db.units.toArray()
}

export async function listInventoryItems(): Promise<InventoryItem[]> {
    return db.inventory_items.toArray()
}

export async function getInventoryItemLocal(
    id: string
): Promise<InventoryItem | undefined> {
    return db.inventory_items.get(id)
}

export async function syncUnitsFromRemote(rows: UnitRow[]): Promise<void> {
    if (!Array.isArray(rows) || rows.length === 0) return
    const existing = await db.units.toArray()
    const existingMap = new Map(existing.map((row) => [row.id, row]))
    const updates: UnitRow[] = []
    for (const row of rows) {
        if (!row.id) continue
        const current = existingMap.get(row.id)
        const incomingUpdatedAt = Number(row.updatedAt ?? 0) || 0
        const currentUpdatedAt = Number(current?.updatedAt ?? 0) || 0
        if (!current || incomingUpdatedAt >= currentUpdatedAt) {
            updates.push({
                ...row,
                updatedAt: incomingUpdatedAt || currentUpdatedAt,
            })
        }
    }
    if (updates.length) await db.units.bulkPut(updates)
}

export async function syncUnitsFromMenuRows(rows: MenuRow[]): Promise<void> {
    if (!Array.isArray(rows) || rows.length === 0) return
    const units: UnitRow[] = rows
        .map((row) => ({
            id: String(row.id || '').trim(),
            unit: String(row.consumeUnit || '').trim(),
            package: String(row.purchasedUnit || '').trim(),
            unitsPerPackage: Number(row.volume || 0) || 0,
            updatedAt:
                Number(row.unitsUpdatedAt ?? row.updatedAt ?? Date.now()) || 0,
        }))
        .filter((row: UnitRow) => row.id.length > 0)
    if (!units.length) return
    await syncUnitsFromRemote(units)
}

export async function refreshUnitsFromRemote(): Promise<number> {
    if (typeof fetch === 'undefined') return 0
    try {
        const res = await fetch('/api/gas?action=inventoryUnits', {
            cache: 'no-store',
        })
        if (!res.ok) throw new Error(`units fetch failed: ${res.status}`)
        const data = await res.json().catch(() => ({}))
        const rows = Array.isArray(data?.items) ? data.items : []
        const units: UnitRow[] = rows
            .map((row: any) => ({
                id: String(row?.id ?? '').trim(),
                unit: String(row?.unit ?? '').trim(),
                package: String(row?.package ?? '').trim(),
                unitsPerPackage: Number(row?.unitsPerPackage ?? 0) || 0,
                updatedAt: Number(row?.updatedAt ?? 0) || Date.now(),
            }))
            .filter((row: UnitRow) => row.id.length > 0)
        if (units.length) await syncUnitsFromRemote(units)
        return units.length
    } catch (error) {
        console.warn('Failed to refresh inventory units', error)
        return 0
    }
}

export async function upsertUnitLocal(
    input: {
        id: string
        unit: string
        package: string
        unitsPerPackage: number
    },
    actor?: string
): Promise<UnitRow> {
    const now = Date.now()
    const row: UnitRow = { ...input, updatedAt: now }
    const performer =
        actor && actor.trim().length > 0 ? actor.trim() : getSessionActor()
    await db.transaction('readwrite', db.units, db.audit_log, async () => {
        await db.units.put(row)
        await recordAudit(
            'saveInventory',
            'Inventory',
            input.id,
            {
                id: input.id,
                unit: input.unit,
                package: input.package,
                unitsPerPackage: input.unitsPerPackage,
                updatedAt: now,
            },
            performer
        )
    })
    return row
}

export async function upsertInventoryItemLocal(
    input: InventoryItem
): Promise<InventoryItem> {
    const row: InventoryItem = {
        id: input.id,
        image: input.image || '',
        menuName: String(input.menuName || ''),
        menuPrice: Number(input.menuPrice || 0) || 0,
        category:
            typeof input.category === 'string'
                ? input.category.trim()
                : (input.category ?? ''),
        warehouseName: String(input.warehouseName || ''),
        purchasePrice: Number(input.purchasePrice || 0) || 0,
        shelfLifeDays:
            typeof input.shelfLifeDays === 'number'
                ? input.shelfLifeDays
                : Number(input.shelfLifeDays || 0) || 0,
        purchasedUnit: String(input.purchasedUnit || ''),
        consumeUnit: String(input.consumeUnit || ''),
        volume: Number(input.volume || 0) || 0,
        lowStockQty: Number(input.lowStockQty || 0) || 0,
        ingredients: String(input.ingredients || ''),
        options: String(input.options || ''),
    }
    await db.inventory_items.put(row)
    return row
}

export async function listRestockRecords(): Promise<RestockRecord[]> {
    return db.restock_records.orderBy('timestamp').reverse().toArray()
}

export async function addRestockRecord(
    input: { id: string; packages: number; extraUnits: number; notes?: string },
    actor?: string
): Promise<RestockRecord> {
    const performer =
        actor && actor.trim().length > 0 ? actor.trim() : getSessionActor()
    const unit = await db.units.get(input.id)
    if (!unit) throw new Error('Item not configured in Units. Set stock first.')
    const timestamp = Date.now()
    const totalUnits =
        (Number(input.packages || 0) || 0) *
            (Number(unit.unitsPerPackage || 0) || 0) +
        (Number(input.extraUnits || 0) || 0)
    const record: RestockRecord = {
        id: uuid(),
        itemId: input.id,
        timestamp,
        unit: unit.unit,
        package: unit.package,
        unitsPerPackage: unit.unitsPerPackage,
        packages: Number(input.packages || 0) || 0,
        extraUnits: Number(input.extraUnits || 0) || 0,
        totalUnits,
        actor: performer,
        notes: input.notes ?? null,
    }
    await db.transaction(
        'readwrite',
        db.restock_records,
        db.audit_log,
        async () => {
            await db.restock_records.add(record)
            await recordAudit(
                'addRestock',
                'Inventory',
                input.id,
                {
                    id: input.id,
                    packages: record.packages,
                    extraUnits: record.extraUnits,
                    totalUnits: record.totalUnits,
                },
                performer
            )
        }
    )
    const linkedInventory =
        (await db.inventory_items.get(input.id)) ||
        (await db.menu_items.get(input.id))
    const remoteName =
        (linkedInventory &&
            typeof linkedInventory === 'object' &&
            'menuName' in linkedInventory &&
            linkedInventory.menuName) ||
        (linkedInventory &&
            typeof linkedInventory === 'object' &&
            'name' in linkedInventory &&
            (linkedInventory as MenuRow).name) ||
        input.id
    await persistRestockRemote(record, remoteName)
    return record
}

export async function syncRestockRecordsFromRemote(
    rows: Array<unknown>
): Promise<void> {
    if (!Array.isArray(rows) || rows.length === 0) return
    const normalized: RestockRecord[] = []
    for (const entry of rows) {
        const mapped = normalizeRestockRecord(entry)
        if (mapped) normalized.push(mapped)
    }
    if (!normalized.length) return
    await db.restock_records.bulkPut(normalized)
}

export async function refreshRestockRecordsFromRemote(): Promise<number> {
    if (typeof fetch === 'undefined') return 0
    try {
        const res = await fetch('/api/gas?action=restocks', {
            cache: 'no-store',
        })
        if (!res.ok) {
            throw new Error(`restocks fetch failed: ${res.status}`)
        }
        const data = await res.json().catch(() => ({}))
        const rows = Array.isArray(data?.items) ? data.items : []
        await syncRestockRecordsFromRemote(rows)
        return rows.length
    } catch (error) {
        console.warn('Failed to refresh restock records', error)
        return 0
    }
}

export async function ingestInventoryItemsFromMenu(
    rows: MenuRow[]
): Promise<void> {
    if (!Array.isArray(rows) || rows.length === 0) return
    const items: InventoryItem[] = rows
        .map((row) => ({
            id: row.id,
            image: String(row.image || ''),
            menuName: row.name,
            menuPrice: Number(row.price || 0) || 0,
            category: String(row.category || ''),
            warehouseName: String(row.warehouseName || ''),
            purchasePrice: Number(row.purchasePrice || 0) || 0,
            shelfLifeDays: Number(row.shelfLifeDays || 0) || 0,
            purchasedUnit: String(row.purchasedUnit || ''),
            consumeUnit: String(row.consumeUnit || ''),
            volume: Number(row.volume || 0) || 0,
            lowStockQty: Number(row.lowStockQty || 0) || 0,
            ingredients: String(row.ingredients || ''),
            options: String(row.options || ''),
        }))
        .filter((item) => item.id && item.menuName)
    if (!items.length) return
    await db.inventory_items.bulkPut(items)
}
