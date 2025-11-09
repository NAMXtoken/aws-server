'use client'

import { db, uuid } from '@/lib/db'
import {
    ingestInventoryItemsFromMenu,
    syncUnitsFromMenuRows,
} from '@/lib/local-inventory'
import { getActiveTenantId, isActiveTenantBootstrapped } from '@/lib/tenant-config'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { ensureTenantIdentifiers } from '@/lib/tenant-ids'
import type { MenuRow, CategoryRow } from '@/types/db'

export async function listMenu(): Promise<MenuRow[]> {
    return db.menu_items.toArray()
}

export async function listCategories(): Promise<CategoryRow[]> {
    return db.categories.toArray()
}

export async function seedDemoCatalogIfEmpty(): Promise<void> {
    if (!isActiveTenantBootstrapped()) return
    const [mCount, cCount] = await Promise.all([
        db.menu_items.count(),
        db.categories.count(),
    ])
    if (mCount > 0 && cCount > 0) return
    const cats: CategoryRow[] = [
        { id: uuid(), label: 'Drinks', value: 'drinks', icon: '' },
        { id: uuid(), label: 'Snacks', value: 'snacks', icon: '' },
        { id: uuid(), label: 'Meals', value: 'meals', icon: '' },
    ]
    const items: MenuRow[] = [
        {
            id: uuid(),
            name: 'Coffee',
            description: 'Hot brewed',
            price: 2.5,
            image: '',
            category: 'drinks',
        },
        {
            id: uuid(),
            name: 'Tea',
            description: 'Green tea',
            price: 2.0,
            image: '',
            category: 'drinks',
        },
        {
            id: uuid(),
            name: 'Chips',
            description: 'Potato chips',
            price: 1.5,
            image: '',
            category: 'snacks',
        },
        {
            id: uuid(),
            name: 'Sandwich',
            description: 'Ham & cheese',
            price: 4.0,
            image: '',
            category: 'meals',
        },
    ]
    await db.transaction(
        'readwrite',
        db.categories,
        db.menu_items,
        async () => {
            if (cCount === 0) await db.categories.bulkAdd(cats)
            if (mCount === 0) await db.menu_items.bulkAdd(items)
        }
    )
}

export async function dedupeCatalog(): Promise<{
    removedMenu: number
    removedCats: number
}> {
    const cats = await db.categories.toArray()
    const seenCat = new Set<string>()
    const dupCatIds: string[] = []
    for (const c of cats) {
        const key = String(c.value || c.label || c.id)
            .trim()
            .toLowerCase()
        if (seenCat.has(key)) dupCatIds.push(c.id)
        else seenCat.add(key)
    }
    if (dupCatIds.length) await db.categories.bulkDelete(dupCatIds)

    const items = await db.menu_items.toArray()
    const seenItem = new Set<string>()
    const dupItemIds: string[] = []
    for (const m of items) {
        const key = `${String(m.name).trim().toLowerCase()}::${String(m.category).trim().toLowerCase()}`
        if (seenItem.has(key)) dupItemIds.push(m.id)
        else seenItem.add(key)
    }
    if (dupItemIds.length) await db.menu_items.bulkDelete(dupItemIds)

    return { removedMenu: dupItemIds.length, removedCats: dupCatIds.length }
}

export async function clearCatalog(): Promise<void> {
    await db.transaction(
        'readwrite',
        db.menu_items,
        db.categories,
        async () => {
            await db.menu_items.clear()
            await db.categories.clear()
        }
    )
}

export async function invalidateMenuCache(): Promise<void> {
    await db.transaction(
        'readwrite',
        db.menu_items,
        db.categories,
        async () => {
            await db.menu_items.clear()
            // Do not clear categories if they don't exist yet; guard to avoid Dexie complaint.
            if (db.categories) await db.categories.clear()
        }
    )
}

export async function resetDemoCatalog(): Promise<{
    seededMenu: number
    seededCats: number
}> {
    await clearCatalog()
    await seedDemoCatalogIfEmpty()
    const [m, c] = await Promise.all([
        db.menu_items.count(),
        db.categories.count(),
    ])
    return { seededMenu: m, seededCats: c }
}

