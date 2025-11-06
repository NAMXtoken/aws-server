'use client'

import { useEffect, useMemo, useState } from 'react'
import { uploadReceiptToDrive } from '@/lib/attachments'
import { broadcastUpdate } from '@/hooks/use-realtime'
import { syncMenuFromRemote } from '@/lib/local-catalog'

type MenuRow = {
    id: string
    name: string
    price?: number
    category?: string
    imageUrl?: string
    _origName?: string
    _origCategory?: string
}

type Category = { id: string; label: string; value: string }

export default function MenuSettingsPage() {
    const [items, setItems] = useState<MenuRow[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [uploadingId, setUploadingId] = useState<string | null>(null)
    const [savingId, setSavingId] = useState<string | null>(null)
    const [categories, setCategories] = useState<Category[]>([])

    useEffect(() => {
        const load = async () => {
            setLoading(true)
            setError(null)
            try {
                const [menuRes, catRes] = await Promise.all([
                    fetch(`/api/gas?action=menu`, { cache: 'no-store' }),
                    fetch(`/api/gas?action=categories`, { cache: 'no-store' }),
                ])
                const menuPayload = await menuRes.json().catch(() => [])
                const catPayload = await catRes.json().catch(() => [])
                const arr: any[] = Array.isArray(menuPayload)
                    ? menuPayload
                    : menuPayload?.items || []
                const mapped: MenuRow[] = (arr || []).map((r) => ({
                    id: String(r.id ?? r.sku ?? r.code ?? r.name ?? ''),
                    name: String(r.name ?? r.title ?? r.item ?? ''),
                    price: Number(r.price ?? r.unitPrice ?? 0) || 0,
                    category: r.category ? String(r.category) : '',
                    imageUrl: String(r.image ?? r.photo ?? r.imageUrl ?? ''),
                    _origName: String(r.name ?? r.title ?? r.item ?? ''),
                    _origCategory: r.category ? String(r.category) : '',
                }))
                setItems(mapped)
                const cArr: any[] = Array.isArray(catPayload)
                    ? catPayload
                    : catPayload?.items || []
                const cats: Category[] = (cArr || []).map((c) => ({
                    id: String(c.id || c.value || c.label || ''),
                    label: String(c.label || c.value || c.id || ''),
                    value: String(c.value || c.label || c.id || ''),
                }))
                setCategories(cats)
            } catch (e) {
                setError(String((e as Error)?.message || e))
            } finally {
                setLoading(false)
            }
        }
        void load()
    }, [])

    const onUpload = async (id: string, file: File | undefined) => {
        if (!file) return
        try {
            setUploadingId(id)
            const result = await uploadReceiptToDrive(file, 'menu')
            if (!result.ok) throw new Error(result.error || 'Upload failed')
            const url = result.url || ''
            setItems((prev) =>
                prev.map((it) => (it.id === id ? { ...it, imageUrl: url } : it))
            )
            // Persist URL to sheet (GAS handler)
            const match = items.find((i) => i.id === id)
            await fetch('/api/gas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'setMenuImage',
                    id,
                    url,
                    matchName: match?._origName || match?.name,
                    matchCategory:
                        match?._origCategory || match?.category || '',
                }),
            }).catch(() => undefined)
            try {
                await syncMenuFromRemote({
                    ignoreBootstrap: true,
                })
            } catch {}
            try {
                broadcastUpdate('inventory')
            } catch {}
        } catch (e) {
            setError(String((e as Error)?.message || e))
        } finally {
            setUploadingId(null)
        }
    }

    const onFieldChange = (
        id: string,
        field: keyof Pick<MenuRow, 'name' | 'price' | 'category'>,
        value: string
    ) => {
        setItems((prev) =>
            prev.map((it) =>
                it.id === id
                    ? {
                          ...it,
                          [field]:
                              field === 'price' ? Number(value) || 0 : value,
                      }
                    : it
            )
        )
    }

    const onSave = async (id: string) => {
        const row = items.find((i) => i.id === id)
        if (!row) return
        try {
            setSavingId(id)
            const payload = {
                action: 'saveMenuItem',
                id,
                name: row.name,
                price: Number(row.price || 0),
                category: row.category || '',
                matchName: row._origName || row.name,
                matchCategory: row._origCategory || row.category || '',
            }
            const res = await fetch('/api/gas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok || json?.ok === false)
                throw new Error(String(json?.error || res.statusText))
            try {
                await syncMenuFromRemote({
                    ignoreBootstrap: true,
                })
            } catch {}
            try {
                broadcastUpdate('inventory')
            } catch {}
        } catch (e) {
            setError(String((e as Error)?.message || e))
        } finally {
            setSavingId(null)
        }
    }

    return (
        <div className="space-y-6 py-4 sm:py-6">
            <header className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">
                    Menu Settings
                </h1>
                <p className="text-sm text-muted-foreground">
                    Manage menu items from the Sheet and attach images.
                </p>
            </header>

            {error ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                    {error}
                </div>
            ) : null}

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 dark:border-gray-800 dark:bg-transparent dark:text-gray-200">
                    Current Menu Items
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="border-b border-gray-200 bg-white text-left text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                            <tr>
                                <th className="px-4 py-2">Name</th>
                                <th className="px-4 py-2">Price</th>
                                <th className="px-4 py-2">Category</th>
                                <th className="px-4 py-2">Image</th>
                                <th className="px-4 py-2">Upload</th>
                                <th className="px-4 py-2">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                            {loading ? (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="px-4 py-6 text-center text-gray-500 dark:text-gray-400"
                                    >
                                        Loading…
                                    </td>
                                </tr>
                            ) : items.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="px-4 py-6 text-center text-gray-500 dark:text-gray-400"
                                    >
                                        No items found.
                                    </td>
                                </tr>
                            ) : (
                                items.map((it) => (
                                    <tr key={it.id}>
                                        <td className="px-4 py-2 text-gray-900 dark:text-gray-100">
                                            <input
                                                className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
                                                value={it.name}
                                                onChange={(e) =>
                                                    onFieldChange(
                                                        it.id,
                                                        'name',
                                                        e.target.value
                                                    )
                                                }
                                            />
                                        </td>
                                        <td className="px-4 py-2 text-gray-700 dark:text-gray-200">
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                className="w-28 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
                                                value={Number(it.price || 0)}
                                                onChange={(e) =>
                                                    onFieldChange(
                                                        it.id,
                                                        'price',
                                                        e.target.value
                                                    )
                                                }
                                            />
                                        </td>
                                        <td className="px-4 py-2 text-gray-700 dark:text-gray-200">
                                            <select
                                                className="min-w-40 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
                                                value={it.category || ''}
                                                onChange={(e) =>
                                                    onFieldChange(
                                                        it.id,
                                                        'category',
                                                        e.target.value
                                                    )
                                                }
                                            >
                                                <option value="">
                                                    Select…
                                                </option>
                                                {categories.map((c) => (
                                                    <option
                                                        key={c.id}
                                                        value={c.value}
                                                    >
                                                        {c.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="px-4 py-2">
                                            {it.imageUrl ? (
                                                <a
                                                    href={it.imageUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-primary underline"
                                                >
                                                    View
                                                </a>
                                            ) : (
                                                <span className="text-gray-400">
                                                    —
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2">
                                            <label className="inline-flex items-center gap-2 text-xs">
                                                <span className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700 cursor-pointer">
                                                    {uploadingId === it.id
                                                        ? 'Uploading…'
                                                        : 'Upload Image'}
                                                </span>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={(e) =>
                                                        onUpload(
                                                            it.id,
                                                            e.target.files?.[0]
                                                        )
                                                    }
                                                    disabled={
                                                        uploadingId === it.id
                                                    }
                                                />
                                            </label>
                                        </td>
                                        <td className="px-4 py-2">
                                            <button
                                                className="rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-700"
                                                onClick={() => onSave(it.id)}
                                                disabled={savingId === it.id}
                                            >
                                                {savingId === it.id
                                                    ? 'Saving…'
                                                    : 'Save'}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
