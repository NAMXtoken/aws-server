'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
    getInventoryItemLocal,
    upsertInventoryItemLocal,
    upsertUnitLocal,
} from '@/lib/local-inventory'
import {
    invalidateMenuCache,
    listCategories as listCachedCategories,
    syncMenuFromRemote,
} from '@/lib/local-catalog'
import { broadcastUpdate } from '@/hooks/use-realtime'
import { uploadReceiptToDrive } from '@/lib/attachments'
import { InventoryOptionsEditor } from '@/components/inventory/InventoryOptionsEditor'
import {
    InventoryOptionGroup,
    normalizeOptionGroups,
    parseInventoryOptions,
    serializeInventoryOptions,
    validateOptionGroups,
} from '@/lib/inventory-options'
import { useTenant } from '@/context/TenantContext'
import {
    listCachedIngredients,
    refreshIngredientsFromRemote,
} from '@/lib/local-ingredients'

export default function EditInventoryItemPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()
    const id = decodeURIComponent(params.id)

    const [loading, setLoading] = useState(true)
    const [imageUrl, setImageUrl] = useState('')
    // Menu fields
    const [menuName, setMenuName] = useState('')
    const [menuPrice, setMenuPrice] = useState('')
    const [categories, setCategories] = useState<
        Array<{ id: string; label: string; value: string }>
    >([])
    const [category, setCategory] = useState('')
    const [initialCategory, setInitialCategory] = useState('')
    // Warehouse fields
    const [warehouseName, setWarehouseName] = useState('')
    const [purchasePrice, setPurchasePrice] = useState('')
    const [shelfLifeDays, setShelfLifeDays] = useState('')
    // Units
    const [purchasedUnit, setPurchasedUnit] = useState('')
    const [consumeUnit, setConsumeUnit] = useState('')
    const [volume, setVolume] = useState('')
    // Alerts
    const [lowStockQty, setLowStockQty] = useState('')
    const [saving, setSaving] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // Ingredients
    const [ingredients, setIngredients] = useState<
        Array<{ name: string; packageUnits: string; totalVolume: number }>
    >([])
    const [selectedIngredients, setSelectedIngredients] = useState<
        Array<{ name: string; qty: number }>
    >([])
    const [ingredientItem, setIngredientItem] = useState('')
    const [ingredientQty, setIngredientQty] = useState('')
    const [optionGroups, setOptionGroups] = useState<InventoryOptionGroup[]>([])
    const [optionsEnabled, setOptionsEnabled] = useState(false)
    const { tenant, loading: tenantLoading } = useTenant()

    useEffect(() => {
        if (tenantLoading) return
        let active = true
        if (!tenant) {
            setCategories([])
            setIngredients([])
            setLoading(false)
            return
        }
        setLoading(true)

        const loadLocalRow = async () => {
            try {
                const localRow = await getInventoryItemLocal(id)
                if (!active) return null
                if (localRow) {
                    setImageUrl(localRow.image || '')
                    setMenuName(localRow.menuName || '')
                    setMenuPrice(String(localRow.menuPrice ?? ''))
                    setWarehouseName(localRow.warehouseName || '')
                    setPurchasePrice(String(localRow.purchasePrice ?? ''))
                    setShelfLifeDays(String(localRow.shelfLifeDays ?? ''))
                    setPurchasedUnit(localRow.purchasedUnit || '')
                    setConsumeUnit(localRow.consumeUnit || '')
                    setVolume(String(localRow.volume ?? ''))
                    setLowStockQty(String(localRow.lowStockQty ?? ''))

                    if (localRow.ingredients) {
                        try {
                            const parsed = JSON.parse(localRow.ingredients)
                            if (Array.isArray(parsed))
                                setSelectedIngredients(parsed)
                        } catch (err) {
                            console.error(
                                'Failed to parse ingredients from local storage:',
                                err
                            )
                        }
                    }

                    if (localRow.options) {
                        const parsedOptions = parseInventoryOptions(
                            localRow.options
                        )
                        setOptionGroups(parsedOptions)
                        setOptionsEnabled(parsedOptions.length > 0)
                    } else {
                        setOptionGroups([])
                        setOptionsEnabled(false)
                    }

                    if (localRow.category) {
                        setCategory(localRow.category)
                        setInitialCategory(localRow.category)
                    }
                }
                return localRow
            } catch (err) {
                console.error('Failed to load local inventory row', err)
                return null
            }
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
            } catch (err) {
                console.warn('Failed to load cached categories', err)
            }
        }

        const applyCachedIngredients = async () => {
            try {
                const cached = await listCachedIngredients().catch(() => [])
                if (!active || !cached.length) return
                setIngredients(
                    cached.map((item) => ({
                        name: item.name,
                        packageUnits: item.packageUnits,
                        totalVolume: item.totalVolume,
                    }))
                )
            } catch (err) {
                console.warn('Failed to load cached ingredients', err)
            }
        }

        const refreshRemoteData = async (
            localRow: Awaited<ReturnType<typeof getInventoryItemLocal>> | null
        ) => {
            let inferredCategory = localRow?.category || ''
            try {
                const catRes = await fetch('/api/gas?action=categories', {
                    cache: 'no-store',
                })
                const catData = await catRes.json().catch(() => ({}))
                const rawCats = Array.isArray(catData)
                    ? catData
                    : Array.isArray(catData?.items)
                      ? catData.items
                      : []
                if (!active) return
                const mapped = rawCats
                    .map((item: any) => {
                        const value = String(
                            item?.value ??
                                item?.slug ??
                                item?.label ??
                                item?.name ??
                                ''
                        ).trim()
                        const label = String(
                            item?.label ?? item?.name ?? value
                        ).trim()
                        const mappedId = String(
                            (item?.id ?? value) || label
                        ).trim()
                        if (!label) return null
                        return {
                            id: mappedId || value || label,
                            label,
                            value: value || label,
                        }
                    })
                    .filter(Boolean) as Array<{
                    id: string
                    label: string
                    value: string
                }>
                if (!active) return
                if (!inferredCategory && localRow?.category) {
                    const matched = mapped.find(
                        (cat) =>
                            cat.id === localRow.category ||
                            cat.value === localRow.category
                    )
                    inferredCategory = matched ? matched.value : ''
                }
                setCategories(mapped)
            } catch (err) {
                console.error('Failed to load categories:', err)
            }

            try {
                const remoteIngredients = await refreshIngredientsFromRemote()
                if (!active || remoteIngredients === null) return
                setIngredients(
                    remoteIngredients.map((item) => ({
                        name: item.name,
                        packageUnits: item.packageUnits,
                        totalVolume: item.totalVolume,
                    }))
                )
            } catch (err) {
                console.error('Failed to load ingredients:', err)
            }

            try {
                const menuRes = await fetch('/api/gas?action=menu', {
                    cache: 'no-store',
                })
                const menuData = await menuRes.json()
                if (!active) return
                const rows = Array.isArray(menuData)
                    ? menuData
                    : Array.isArray(menuData?.items)
                      ? menuData.items
                      : []
                const match = rows.find(
                    (item: any) =>
                        String(item?.id || '').trim() === id ||
                        String(item?.matchId || '').trim() === id
                )
                if (match) {
                    const parsedPrice = Number(match.price || 0)
                    const nextMenuName = String(match.name || '')
                    const nextImage = String(match.image || '')
                    const nextCategory =
                        String(match.category || '').trim() ||
                        inferredCategory ||
                        localRow?.category ||
                        ''
                    if (nextImage) setImageUrl(nextImage)
                    if (nextMenuName) setMenuName(nextMenuName)
                    setMenuPrice(
                        Number.isFinite(parsedPrice) ? String(parsedPrice) : ''
                    )
                    if (nextCategory) {
                        setCategory(nextCategory)
                        setInitialCategory((prev) => prev || nextCategory)
                    }
                    if (match.ingredients) {
                        try {
                            const parsed = JSON.parse(match.ingredients)
                            if (Array.isArray(parsed)) {
                                setSelectedIngredients(parsed)
                            }
                        } catch (err) {
                            console.error(
                                'Failed to parse remote ingredients:',
                                err
                            )
                        }
                    }
                    if (typeof match.options === 'string' && match.options) {
                        try {
                            const parsedOptions = parseInventoryOptions(
                                match.options
                            )
                            setOptionGroups(parsedOptions)
                            setOptionsEnabled(parsedOptions.length > 0)
                        } catch (err) {
                            console.error('Failed to parse menu options:', err)
                        }
                    }
                    await upsertInventoryItemLocal({
                        id,
                        image: nextImage || localRow?.image || '',
                        menuName: nextMenuName || localRow?.menuName || '',
                        menuPrice: Number.isFinite(parsedPrice)
                            ? parsedPrice
                            : localRow?.menuPrice || 0,
                        warehouseName:
                            match.warehouseName ||
                            localRow?.warehouseName ||
                            '',
                        purchasePrice:
                            Number(
                                match.purchasePrice ??
                                    localRow?.purchasePrice ??
                                    0
                            ) || 0,
                        shelfLifeDays:
                            Number(
                                match.shelfLifeDays ??
                                    localRow?.shelfLifeDays ??
                                    0
                            ) || 0,
                        purchasedUnit:
                            match.purchasedUnit ||
                            localRow?.purchasedUnit ||
                            '',
                        consumeUnit:
                            match.consumeUnit || localRow?.consumeUnit || '',
                        volume:
                            Number(match.volume ?? localRow?.volume ?? 0) || 0,
                        lowStockQty:
                            Number(
                                match.lowStockQty ?? localRow?.lowStockQty ?? 0
                            ) || 0,
                        ingredients:
                            typeof match.ingredients === 'string'
                                ? match.ingredients
                                : localRow?.ingredients || '',
                        options:
                            typeof match.options === 'string'
                                ? match.options
                                : localRow?.options || '',
                        category: nextCategory,
                    })
                    await upsertUnitLocal({
                        id,
                        unit: match.consumeUnit || localRow?.consumeUnit || '',
                        package:
                            match.purchasedUnit ||
                            localRow?.purchasedUnit ||
                            '',
                        unitsPerPackage:
                            Number(match.volume ?? localRow?.volume ?? 0) || 0,
                    })
                }
            } catch (err) {
                console.error('Failed to load menu items:', err)
            }
        }

        ;(async () => {
            const localRow = await loadLocalRow()
            await applyCachedCategories()
            await applyCachedIngredients()
            if (active) setLoading(false)
            if (!active) return
            void refreshRemoteData(localRow)
        })()

        return () => {
            active = false
        }
    }, [id, tenant, tenantLoading])

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

            // Sync image to Google Sheets (Menu tab)
            try {
                const row = await getInventoryItemLocal(id)
                await fetch('/api/gas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'setMenuImage',
                        id,
                        url,
                        matchName: row?.menuName || menuName,
                        matchCategory: (category || '').trim(),
                    }),
                })
            } catch (syncErr) {
                console.warn('Failed to sync image to Google Sheets:', syncErr)
            }
        } catch (err) {
            setError(String((err as Error)?.message || err))
        } finally {
            setUploading(false)
        }
    }

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

        // Check if ingredient already added
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

    const onSave = async () => {
        const existingRow = await getInventoryItemLocal(id)
        const safeMenuName = menuName.trim() || existingRow?.menuName || ''
        if (!safeMenuName) {
            setError('Menu Name is required')
            return
        }
        const fallbackCategory = initialCategory.trim()
        const safeCategory = category.trim() || fallbackCategory
        if (categories.length > 0 && !safeCategory) {
            setError('Category is required')
            return
        }
        const parseNumberOr = (value: string, fallback: number): number => {
            const trimmed = value.trim()
            if (trimmed === '') return fallback
            const parsed = Number(trimmed)
            return Number.isFinite(parsed) ? parsed : fallback
        }
        const safeImage = imageUrl || existingRow?.image || ''
        const safeMenuPrice = parseNumberOr(
            menuPrice,
            existingRow?.menuPrice ?? 0
        )
        const safePurchasePrice = parseNumberOr(
            purchasePrice,
            existingRow?.purchasePrice ?? 0
        )
        const safeShelfLife = parseNumberOr(
            shelfLifeDays,
            existingRow?.shelfLifeDays ?? 0
        )
        const safeLowStock = parseNumberOr(
            lowStockQty,
            existingRow?.lowStockQty ?? 0
        )
        const safeVolume = parseNumberOr(volume, existingRow?.volume ?? 0)
        const safeWarehouseName =
            warehouseName.trim() || existingRow?.warehouseName || ''
        const safePurchasedUnit =
            purchasedUnit.trim() || existingRow?.purchasedUnit || ''
        const safeConsumeUnit =
            consumeUnit.trim() || existingRow?.consumeUnit || ''

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

            setMenuName(safeMenuName)
            setMenuPrice(String(safeMenuPrice))
            setWarehouseName(safeWarehouseName)
            setPurchasePrice(String(safePurchasePrice))
            setShelfLifeDays(String(safeShelfLife))
            setLowStockQty(String(safeLowStock))
            setCategory(safeCategory)
            setPurchasedUnit(safePurchasedUnit)
            setConsumeUnit(safeConsumeUnit)
            setVolume(String(safeVolume))
            if (safeCategory) {
                setInitialCategory((prev) => prev || safeCategory)
            }

            // Save to local IndexedDB
            await upsertInventoryItemLocal({
                id,
                image: safeImage,
                menuName: safeMenuName,
                menuPrice: safeMenuPrice,
                category: safeCategory,
                warehouseName: safeWarehouseName,
                purchasePrice: safePurchasePrice,
                shelfLifeDays: safeShelfLife,
                purchasedUnit: safePurchasedUnit,
                consumeUnit: safeConsumeUnit,
                volume: safeVolume,
                lowStockQty: safeLowStock,
                ingredients: JSON.stringify(selectedIngredients),
                options: optionsPayload,
            })
            await upsertUnitLocal({
                id,
                unit: safeConsumeUnit,
                package: safePurchasedUnit,
                unitsPerPackage: safeVolume,
            })

            router.replace('/inventory/set-stock')

            // Sync to Google Sheets (Menu tab) in the background
            ;(async () => {
                try {
                    const row = await getInventoryItemLocal(id)
                    const resp = await fetch('/api/gas', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'saveMenuItem',
                            id,
                            name: safeMenuName,
                            description: '', // Can be added to the form later if needed
                            price: safeMenuPrice,
                            category: safeCategory,
                            purchasePrice: safePurchasePrice,
                            warehouseName: safeWarehouseName,
                            shelfLifeDays: safeShelfLife,
                            purchasedUnit: safePurchasedUnit,
                            consumeUnit: safeConsumeUnit,
                            volume: safeVolume,
                            lowStockQty: safeLowStock,
                            ingredients: JSON.stringify(selectedIngredients),
                            options: optionsPayload,
                            matchName:
                                row?.menuName ||
                                existingRow?.menuName ||
                                safeMenuName,
                            matchCategory: fallbackCategory || safeCategory,
                            image: safeImage,
                        }),
                    })
                    if (!resp.ok) {
                        throw new Error('Failed to sync menu item')
                    }
                    await invalidateMenuCache()
                    await syncMenuFromRemote({
                        ignoreBootstrap: true,
                    })
                    try {
                        broadcastUpdate('inventory')
                    } catch {
                        /* noop */
                    }
                } catch (syncErr) {
                    console.warn('Failed to sync to Google Sheets:', syncErr)
                }
            })()
        } catch (err) {
            setError(String((err as Error)?.message || err))
        } finally {
            setSaving(false)
        }
    }

    if (loading)
        return (
            <div className="py-4 sm:py-6 text-sm text-gray-500">Loading…</div>
        )

    return (
        <div className="space-y-6 py-4 sm:py-6">
            <header className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">
                    Edit Inventory Item
                </h1>
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
                    <div>
                        <label className="mb-1 block text-xs text-muted-foreground">
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
                            <div className="flex items-end gap-3">
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
                                        {ingredients.map((ing) => (
                                            <option
                                                key={ing.name}
                                                value={ing.name}
                                            >
                                                {ing.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="w-24">
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
                                <div className="flex items-center text-xs text-gray-600 dark:text-gray-400 min-w-[60px]">
                                    {(ingredientItem &&
                                        ingredients.find(
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
                                                        {ingredients.find(
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
                        ingredientsCatalog={ingredients}
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
                    className="rounded-md border border-gray-300 bg-gray-900 px-3 py-1.5 text-sm text-white dark:border-gray-700 dark:bg:white dark:text-gray-900 disabled:opacity-60"
                >
                    {saving ? 'Saving…' : 'Save Changes'}
                </button>
            </div>
        </div>
    )
}