export async function syncMenuFromRemote(options?: {
    fresh?: boolean
    ignoreBootstrap?: boolean
    allowEmpty?: boolean
}): Promise<{
    menu: number
    categories: number
}> {
    try {
        if (!options?.ignoreBootstrap && !isActiveTenantBootstrapped()) {
            return {
                menu: await db.menu_items.count(),
                categories: await db.categories.count(),
            }
        }

        const tenantIdentifier = getActiveTenantId()
        if (!tenantIdentifier) {
            return {
                menu: await db.menu_items.count(),
                categories: await db.categories.count(),
            }
        }

        let supabaseId: string | null = null
        try {
            const ids = await ensureTenantIdentifiers(tenantIdentifier)
            supabaseId = ids.supabaseId
        } catch (identifierError) {
            console.warn('Unable to derive Supabase tenant ID', identifierError)
            return {
                menu: await db.menu_items.count(),
                categories: await db.categories.count(),
            }
        }
        if (!supabaseId) {
            return {
                menu: await db.menu_items.count(),
                categories: await db.categories.count(),
            }
        }

        const supabase = getSupabaseBrowserClient()
        const { data, error } = await supabase
            .from('menu_items')
            .select('*')
            .eq('tenant_id', supabaseId)
            .eq('active', true)
        if (error) {
            throw error
        }

        const toNumber = (value: unknown, fallback = 0) => {
            const parsed = Number(value ?? fallback)
            return Number.isFinite(parsed) ? parsed : fallback
        }
        const toStringValue = (value: unknown) =>
            typeof value === 'string' ? value : ''

        const menuRows: MenuRow[] = (data ?? []).map((row) => {
            const metadata =
                (row.metadata as Record<string, unknown> | null) ?? {}
            return {
                id: row.id,
                name: row.name ?? '',
                description: row.description ?? '',
                price: toNumber(row.price),
                image: toStringValue(metadata.image),
                category: row.category ?? '',
                purchasePrice: toNumber(metadata.purchasePrice),
                warehouseName: toStringValue(metadata.warehouseName),
                shelfLifeDays: toNumber(metadata.shelfLifeDays),
                purchasedUnit: toStringValue(metadata.purchasedUnit),
                consumeUnit: toStringValue(metadata.consumeUnit),
                volume: toNumber(metadata.volume),
                lowStockQty: toNumber(metadata.lowStockQty),
                ingredients: metadata.ingredients
                    ? JSON.stringify(metadata.ingredients)
                    : '',
                options: toStringValue(metadata.options),
                updatedAt: row.updated_at
                    ? new Date(row.updated_at).getTime()
                    : Date.now(),
                unitsUpdatedAt: row.updated_at
                    ? new Date(row.updated_at).getTime()
                    : Date.now(),
            }
        })

        const categoryMap = new Map<string, CategoryRow>()
        for (const item of menuRows) {
            const value = (item.category || '').trim()
            if (!value || categoryMap.has(value)) continue
            categoryMap.set(value, {
                id: value,
                label: value
                    .replace(/[-_]/g, ' ')
                    .replace(/\b\w/g, (char) => char.toUpperCase()),
                value,
                icon: '',
            })
        }
        const categoryRows = Array.from(categoryMap.values())

        const replaceMenu = options?.allowEmpty || menuRows.length > 0
        const replaceCategories = options?.allowEmpty || categoryRows.length > 0

        if (replaceMenu || replaceCategories) {
            await db.transaction(
                'readwrite',
                db.menu_items,
                db.categories,
                async () => {
                    if (replaceCategories) {
                        await db.categories.clear()
                        if (categoryRows.length) {
                            await db.categories.bulkPut(categoryRows)
                        }
                    }
                    if (replaceMenu) {
                        await db.menu_items.clear()
                        if (menuRows.length) {
                            await db.menu_items.bulkPut(menuRows)
                        }
                    }
                }
            )
        }

        if (menuRows.length) {
            await Promise.all([
                syncUnitsFromMenuRows(menuRows),
                ingestInventoryItemsFromMenu(menuRows),
            ])
        }

        return { menu: menuRows.length, categories: categoryRows.length }
    } catch (error) {
        console.error('syncMenuFromRemote failed', error)
        throw error
    }
}
