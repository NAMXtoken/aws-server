'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { uploadReceiptToDrive } from '@/lib/attachments'
import { InventoryOptionsEditor } from '@/components/inventory/InventoryOptionsEditor'
import {
    upsertInventoryItemLocal,
    upsertUnitLocal,
} from '@/lib/local-inventory'
import {
    listCachedIngredients,
    upsertIngredientLocal,
} from '@/lib/local-ingredients'
import { db, uuid } from '@/lib/db'
import {
    listCategories as listCachedCategories,
    syncMenuFromRemote,
} from '@/lib/local-catalog'
import { broadcastUpdate } from '@/hooks/use-realtime'
import {
    InventoryOptionGroup,
    normalizeOptionGroups,
    serializeInventoryOptions,
    validateOptionGroups,
} from '@/lib/inventory-options'
import { useTenant } from '@/context/TenantContext'
import { upsertMenuItemRemote, buildMenuMetadataFromRow } from '@/lib/menu-remote'
import type { MenuRow } from '@/types/db'
import type { MenuRow } from '@/types/db'

export default function NewInventoryItemPage() {
    const router = useRouter()
    const [imageUrl, setImageUrl] = useState('')
    // Menu fields
    const [menuName, setMenuName] = useState('')
    const [menuPrice, setMenuPrice] = useState('')
    const [categories, setCategories] = useState<
        Array<{ id: string; label: string; value: string }>
    >([])
    const [category, setCategory] = useState('')
    const [newCategoryName, setNewCategoryName] = useState('')
    const [newCategoryIcon, setNewCategoryIcon] = useState('')
    const [addingCategory, setAddingCategory] = useState(false)
    const [categoryError, setCategoryError] = useState<string | null>(null)
    // Warehouse fields
    const [warehouseName, setWarehouseName] = useState('')
    const [purchasePrice, setPurchasePrice] = useState('')
    const [shelfLifeDays, setShelfLifeDays] = useState('')
    // Ingredients
    const [ingredients, setIngredients] = useState<
        Array<{ name: string; packageUnits: string; totalVolume: number }>
    >([])
    const [customIngredients, setCustomIngredients] = useState<
        Array<{ name: string; packageUnits: string; totalVolume: number }>
    >([])
    const [selectedIngredients, setSelectedIngredients] = useState<
        Array<{ name: string; qty: number }>
    >([])
    const [ingredientItem, setIngredientItem] = useState('')
    const [ingredientQty, setIngredientQty] = useState('')
    const [addingIngredient, setAddingIngredient] = useState(false)
    const [newIngredientName, setNewIngredientName] = useState('')
    const [newIngredientUnits, setNewIngredientUnits] = useState('')
    const [newIngredientVolume, setNewIngredientVolume] = useState('')
    const [ingredientError, setIngredientError] = useState<string | null>(null)
    const [optionGroups, setOptionGroups] = useState<InventoryOptionGroup[]>([])
    const [optionsEnabled, setOptionsEnabled] = useState(false)
    // Alerts
    const [lowStockQty, setLowStockQty] = useState('')
    const [uploading, setUploading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const { tenant, loading: tenantLoading } = useTenant()

    useEffect(() => {
        let active = true
        if (tenantLoading) return
        if (!tenant) {
            setCategories([])
            setCategory('')
            return
        }
        const applyCachedCategories = async () => {
            try {
                const cached = await listCachedCategories().catch(() => [])
                if (!active || !cached.length) return
                setCategories(
                    cached.map((cat) => ({
                        id: cat.id,
                        label: cat.label,
                        value: cat.value,
                    }))
                )
                setCategory((prev) => prev || cached[0]?.value || '')
            } catch (err) {
                console.warn('Failed to load cached categories', err)
            }
        }
        void applyCachedCategories()
        ;(async () => {
            try {
                await syncMenuFromRemote({ ignoreBootstrap: true })
                await applyCachedCategories()
            } catch (err) {
                console.warn('Failed to refresh categories from Supabase', err)
            }
        })()
        return () => {
            active = false
        }
    }, [tenant, tenantLoading])

useEffect(() => {
    if (tenantLoading) return
    if (!tenant) {
        setIngredients([])
        return
    }
    let active = true
    ;(async () => {
        try {
            const items = await listCachedIngredients()
            if (!active) return
            setIngredients(
                items.map((item) => ({
                    name: item.name,
                    packageUnits: item.packageUnits || '',
                    totalVolume: item.totalVolume || 0,
                }))
            )
        } catch (err) {
            console.error('Failed to load cached ingredients:', err)
        }
    })()
    return () => {
        active = false
    }
    }, [tenant, tenantLoading])

    const onSelectImage: React.ChangeEventHandler<HTMLInputElement> = async (
        e
    ) => {
        const f = e.target.files?.[0]
        if (!f) return
        try {
            setUploading(true)
            setError(null)
            const res = await uploadReceiptToDrive(f, 'inventory')
            if (!res.ok) throw new Error(res.error || 'Upload failed')
            const url = res.url || res.webViewLink || res.webContentLink || ''
            setImageUrl(url)
        } catch (err) {
            setError(String((err as Error)?.message || err))
        } finally {
            setUploading(false)
        }
    }

    const onCreateCategory = async () => {
        const label = newCategoryName.trim()
        if (!label) {
            setCategoryError('Category name is required')
            return
        }
        setCategoryError(null)
        const icon = newCategoryIcon.trim()
        const slug =
            label
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '') || label
        setAddingCategory(true)
        try {
            const normalized = {
                id: uuid(),
                label,
                value: slug,
                icon,
            }
            await db.categories.put(normalized)
            setCategories((prev) => {
                const deduped = prev.filter(
                    (cat) =>
                        cat.id !== normalized.id &&
                        cat.value.toLowerCase() !==
                            normalized.value.toLowerCase()
                )
                return [...deduped, normalized].sort((a, b) =>
                    a.label.localeCompare(b.label)
                )
            })
            setCategory(normalized.value)
            setNewCategoryName('')
            setNewCategoryIcon('')
            void syncMenuFromRemote({ ignoreBootstrap: true })
            try {
                broadcastUpdate('inventory')
            } catch (broadcastErr) {
                console.warn(
                    'Failed to broadcast inventory update',
                    broadcastErr
                )
            }
        } catch (err) {
            const message =
                err instanceof Error ? err.message : String(err || 'Error')
            setCategoryError(message)
        } finally {
            setAddingCategory(false)
        }
    }

    const availableIngredients = useMemo(() => {
        const map = new Map<string, {
            name: string
            packageUnits: string
            totalVolume: number
        }>()
        ingredients.forEach((ing) => {
            if (ing.name) map.set(ing.name, ing)
        })
        customIngredients.forEach((ing) => {
            if (ing.name) map.set(ing.name, ing)
        })
        return Array.from(map.values()).sort((a, b) =>
            a.name.localeCompare(b.name)
        )
    }, [ingredients, customIngredients])

    const onAddIngredient = () => {
        if (!ingredientItem || !ingredientQty) {
            setError('Please select an ingredient and enter a quantity')
            return
        }
        const qty = Number(ingredientQty)
        if (!isFinite(qty) || qty <= 0) {
            setError('Quantity must be greater than 0')
            return
        }
        if (selectedIngredients.find((ing) => ing.name === ingredientItem)) {
            setError('Ingredient already added')
            return
        }
        setSelectedIngredients((prev) => [
            ...prev,
            { name: ingredientItem, qty },
        ])
        setIngredientItem('')
        setIngredientQty('')
        setError(null)
    }

    const onRemoveIngredient = (name: string) => {
        setSelectedIngredients((prev) =>
            prev.filter((ing) => ing.name !== name)
        )
    }

    const onCancelCreateIngredient = () => {
        setAddingIngredient(false)
        setIngredientError(null)
        setNewIngredientName('')
        setNewIngredientUnits('')
        setNewIngredientVolume('')
    }

    const onCreateIngredient = async () => {
        const name = newIngredientName.trim()
        if (!name) {
            setIngredientError('Ingredient name is required')
            return
        }
        setIngredientError(null)
        const packageUnits = newIngredientUnits.trim()
        const totalVolume = Number(newIngredientVolume) || 0
        try {
            await upsertIngredientLocal({
                name,
                packageUnits,
                totalVolume,
            })
            setCustomIngredients((prev) => {
                const exists = prev.some((ing) => ing.name === name)
                if (exists) {
                    return prev.map((ing) =>
                        ing.name === name
                            ? {
                                  name,
                                  packageUnits,
                                  totalVolume,
                              }
                            : ing
                    )
                }
                return [
                    ...prev,
                    {
                        name,
                        packageUnits,
                        totalVolume,
                    },
                ]
            })
            setIngredientItem(name)
            setAddingIngredient(false)
            setNewIngredientName('')
            setNewIngredientUnits('')
            setNewIngredientVolume('')
        } catch (err) {
            const message =
                err instanceof Error
                    ? err.message
                    : String(err || 'Failed to add ingredient')
            setIngredientError(message)
        }
    }

    const onSave = async () => {
        const safeMenuName = menuName.trim()
        const safeCategory = category.trim()
        const safeWarehouseName = warehouseName.trim()
        const purchPrice = Number(purchasePrice)
        const safePurchasePrice = Number.isFinite(purchPrice) ? purchPrice : 0
        const mPrice = Number(menuPrice)
        const safeMenuPrice = Number.isFinite(mPrice) ? mPrice : 0
        const shelf = Number(shelfLifeDays)
        const safeShelfLife = Number.isFinite(shelf) ? shelf : 0
        const safeLowStock = Number.isFinite(Number(lowStockQty))
            ? Number(lowStockQty)
            : 0

        if (!safeMenuName) {
            setError('Menu Name is required')
            return
        }
        if (!safeCategory && categories.length > 0) {
            setError('Category is required')
            return
        }
        const normalizedOptions = optionsEnabled
            ? normalizeOptionGroups(optionGroups)
            : []
        if (optionsEnabled) {
            const optionError = validateOptionGroups(normalizedOptions)
            if (optionError) {
                setError(optionError)
                return
            }
        }
        const optionsPayload = optionsEnabled
            ? serializeInventoryOptions(normalizedOptions)
            : ''
        try {
            setSaving(true)
            setError(null)
            const id = uuid()
            await upsertInventoryItemLocal({
                id,
                image: imageUrl || '',
                menuName: menuName.trim(),
                menuPrice: isFinite(mPrice) ? mPrice : 0,
                category: category.trim(),
                warehouseName: warehouseName.trim(),
                purchasePrice: isFinite(purchPrice) ? purchPrice : 0,
                shelfLifeDays: isFinite(shelf) ? shelf : 0,
                purchasedUnit: '',
                consumeUnit: '',
                volume: 0,
                lowStockQty: safeLowStock,
                ingredients: JSON.stringify(selectedIngredients),
                options: optionsPayload,
            })
            // Map units for compatibility with existing workflows
            await upsertUnitLocal({
                id,
                unit: '',
                package: '',
                unitsPerPackage: 0,
            })
            const menuRecord: MenuRow = {
                id,
                name: safeMenuName,
                description: '',
                price: isFinite(mPrice) ? mPrice : 0,
                image: imageUrl || '',
                category: safeCategory,
                purchasePrice: safePurchasePrice,
                warehouseName: safeWarehouseName,
                shelfLifeDays: safeShelfLife,
                purchasedUnit: '',
                consumeUnit: '',
                volume: 0,
                lowStockQty: safeLowStock,
                ingredients: JSON.stringify(selectedIngredients),
                options: optionsPayload,
                updatedAt: Date.now(),
                unitsUpdatedAt: Date.now(),
            }
            await db.menu_items.put(menuRecord)
            ;(async () => {
                try {
                    await upsertMenuItemRemote({
                        id,
                        name: safeMenuName,
                        price: menuRecord.price,
                        category: safeCategory,
                        metadata: {
                            ...buildMenuMetadataFromRow(menuRecord),
                            ingredients: selectedIngredients,
                            options: optionsPayload,
                            image: imageUrl || '',
                        },
                    })
                    await syncMenuFromRemote({ ignoreBootstrap: true })
                } catch (syncErr) {
                    console.warn('Failed to sync menu to Supabase:', syncErr)
                }
            })()
            try {
                broadcastUpdate('inventory')
            } catch {
                /* noop */
            }
            router.replace('/inventory/set-stock')
        } catch (err) {
            setError(String((err as Error)?.message || err))
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-6 py-4 sm:py-6">
            <header className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">
                    New Inventory Item
                </h1>
                <p className="text-sm text-muted-foreground">
                    Add an item with image, pricing, expiry, low-stock alert,
                    and ingredients.
                </p>
            </header>

            {error ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                    {error}
                </div>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                    <div>
                        <label className="mb-1 block text-xs text-muted-foreground">
                            Image
                        </label>
                        <div className="flex items-center gap-3">
                            <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
                                <span className="rounded border border-gray-300 px-3 py-1.5 dark:border-gray-700">
                                    {uploading ? 'Uploading…' : 'Upload Image'}
                                </span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={onSelectImage}
                                    disabled={uploading}
                                />
                            </label>
                            {imageUrl ? (
                                <a
                                    className="text-xs text-primary underline"
                                    href={imageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Preview
                                </a>
                            ) : null}
                        </div>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs text-muted-foreground">
                            Menu Name
                        </label>
                        <input
                            className="w-full rounded-md border border-gray-300 bg-white p-2 dark:border-gray-700 dark:bg-gray-900"
                            value={menuName}
                            onChange={(e) => setMenuName(e.target.value)}
                            placeholder="e.g., Latte"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-xs text-muted-foreground">
                            Category
                        </label>
                        <select
                            className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                        >
                            <option value="">Select category…</option>
                            {categories.map((cat) => (
                                <option key={cat.id} value={cat.value}>
                                    {cat.label}
                                </option>
                            ))}
                        </select>
                        <div className="text-xs text-muted-foreground">
                            Don't see the right category? Add it below.
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <input
                                className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                                value={newCategoryName}
                                onChange={(e) => {
                                    setNewCategoryName(e.target.value)
                                    if (categoryError) setCategoryError(null)
                                }}
                                placeholder="New category name"
                            />
                            <input
                                className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900 sm:w-40"
                                value={newCategoryIcon}
                                onChange={(e) => {
                                    setNewCategoryIcon(e.target.value)
                                    if (categoryError) setCategoryError(null)
                                }}
                                placeholder="Icon (optional)"
                            />
                            <button
                                type="button"
                                onClick={onCreateCategory}
                                disabled={addingCategory}
                                className="whitespace-nowrap rounded-md border border-gray-300 bg-gray-900 px-3 py-1.5 text-sm text-white dark:border-gray-700 dark:bg-white dark:text-gray-900 disabled:opacity-60"
                            >
                                {addingCategory ? 'Adding…' : 'Add Category'}
                            </button>
                        </div>
                        {categoryError ? (
                            <p className="text-xs text-red-600 dark:text-red-400">
                                {categoryError}
                            </p>
                        ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1 block text-xs text-muted-foreground">
                                Menu Price
                            </label>
                            <input
                                type="number"
                                inputMode="decimal"
                                className="w-full rounded-md border border-gray-300 bg-white p-2 dark:border-gray-700 dark:bg-gray-900"
                                value={menuPrice}
                                onChange={(e) => setMenuPrice(e.target.value)}
                                placeholder="0.00"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs text-muted-foreground">
                                Warehouse Name
                            </label>
                            <input
                                className="w-full rounded-md border border-gray-300 bg-white p-2 dark:border-gray-700 dark:bg-gray-900"
                                value={warehouseName}
                                onChange={(e) =>
                                    setWarehouseName(e.target.value)
                                }
                                placeholder="e.g., Milk 1L"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1 block text-xs text-muted-foreground">
                                Purchase Price
                            </label>
                            <input
                                type="number"
                                inputMode="decimal"
                                className="w-full rounded-md border border-gray-300 bg-white p-2 dark:border-gray-700 dark:bg-gray-900"
                                value={purchasePrice}
                                onChange={(e) =>
                                    setPurchasePrice(e.target.value)
                                }
                                placeholder="0.00"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs text-muted-foreground">
                                Shelf-life (days)
                            </label>
                            <input
                                type="number"
                                inputMode="numeric"
                                className="w-full rounded-md border border-gray-300 bg-white p-2 dark:border-gray-700 dark:bg-gray-900"
                                value={shelfLifeDays}
                                onChange={(e) =>
                                    setShelfLifeDays(e.target.value)
                                }
                                placeholder="0"
                            />
                        </div>
                    </div>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="mb-1 block text-xs text-muted-foreground">
                            Low Stock Warning (units)
                        </label>
                        <input
                            type="number"
                            inputMode="numeric"
                            className="w-full rounded-md border border-gray-300 bg-white p-2 dark:border-gray-700 dark:bg-gray-900"
                            value={lowStockQty}
                            onChange={(e) => setLowStockQty(e.target.value)}
                            placeholder="0"
                        />
                    </div>
                    <div>
                        <h3 className="mb-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                            Ingredients
                        </h3>
                        <div className="space-y-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                                <div className="flex-1">
                                    <label className="mb-1 block text-xs text-muted-foreground">
                                        Ingredient
                                    </label>
                                    <select
                                        className="w-full rounded-md border border-gray-300 bg-white p-2 dark:border-gray-700 dark:bg-gray-900"
                                        value={ingredientItem}
                                        onChange={(e) =>
                                            setIngredientItem(e.target.value)
                                        }
                                    >
                                        <option value="">
                                            Select ingredient...
                                        </option>
                                        {availableIngredients.map((ing) => (
                                            <option
                                                key={ing.name}
                                                value={ing.name}
                                            >
                                                {ing.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="w-full sm:w-28">
                                    <label className="mb-1 block text-xs text-muted-foreground">
                                        Qty
                                    </label>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        className="w-full rounded-md border border-gray-300 bg-white p-2 dark:border-gray-700 dark:bg-gray-900"
                                        value={ingredientQty}
                                        onChange={(e) =>
                                            setIngredientQty(e.target.value)
                                        }
                                        placeholder="0"
                                    />
                            </div>
                            <div className="min-w-[80px] text-xs text-gray-600 dark:text-gray-400">
                                {(ingredientItem &&
                                    availableIngredients.find(
                                        (ing) => ing.name === ingredientItem
                                    )?.packageUnits) ||
                                    ''}
                            </div>
                            <button
                                onClick={onAddIngredient}
                                className="rounded-md border border-gray-300 bg-gray-900 px-3 py-2 text-xs text-white dark:border-gray-700 dark:bg-white dark:text-gray-900"
                            >
                                Add
                            </button>
                        </div>

                        <div className="flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    if (addingIngredient) {
                                        onCancelCreateIngredient()
                                    } else {
                                        setAddingIngredient(true)
                                        setIngredientError(null)
                                    }
                                }}
                                className="self-start text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                            >
                                {addingIngredient
                                    ? 'Cancel new ingredient'
                                    : 'Add a new ingredient'}
                            </button>
                            {addingIngredient ? (
                                <div className="space-y-3 rounded-md border border-gray-200 p-3 dark:border-gray-800">
                                    {ingredientError ? (
                                        <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                                            {ingredientError}
                                        </p>
                                    ) : null}
                                    <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
                                        <div className="sm:col-span-1">
                                            <label className="mb-1 block text-xs text-muted-foreground">
                                                Name
                                            </label>
                                            <input
                                                value={newIngredientName}
                                                onChange={(e) =>
                                                    setNewIngredientName(
                                                        e.target.value
                                                    )
                                                }
                                                placeholder="Flour"
                                                className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                                            />
                                        </div>
                                        <div className="sm:col-span-1">
                                            <label className="mb-1 block text-xs text-muted-foreground">
                                                Package Units (optional)
                                            </label>
                                            <input
                                                value={newIngredientUnits}
                                                onChange={(e) =>
                                                    setNewIngredientUnits(
                                                        e.target.value
                                                    )
                                                }
                                                placeholder="kg, ml…"
                                                className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                                            />
                                        </div>
                                        <div className="sm:col-span-1">
                                            <label className="mb-1 block text-xs text-muted-foreground">
                                                Total Volume (optional)
                                            </label>
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                value={newIngredientVolume}
                                                onChange={(e) =>
                                                    setNewIngredientVolume(
                                                        e.target.value
                                                    )
                                                }
                                                placeholder="0"
                                                className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={onCreateIngredient}
                                            className="rounded-md border border-gray-300 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white dark:border-gray-700 dark:bg-white dark:text-gray-900"
                                        >
                                            Save ingredient
                                        </button>
                                        <span className="text-xs text-muted-foreground">
                                            Saved ingredients stay local for
                                            this tenant.
                                        </span>
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        {selectedIngredients.length > 0 && (
                            <div className="rounded-md border border-gray-200 dark:border-gray-800">
                                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                                        {selectedIngredients.map((ing) => (
                                            <div
                                                key={ing.name}
                                                className="flex items-center justify-between p-2"
                                            >
                                                <span className="text-sm text-gray-900 dark:text-gray-100">
                                                    {ing.name}
                                                </span>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                                        {ing.qty}{' '}
                                                        {availableIngredients.find(
                                                            (i) =>
                                                                i.name ===
                                                                ing.name
                                                        )?.packageUnits || ''}
                                                    </span>
                                                    <button
                                                        onClick={() =>
                                                            onRemoveIngredient(
                                                                ing.name
                                                            )
                                                        }
                                                        className="text-xs text-red-600 hover:text-red-700 dark:text-red-400"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <InventoryOptionsEditor
                        enabled={optionsEnabled}
                        options={optionGroups}
                        onEnabledChange={setOptionsEnabled}
                        onOptionsChange={setOptionGroups}
                        ingredientsCatalog={availableIngredients}
                        onError={setError}
                    />
                </div>
            </div>

            <div className="flex items-center gap-3">
                <button
                    onClick={() => router.back()}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
                >
                    Cancel
                </button>
                <button
                    onClick={onSave}
                    disabled={saving}
                    className="rounded-md border border-gray-300 bg-gray-900 px-3 py-1.5 text-sm text-white dark:border-gray-700 dark:bg-white dark:text-gray-900 disabled:opacity-60"
                >
                    {saving ? 'Saving…' : 'Save Item'}
                </button>
            </div>
        </div>
    )
}
