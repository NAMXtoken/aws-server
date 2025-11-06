'use client'

import Dexie, { Table } from 'dexie'
import type {
    Ticket,
    TicketItem,
    InventoryEvent,
    ShiftRecord,
    MenuRow,
    CategoryRow,
    UnitRow,
    IngredientRow,
    RestockRecord,
    AuditLogEntry,
    UserRow,
    TenantConfigRow,
} from '@/types/db'

class PosDatabase extends Dexie {
    tickets!: Table<Ticket, string>
    ticket_items!: Table<TicketItem, string>
    inventory_events!: Table<InventoryEvent, string>
    shifts!: Table<ShiftRecord, string>
    menu_items!: Table<MenuRow, string>
    categories!: Table<CategoryRow, string>
    units!: Table<UnitRow, string>
    ingredients!: Table<IngredientRow, string>
    restock_records!: Table<RestockRecord, string>
    audit_log!: Table<AuditLogEntry, string>
    users!: Table<UserRow, string>
    reports_cache!: Table<import('@/types/db').ReportCacheEntry, string>
    void_requests!: Table<import('@/types/db').VoidRequest, string>
    notifications!: Table<import('@/types/db').NotificationRow, string>
    inventory_items!: Table<import('@/types/db').InventoryItem, string>
    tenant_config!: Table<TenantConfigRow, string>
    daily_reports_cache!: Table<
        import('@/types/db').DailyReportCacheEntry,
        string
    >

