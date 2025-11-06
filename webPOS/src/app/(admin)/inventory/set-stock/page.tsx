'use client'

import { useTenant } from '@/context/TenantContext'
import { db } from '@/lib/db'
import { listMenu, syncMenuFromRemote } from '@/lib/local-catalog'
import {
    listInventoryItems,
    upsertInventoryItemLocal,
} from '@/lib/local-inventory'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

const sanitizeImageUrl = (value?: string | null): string => {
    if (!value) return ''
    const trimmed = String(value).trim()
    if (!trimmed) return ''
    if (
        trimmed.startsWith('/') ||
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('data:') ||
        trimmed.startsWith('blob:')
    ) {
        return trimmed
    }
    try {
        const parsed = new URL(trimmed)
        if (['http:', 'https:', 'data:', 'blob:'].includes(parsed.protocol)) {
            return trimmed
        }
    } catch {
        /* ignore */
    }
    return ''
}

export default function SetStockPage() {
    const [items, setItems] = useState<
        Array<{
            price: any
            id: string
            name: string
            image?: string
        }>
    >([])
    const lastTenantIdRef = useRef<string | null>(null)
    const seededDemoRef = useRef(false)
    const { tenant, loading: tenantLoading } = useTenant()
    useEffect(() => {
        let canceled = false
        let syncing = false

        const mapInventoryRows = (
            rows: Awaited<ReturnType<typeof listInventoryItems>>
        ) =>
            rows.map((r) => ({
                id: r.id,
                name: r.menuName || r.warehouseName || '',
                price: r.menuPrice,
                image: sanitizeImageUrl(r.image),
            }))

        const loadFromCache = async () => {
            try {
                const cached = await listInventoryItems().catch(() => [])
                if (!canceled) {
                    setItems(mapInventoryRows(cached))
                }
            } catch (err) {
                if (!canceled) {
                    console.warn('Failed to load cached inventory items', err)
                }
            }
        }

        const syncRemote = async () => {
            if (!tenant) return
            if (syncing) return
            syncing = true
            try {
                await syncMenuFromRemote({
                    ignoreBootstrap: true,
                }).catch(() => undefined)

                const [menuItems, existingInventory] = await Promise.all([
                    listMenu().catch(() => []),
                    listInventoryItems().catch(() => []),
                ])

                const existingMap = new Map(
                    existingInventory.map((row) => [row.id, row])
                )

                const menuIds = new Set(menuItems.map((item) => item.id))
                const staleIds = existingInventory
                    .filter((row) => !menuIds.has(row.id))
                    .map((row) => row.id)
                if (staleIds.length > 0) {
                    await db.inventory_items.bulkDelete(staleIds)
                }

                const upserts = menuItems.map(async (menuItem) => {
                    const current = existingMap.get(menuItem.id)
                    const resolvedImage =
                        sanitizeImageUrl(menuItem.image) ||
                        sanitizeImageUrl(current?.image) ||
                        ''
                    await upsertInventoryItemLocal({
                        id: menuItem.id,
                        image: resolvedImage,
                        menuName: menuItem.name || current?.menuName || '',
                        menuPrice:
                            Number(menuItem.price ?? current?.menuPrice ?? 0) ||
                            0,
                        warehouseName:
                            menuItem.warehouseName ||
                            current?.warehouseName ||
                            '',
                        purchasePrice:
                            Number(
                                menuItem.purchasePrice ??
                                    current?.purchasePrice ??
                                    0
                            ) || 0,
                        shelfLifeDays:
                            Number(
                                menuItem.shelfLifeDays ??
                                    current?.shelfLifeDays ??
                                    0
                            ) || 0,
                        purchasedUnit:
                            menuItem.purchasedUnit ||
                            current?.purchasedUnit ||
                            '',
                        consumeUnit:
                            menuItem.consumeUnit || current?.consumeUnit || '',
                        volume:
                            Number(menuItem.volume ?? current?.volume ?? 0) ||
                            0,
                        lowStockQty:
                            Number(
                                menuItem.lowStockQty ??
                                    current?.lowStockQty ??
                                    0
                            ) || 0,
                        ingredients:
                            menuItem.ingredients ?? current?.ingredients ?? '',
                        category: menuItem.category || current?.category || '',
                    })
                })
                if (upserts.length > 0) {
                    await Promise.allSettled(upserts)
                }

                await loadFromCache()
            } catch (err) {
                if (!canceled) {
                    console.warn('Failed to synchronise inventory', err)
                }
            } finally {
                syncing = false
            }
        }

        if (tenantLoading) {
            return
        }
        if (!tenant) {
            setItems([])
            return
        }

        if (lastTenantIdRef.current !== tenant.tenantId) {
            seededDemoRef.current = false
            lastTenantIdRef.current = tenant.tenantId
        }

        void loadFromCache()
        void syncRemote()
        const intervalId = window.setInterval(() => {
            void syncRemote()
        }, 30_000)

        return () => {
            canceled = true
            window.clearInterval(intervalId)
        }
    }, [tenant, tenantLoading])

    return (
        <div className="space-y-6 py-4 sm:py-6">
            <header className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">
                    Inventory
                </h1>
                <p className="text-sm text-muted-foreground">
                    Manage inventory items. Add new items to configure units and
                    track stock.
                </p>
            </header>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Link
                    href="/inventory/set-stock/new"
                    className="flex h-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200"
                >
                    <span className="text-3xl">+</span>
                </Link>
                {items.map((it) => (
                    <Link
                        key={it.id}
                        href={`/inventory/set-stock/${encodeURIComponent(it.id)}`}
                        className="group flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
                    >
                        <div className="flex-none w-full bg-gray-100 dark:bg-gray-800 aspect-square overflow-hidden relative">
                            {it.image ? (
                                <img
                                    src={it.image}
                                    alt={it.name}
                                    width={320}
                                    height={320}
                                    className="block h-full w-full object-cover bg-gray-100"
                                    style={{
                                        aspectRatio: '1 / 1',
                                        backgroundColor: 'bg-gray-100',
                                    }}
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs text-gray-400 dark:text-gray-500">
                                    No image
                                </div>
                            )}
                        </div>
                        <div className="p-3">
                            <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                                {it.name || 'Untitled'}
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    )
}
