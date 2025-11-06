'use client'

import { db, uuid } from '@/lib/db'
import {
    ingestInventoryItemsFromMenu,
    syncUnitsFromMenuRows,
} from '@/lib/local-inventory'
import { isActiveTenantBootstrapped } from '@/lib/tenant-config'
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
        const freshQuery = options?.fresh ? '&fresh=1' : ''
        const normalizeDriveImageUrl = (url: string): string => {
            try {
                if (!url) return ''
                const u = new URL(url, 'https://drive.google.com')
                const host = u.hostname
                if (
                    host.includes('drive.google.com') ||
                    host.includes('drive.usercontent.google.com') ||
                    host.includes('googleusercontent.com')
                ) {
                    const idParam = u.searchParams.get('id')
                    if (idParam)
                        return `/api/drive?id=${encodeURIComponent(idParam)}`
                    const m = u.pathname.match(/\/file\/d\/([^/]+)\//)
                    if (m && m[1])
                        return `/api/drive?id=${encodeURIComponent(m[1])}`
                }
                return url
            } catch {
                return url
            }
        }

        if (!options?.ignoreBootstrap && !isActiveTenantBootstrapped()) {
            await db.transaction(
                'readwrite',
                db.menu_items,
                db.categories,
                async () => {
                    await db.menu_items.clear()
                    await db.categories.clear()
                }
            )
            return { menu: 0, categories: 0 }
        }

        const [menuRes, catRes] = await Promise.all([
            fetch(`/api/gas?action=menu${freshQuery}`, {
                cache: 'no-store',
            }),
            // Avoid stale categories; do not cache
            fetch(`/api/gas?action=categories${freshQuery}`, {
                cache: 'no-store',
            }),
        ])
        const menuData = await menuRes.json().catch(() => [] as any[])
        const catData = await catRes.json().catch(() => [] as any[])
        const toArray = (value: any): any[] => {
            if (Array.isArray(value)) return value
            if (Array.isArray(value?.items)) return value.items
            if (Array.isArray(value?.data)) return value.data
            return []
        }
        const menuRows: MenuRow[] = toArray(menuData)
            .map((row: any): MenuRow => {
                const id = String(
                    row.id ?? row.ID ?? row.key ?? row.name ?? uuid()
                ).trim()
                const rawImage = String(
                    row.image ?? row.photo ?? row.imageUrl ?? ''
                )
                const updatedAt =
                    Number(
                        row.updatedAt ??
                            row.updated_at ??
                            row.unitsUpdatedAt ??
                            0
                    ) || 0
                const unitsUpdatedAt =
                    Number(row.unitsUpdatedAt ?? row.updatedAt ?? updatedAt) ||
                    updatedAt
                return {
                    id: id || uuid(),
                    name: String(row.name ?? row.title ?? ''),
                    description: String(row.description ?? row.desc ?? ''),
                    price: Number(row.price ?? row.cost ?? 0) || 0,
                    image: normalizeDriveImageUrl(rawImage),
                    category: String(row.category ?? row.group ?? ''),
                    purchasePrice: Number(row.purchasePrice ?? 0) || 0,
                    warehouseName: String(row.warehouseName ?? ''),
                    shelfLifeDays: Number(row.shelfLifeDays ?? 0) || 0,
                    purchasedUnit: String(row.purchasedUnit ?? ''),
                    consumeUnit: String(row.consumeUnit ?? ''),
                    volume: Number(row.volume ?? 0) || 0,
                    lowStockQty: Number(row.lowStockQty ?? 0) || 0,
                    ingredients: String(row.ingredients ?? ''),
                    options: String(row.options ?? ''),
                    updatedAt,
                    unitsUpdatedAt,
                }
            })
            .filter((row) => row.name.trim().length > 0)
        const categoryRows: CategoryRow[] = toArray(catData)
            .map((row: any): CategoryRow => {
                const value = String(
                    row.value ?? row.slug ?? row.label ?? row.name ?? ''
                ).trim()
                const id = String((row.id ?? row.ID ?? value) || uuid())
                return {
                    id: id || uuid(),
                    label: String(row.label ?? row.name ?? value),
                    value: value || id || uuid(),
                    icon: typeof row.icon === 'string' ? row.icon : '',
                }
            })
            .filter((row) => row.label.trim().length > 0)

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
                        if (categoryRows.length)
                            await db.categories.bulkPut(categoryRows)
                    }
                    if (replaceMenu) {
                        await db.menu_items.clear()
                        if (menuRows.length)
                            await db.menu_items.bulkPut(menuRows)
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