    constructor() {
        super('pos-local')
        this.version(1).stores({
            tickets: '&id, openedAt, status',
            ticket_items: '&id, ticketId, sku, addedAt',
            inventory_events: '&id, sku, type, createdAt',
            shifts: '&id, openedAt, closedAt',
        })
        this.version(2).stores({
            tickets: '&id, openedAt, status, closedAt, payMethod',
            ticket_items: '&id, ticketId, sku, addedAt',
            inventory_events: '&id, sku, type, createdAt',
            shifts: '&id, openedAt, closedAt',
        })
        this.version(3).stores({
            tickets: '&id, openedAt, status, closedAt, payMethod',
            ticket_items: '&id, ticketId, sku, addedAt',
            inventory_events: '&id, sku, type, createdAt',
            shifts: '&id, openedAt, closedAt',
            menu_items: '&id, category',
            categories: '&id, value',
        })
        this.version(4)
            .stores({
                tickets: '&id, openedAt, status, closedAt, payMethod',
                ticket_items: '&id, ticketId, sku, addedAt',
                inventory_events: '&id, sku, type, createdAt',
                shifts: '&id, openedAt, closedAt, status',
                menu_items: '&id, category',
                categories: '&id, value',
                units: '&id, updatedAt',
                restock_records: '&id, itemId, timestamp',
                audit_log: '&id, timestamp, action',
            })
            .upgrade(async (tx) => {
                const shiftTable = tx.table('shifts')
                const rows = await shiftTable.toArray()
                for (const raw of rows) {
                    const legacy = raw as ShiftRecord & {
                        cash?: number
                        card?: number
                        promptPay?: number
                    }
                    const normalized: ShiftRecord & Record<string, unknown> = {
                        ...legacy,
                        cashSales:
                            Number(legacy.cashSales ?? legacy.cash ?? 0) || 0,
                        cardSales:
                            Number(legacy.cardSales ?? legacy.card ?? 0) || 0,
                        promptPaySales:
                            Number(
                                legacy.promptPaySales ?? legacy.promptPay ?? 0
                            ) || 0,
                        ticketsCount: Number(legacy.ticketsCount ?? 0) || 0,
                        itemsSoldJson: legacy.itemsSoldJson ?? null,
                        status:
                            (legacy.status as
                                | ShiftRecord['status']
                                | undefined) ??
                            (legacy.closedAt ? 'closed' : 'open'),
                    }
                    delete (normalized as Record<string, unknown>).cash
                    delete (normalized as Record<string, unknown>).card
                    delete (normalized as Record<string, unknown>).promptPay
                    await shiftTable.put(normalized)
                }
            })
        this.version(5)
            .stores({
                tickets: '&id, openedAt, status, closedAt, payMethod',
                ticket_items: '&id, ticketId, sku, addedAt',
                inventory_events: '&id, sku, type, createdAt',
                shifts: '&id, openedAt, closedAt, status',
                menu_items: '&id, category',
                categories: '&id, value',
                units: '&id, updatedAt',
                restock_records: '&id, itemId, timestamp',
                audit_log: '&id, timestamp, action',
            })
            .upgrade(async (tx) => {
                const shiftTable = tx.table('shifts')
                await shiftTable.toCollection().modify((shift: any) => {
                    shift.floatOpening = Number(shift.floatOpening ?? 0) || 0
                    shift.floatClosing = shift.floatClosing ?? null
                    shift.floatWithdrawn =
                        Number(shift.floatWithdrawn ?? 0) || 0
                    shift.pettyOpening = Number(shift.pettyOpening ?? 0) || 0
                    shift.pettyClosing = shift.pettyClosing ?? null
                    shift.pettyWithdrawn =
                        Number(shift.pettyWithdrawn ?? 0) || 0
                })
            })
        this.version(6).stores({
            tickets: '&id, openedAt, status, closedAt, payMethod',
            ticket_items: '&id, ticketId, sku, addedAt',
            inventory_events: '&id, sku, type, createdAt',
            shifts: '&id, openedAt, closedAt, status',
            menu_items: '&id, category',
            categories: '&id, value',
            units: '&id, updatedAt',
            restock_records: '&id, itemId, timestamp',
            audit_log: '&id, timestamp, action',
            users: '&pin, name, role',
        })
        this.version(7).stores({
            tickets: '&id, openedAt, status, closedAt, payMethod',
            ticket_items: '&id, ticketId, sku, addedAt',
            inventory_events: '&id, sku, type, createdAt',
            shifts: '&id, openedAt, closedAt, status',
            menu_items: '&id, category',
            categories: '&id, value',
            units: '&id, updatedAt',
            restock_records: '&id, itemId, timestamp',
            audit_log: '&id, timestamp, action',
            users: '&pin, name, role',
            reports_cache: '&key, range, start, end, fetchedAt',
        })
        this.version(8).stores({
            tickets: '&id, openedAt, status, closedAt, payMethod',
            ticket_items: '&id, ticketId, sku, addedAt',
            inventory_events: '&id, sku, type, createdAt',
            shifts: '&id, openedAt, closedAt, status',
            menu_items: '&id, category',
            categories: '&id, value',
            units: '&id, updatedAt',
            restock_records: '&id, itemId, timestamp',
            audit_log: '&id, timestamp, action',
            users: '&pin, name, role',
            reports_cache: '&key, range, start, end, fetchedAt',
            inventory_items: '&id, name',
        })
        this.version(9).stores({
            tickets: '&id, openedAt, status, closedAt, payMethod',
            ticket_items: '&id, ticketId, sku, addedAt',
            inventory_events: '&id, sku, type, createdAt',
            shifts: '&id, openedAt, closedAt, status',
            menu_items: '&id, category',
            categories: '&id, value',
            units: '&id, updatedAt',
            restock_records: '&id, itemId, timestamp',
            audit_log: '&id, timestamp, action',
            users: '&pin, name, role',
            reports_cache: '&key, range, start, end, fetchedAt',
            inventory_items: '&id, name',
            void_requests: '&id, ticketId, status, createdAt',
            notifications: '&id, userId, createdAt, read',
        })
        // Force a no-op bump to ensure new stores (notifications, void_requests) are created for existing dev DBs
        this.version(10).stores({
            tickets: '&id, openedAt, status, closedAt, payMethod',
            ticket_items: '&id, ticketId, sku, addedAt',
            inventory_events: '&id, sku, type, createdAt',
            shifts: '&id, openedAt, closedAt, status',
            menu_items: '&id, category',
            categories: '&id, value',
            units: '&id, updatedAt',
            restock_records: '&id, itemId, timestamp',
            audit_log: '&id, timestamp, action',
            users: '&pin, name, role',
            reports_cache: '&key, range, start, end, fetchedAt',
            inventory_items: '&id, name',
            void_requests: '&id, ticketId, status, createdAt',
            notifications: '&id, userId, createdAt, read',
            tenant_config: '&tenantId, updatedAt',
        })
        this.version(11).stores({
            tickets: '&id, openedAt, status, closedAt, payMethod',
            ticket_items: '&id, ticketId, sku, addedAt',
            inventory_events: '&id, sku, type, createdAt',
            shifts: '&id, openedAt, closedAt, status',
            menu_items: '&id, category',
            categories: '&id, value',
            units: '&id, updatedAt',
            restock_records: '&id, itemId, timestamp',
            audit_log: '&id, timestamp, action',
            users: '&pin, name, role',
            reports_cache: '&key, range, start, end, fetchedAt',
            inventory_items: '&id, name',
            void_requests: '&id, ticketId, status, createdAt',
            notifications: '&id, userId, createdAt, read',
            tenant_config: '&tenantId, updatedAt',
        })
        this.version(12).stores({
            tickets: '&id, openedAt, status, closedAt, payMethod',
            ticket_items: '&id, ticketId, sku, addedAt',
            inventory_events: '&id, sku, type, createdAt',
            shifts: '&id, openedAt, closedAt, status',
            menu_items: '&id, category',
            categories: '&id, value',
            units: '&id, updatedAt',
            ingredients: '&id, name',
            restock_records: '&id, itemId, timestamp',
            audit_log: '&id, timestamp, action',
            users: '&pin, name, role',
            reports_cache: '&key, range, start, end, fetchedAt',
            inventory_items: '&id, name',
            void_requests: '&id, ticketId, status, createdAt',
            notifications: '&id, userId, createdAt, read',
            tenant_config: '&tenantId, updatedAt',
        })
        this.version(13).stores({
            tickets: '&id, openedAt, status, closedAt, payMethod',
            ticket_items: '&id, ticketId, sku, addedAt',
            inventory_events: '&id, sku, type, createdAt',
            shifts: '&id, openedAt, closedAt, status',
            menu_items: '&id, category',
            categories: '&id, value',
            units: '&id, updatedAt',
            ingredients: '&id, name',
            restock_records: '&id, itemId, timestamp',
            audit_log: '&id, timestamp, action',
            users: '&pin, name, role',
            reports_cache: '&key, range, start, end, fetchedAt',
            daily_reports_cache: '&key, year, month, fetchedAt',
            inventory_items: '&id, name',
            void_requests: '&id, ticketId, status, createdAt',
            notifications: '&id, userId, createdAt, read',
            tenant_config: '&tenantId, updatedAt',
        })
    }
}

