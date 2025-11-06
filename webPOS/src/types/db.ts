export type TicketStatus = 'open' | 'closed' | 'void'

export type PaymentMethod = 'cash' | 'card' | 'promptPay'

export type ShiftStatus = 'open' | 'closed' | 'pending'

export interface Ticket {
    id: string
    name: string
    openedBy: string
    openedAt: number // epoch ms
    openedAtIso?: string | null
    status: TicketStatus
    closedAt?: number | null
    closedBy?: string | null
    payMethod?: PaymentMethod | null
    payAmount?: number | null // final total paid
    payReference?: string | null
    notes?: string | null
    covers?: number | null
    // Taxes
    taxRate?: number | null // percent, e.g., 7 means 7%
    taxAmount?: number | null
    subtotal?: number | null
    total?: number | null
}

import type { SelectedCartOption } from '@/types/pos'

export interface TicketItem {
    id: string
    ticketId: string
    sku: string
    name: string
    qty: number
    price: number // per-unit price
    addedAt: number // epoch ms
    lineTotal?: number
    basePrice?: number | null
    variantKey?: string | null
    options?: SelectedCartOption[] | null
}

export type InventoryEventType = 'set' | 'restock' | 'adjust' | 'sale'

export interface InventoryEvent {
    id: string
    sku: string
    type: InventoryEventType
    deltaUnits: number
    createdAt: number // epoch ms
    actor?: string
}

export interface ShiftRecord {
    id: string // shift id
    openedAt: number // epoch ms
    openedBy?: string | null
    closedAt?: number | null // epoch ms
    closedBy?: string | null
    status: ShiftStatus
    cashSales: number
    cardSales: number
    promptPaySales: number
    ticketsCount: number
    itemsSoldJson: string | null
    notes?: string | null
    // Cash/float tracking (local persistence; optional until backend sync)
    floatOpening?: number // starting float for the shift
    floatClosing?: number | null
    floatWithdrawn?: number
    pettyOpening?: number
    pettyClosing?: number | null
    pettyWithdrawn?: number
}

export interface MenuRow {
    id: string
    name: string
    description: string
    price: number
    image: string
    category: string
    purchasePrice?: number
    warehouseName?: string
    shelfLifeDays?: number
    purchasedUnit?: string
    consumeUnit?: string
    volume?: number
    lowStockQty?: number
    ingredients?: string
    options?: string
    updatedAt?: number
    unitsUpdatedAt?: number
}

export interface CategoryRow {
    id: string
    label: string
    value: string
    icon?: string
}

export interface UnitRow {
    id: string
    unit: string
    package: string
    unitsPerPackage: number
    updatedAt?: number | null
}

export interface IngredientRow {
    id: string
    name: string
    packageUnits: string
    totalVolume: number
    updatedAt?: number | null
}

export interface InventoryItem {
    id: string
    image: string
    // Menu linkage
    menuName: string
    menuPrice: number
    category?: string
    // Warehouse details
    warehouseName: string
    purchasePrice: number
    shelfLifeDays?: number // numeric shelf-life in days
    // Units
    purchasedUnit: string
    consumeUnit: string
    volume: number
    // Alerts
    lowStockQty?: number // units threshold for warning
    // Recipe
    ingredients?: string // JSON string of ingredient array
    options?: string // JSON string of option groups
}

export interface RestockRecord {
    id: string
    itemId: string
    timestamp: number // epoch ms
    unit: string
    package: string
    unitsPerPackage: number
    packages: number
    extraUnits: number
    totalUnits: number
    actor?: string | null
    notes?: string | null
}

export interface AuditLogEntry {
    id: string
    timestamp: number // epoch ms
    action: string
    actor?: string | null
    entity?: string | null
    entityId?: string | null
    details: Record<string, unknown>
}

export interface UserRow {
    pin: string // primary key
    role: string | null
    name: string | null
    email: string | null
    phone: string | null
    notes: string | null
    createdAt?: number | null
    updatedAt?: number | null
}

export interface ReportCacheEntry {
    key: string // reports:{range}:{start}:{end}
    range: 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly'
    start: string // yyyy-MM-dd
    end: string // yyyy-MM-dd
    tickets: number
    cash: number
    card: number
    prompt: number
    daysData?: Array<{ date: string; total: number; label?: string }>
    monthsData?: Array<{ month: number; total: number }>
    topItems: Array<{ name: string; qty: number }>
    fetchedAt: number // epoch ms
}

export interface DailyReportCacheEntry {
    key: string // daily:{year}:{month}
    year: number
    month: number
    monthName?: string | null
    days: Array<{
        day: number
        sheet: string
        date: string
        weekday: string
        grossSales: number
        netSales: number
        taxCollected: number
        itemsSold: number
        averageItemPrice: number
        tickets: number
        averageTicketValue: number
        payments: {
            cash: number
            card: number
            promptPay: number
        }
        paymentPercentages: {
            card: number
            cash: number
            promptPay: number
        }
        employees: Array<{ name: string; total: number }>
    }>
    fetchedAt: number
}

export type VoidRequestStatus = 'pending' | 'approved' | 'rejected'
export interface VoidRequest {
    id: string
    ticketId: string
    ticketName?: string | null
    itemSku?: string | null
    itemName: string
    requestedQty: number
    reason: string
    approverId: string // target user id/pin to approve
    requestedBy: string | null
    status: VoidRequestStatus
    createdAt: number
    decidedAt?: number | null
}

export interface NotificationRow {
    id: string
    userId: string // target user (pin or email)
    title: string
    body: string
    createdAt: number
    read: boolean
    meta?: Record<string, unknown>
}

export interface TenantConfigRow {
    tenantId: string
    accountEmail: string
    settingsSpreadsheetId: string
    menuSpreadsheetId?: string | null
    driveFolderId?: string | null
    createdAt: number
    updatedAt: number
    metadataJson?: string | null
}
