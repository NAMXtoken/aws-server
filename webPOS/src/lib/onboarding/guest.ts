'use client'

import { db } from '@/lib/db'
import { seedDemoCatalogIfEmpty } from '@/lib/local-catalog'
import {
    saveTenantConfigLocal,
    setTenantBootstrapFlag,
} from '@/lib/tenant-config'
import type { TenantConfig } from '@/types/tenant'
import type { Ticket, TicketItem, ShiftRecord } from '@/types/db'
import { tenantSlugToSupabaseId } from '@/lib/tenant-ids'
import { upsertUserLocal } from '@/lib/local-users'

const GUEST_TENANT_SLUG = 'tenant-guest'
const GUEST_EMAIL = 'guest@demo.byndpos'
const GUEST_NAME = 'Guest Explorer'
const GUEST_PIN = '4242'
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8

const setCookie = (name: string, value: string) => {
    if (typeof document === 'undefined') return
    document.cookie = `${name}=${encodeURIComponent(
        value
    )}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
}

async function seedGuestRegisters(now: number): Promise<void> {
    const tickets: Ticket[] = [
        {
            id: 'guest-demo-ticket-1',
            name: 'Morning Rush',
            openedBy: GUEST_NAME,
            openedAt: now - 1000 * 60 * 50,
            status: 'closed',
            closedAt: now - 1000 * 60 * 20,
            closedBy: GUEST_NAME,
            payMethod: 'cash',
            payAmount: 184.5,
            subtotal: 170,
            total: 184.5,
            notes: 'Latte flight + pastries',
        },
        {
            id: 'guest-demo-ticket-2',
            name: 'Catering Hold',
            openedBy: 'Manager',
            openedAt: now - 1000 * 60 * 120,
            status: 'open',
            notes: 'Still reviewing order with kitchen',
        },
    ]

    const ticketItems: TicketItem[] = [
        {
            id: 'guest-demo-item-1',
            ticketId: 'guest-demo-ticket-1',
            sku: 'coffee-guest',
            name: 'Single-origin Latte',
            qty: 2,
            price: 5.5,
            addedAt: now - 1000 * 60 * 45,
        },
        {
            id: 'guest-demo-item-2',
            ticketId: 'guest-demo-ticket-1',
            sku: 'sandwich-guest',
            name: 'Breakfast Sandwich',
            qty: 3,
            price: 7.75,
            addedAt: now - 1000 * 60 * 40,
        },
        {
            id: 'guest-demo-item-3',
            ticketId: 'guest-demo-ticket-2',
            sku: 'snack-guest',
            name: 'Energy Bites',
            qty: 5,
            price: 3.25,
            addedAt: now - 1000 * 60 * 110,
        },
    ]

    const shift: ShiftRecord = {
        id: 'GUEST-301',
        openedAt: now - 1000 * 60 * 180,
        openedBy: 'Manager',
        closedAt: null,
        closedBy: null,
        status: 'open',
        cashSales: 245,
        cardSales: 132,
        promptPaySales: 68,
        ticketsCount: 6,
        itemsSoldJson: JSON.stringify([
            { sku: 'coffee-guest', name: 'Single-origin Latte', qty: 12 },
            { sku: 'sandwich-guest', name: 'Breakfast Sandwich', qty: 8 },
        ]),
        floatOpening: 150,
        floatClosing: null,
        floatWithdrawn: 0,
        pettyOpening: 40,
        pettyClosing: null,
        pettyWithdrawn: 0,
    }

    await db.transaction(
        'readwrite',
        db.tickets,
        db.ticket_items,
        db.shifts,
        async () => {
            for (const ticket of tickets) {
                await db.tickets.put(ticket)
            }
            for (const item of ticketItems) {
                await db.ticket_items.put(item)
            }
            await db.shifts.put(shift)
        }
    )
}

export async function bootstrapGuestExperience(): Promise<{
    pin: string
    tenantSlug: string
}> {
    const tenantId = await tenantSlugToSupabaseId(GUEST_TENANT_SLUG)
    const now = Date.now()
    const config: TenantConfig = {
        tenantId,
        accountEmail: GUEST_EMAIL,
        settingsSpreadsheetId: '',
        menuSpreadsheetId: null,
        driveFolderId: null,
        metadata: { bootstrapComplete: true },
        createdAt: now,
        updatedAt: now,
    }
    await saveTenantConfigLocal(config)
    setTenantBootstrapFlag(tenantId, true)
    await seedDemoCatalogIfEmpty()
    await seedGuestRegisters(now)
    await upsertUserLocal({
        pin: GUEST_PIN,
        name: GUEST_NAME,
        role: 'admin',
        email: GUEST_EMAIL,
    })

    setCookie('tenantSlug', GUEST_TENANT_SLUG)
    setCookie('tenantId', tenantId)
    setCookie('accountEmail', GUEST_EMAIL)
    setCookie('name', GUEST_NAME)
    setCookie('role', 'admin')
    setCookie('pin', GUEST_PIN)
    setCookie('unlocked', 'true')

    return { pin: GUEST_PIN, tenantSlug: GUEST_TENANT_SLUG }
}