export const db = new PosDatabase()

const OPEN_TICKETS_BACKUP_DELAY_MS = 1000
let openTicketsBackupTimer: number | null = null
let openTicketsBackupInFlight = false

async function flushOpenTicketsBackup() {
    if (openTicketsBackupInFlight) return
    if (typeof window === 'undefined') return
    if (typeof fetch === 'undefined') return
    openTicketsBackupInFlight = true
    try {
        const openTickets = await db.tickets
            .filter((ticket) => (ticket.status ?? 'open') === 'open')
            .toArray()
        const ticketIds = openTickets
            .map((ticket) => ticket.id)
            .filter(
                (id): id is string => typeof id === 'string' && id.length > 0
            )
        const ticketItems = ticketIds.length
            ? await db.ticket_items.where('ticketId').anyOf(ticketIds).toArray()
            : []
        const payload = {
            action: 'saveOpenTicketsSnapshot',
            updatedAt: Date.now(),
            tickets: openTickets.map((ticket) => ({ ...ticket })),
            items: ticketItems.map((item) => ({ ...item })),
        }
        await fetch('/api/gas', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
    } catch (error) {
        console.warn('Failed to persist open tickets backup', error)
    } finally {
        openTicketsBackupInFlight = false
    }
}

function scheduleOpenTicketsBackup() {
    if (typeof window === 'undefined') return
    if (openTicketsBackupTimer) {
        clearTimeout(openTicketsBackupTimer)
    }
    openTicketsBackupTimer = window.setTimeout(() => {
        openTicketsBackupTimer = null
        void flushOpenTicketsBackup()
    }, OPEN_TICKETS_BACKUP_DELAY_MS)
}

if (typeof window !== 'undefined') {
    const schedule = () => scheduleOpenTicketsBackup()
    db.tickets.hook('creating', schedule)
    db.tickets.hook('updating', schedule)
    db.tickets.hook('deleting', schedule)
    db.ticket_items.hook('creating', schedule)
    db.ticket_items.hook('updating', schedule)
    db.ticket_items.hook('deleting', schedule)
}

export async function clearAllLocalData(): Promise<void> {
    const tables = [
        db.tickets,
        db.ticket_items,
        db.inventory_events,
        db.shifts,
        db.menu_items,
        db.categories,
        db.units,
        db.ingredients,
        db.restock_records,
        db.audit_log,
        db.users,
        db.inventory_items,
        db.void_requests,
        db.notifications,
        db.reports_cache,
        db.daily_reports_cache,
    ]

    await db.transaction('readwrite', tables, async () => {
        for (const table of tables) {
            await table.clear()
        }
    })
}

export function uuid(): string {
    try {
        return crypto.randomUUID()
    } catch {
        return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`
    }
}
