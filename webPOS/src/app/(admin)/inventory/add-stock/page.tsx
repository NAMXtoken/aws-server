'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/uiz/use-toast'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/uiz/table'
import { broadcastUpdate, useRealtime } from '@/hooks/use-realtime'

type IngredientRow = {
    name: string
    package: string
    packageVolume: number
    packageUnits: string
    addedStock: number
    totalVolume: number
}

type IngredientsResponse =
    | {
          ok?: boolean
          items?: any[]
          error?: string
      }
    | IngredientRow[]

export default function AddStockPage() {
    const { toast } = useToast()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [rows, setRows] = useState<IngredientRow[]>([])
    const [inputs, setInputs] = useState<Record<string, string>>({})
    const [saving, setSaving] = useState<string | null>(null)

    const normalizeIngredients = useCallback(
        (payload: IngredientsResponse): IngredientRow[] => {
            const source = Array.isArray(payload)
                ? payload
                : Array.isArray(payload?.items)
                  ? payload.items
                  : []
            return source
                .map((row): IngredientRow | null => {
                    const name = String(row?.name ?? '').trim()
                    if (!name) return null
                    return {
                        name,
                        package: String(row?.package ?? ''),
                        packageVolume: Number(row?.packageVolume ?? 0) || 0,
                        packageUnits: String(row?.packageUnits ?? ''),
                        addedStock:
                            Number(
                                row?.addedStock ?? row?.packagesStock ?? 0
                            ) || 0,
                        totalVolume: Number(row?.totalVolume ?? 0) || 0,
                    }
                })
                .filter((row): row is IngredientRow => row !== null)
                .sort((a, b) => a.name.localeCompare(b.name))
        },
        []
    )

    const loadIngredients = useCallback(
        async (options?: { silent?: boolean }) => {
            if (!options?.silent) {
                setLoading(true)
                setError(null)
            }
            try {
                const res = await fetch(`/api/gas?action=ingredients`, {
                    cache: 'no-store',
                })
                const data = await res.json().catch(() => ({}))
                if (!res.ok || data?.ok === false) {
                    throw new Error(
                        data?.error ||
                            `Failed to load ingredients (${res.status})`
                    )
                }
                const normalized = normalizeIngredients(data)
                setRows(normalized)
                setInputs((prev) => {
                    const next: Record<string, string> = {}
                    for (const row of normalized) {
                        if (prev[row.name] != null)
                            next[row.name] = prev[row.name]
                    }
                    return next
                })
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err)
                if (!options?.silent) setError(message)
                else
                    toast({
                        title: 'Refresh failed',
                        description: message,
                        variant: 'destructive',
                    })
            } finally {
                if (!options?.silent) setLoading(false)
            }
        },
        [normalizeIngredients, toast]
    )

    useEffect(() => {
        void loadIngredients()
    }, [loadIngredients])

    const handleRealtimeRefresh = useCallback(() => {
        void loadIngredients({ silent: true })
    }, [loadIngredients])

    useRealtime({ onInventory: handleRealtimeRefresh })

    const onChange = useCallback((name: string, value: string) => {
        setInputs((prev) => ({ ...prev, [name]: value }))
    }, [])

    const onAdd = useCallback(
        async (row: IngredientRow) => {
            const raw = inputs[row.name]
            const qty = Number(raw)
            if (!Number.isFinite(qty) || qty <= 0) {
                toast({
                    title: 'Enter a valid quantity',
                    description: 'Purchase In must be greater than zero.',
                    variant: 'destructive',
                })
                return
            }
            setSaving(row.name)
            try {
                const res = await fetch('/api/gas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'addIngredientStock',
                        name: row.name,
                        amount: qty,
                    }),
                })
                const data = await res.json().catch(() => ({}))
                if (!res.ok || data?.ok === false) {
                    throw new Error(
                        data?.error || `Failed to record stock (${res.status})`
                    )
                }
                const updatedAdded =
                    Number(data?.addedStock ?? data?.newAddedStock) || 0
                const updatedTotal =
                    Number(data?.totalVolume ?? data?.newTotalVolume) ||
                    row.totalVolume
                setRows((prev) =>
                    prev.map((item) =>
                        item.name === row.name
                            ? {
                                  ...item,
                                  addedStock:
                                      updatedAdded > 0
                                          ? updatedAdded
                                          : item.addedStock + qty,
                                  totalVolume: updatedTotal,
                              }
                            : item
                    )
                )
                setInputs((prev) => ({ ...prev, [row.name]: '' }))
                toast({
                    title: 'Stock recorded',
                    description: `${qty} added to ${row.name}`,
                })
                broadcastUpdate('inventory')
                await loadIngredients({ silent: true })
            } catch (err) {
                toast({
                    title: 'Add stock failed',
                    description:
                        err instanceof Error ? err.message : String(err),
                    variant: 'destructive',
                })
            } finally {
                setSaving(null)
            }
        },
        [inputs, loadIngredients, toast]
    )

    const hasRows = rows.length > 0

    const tableBody = useMemo(() => {
        if (!hasRows) {
            return (
                <TableRow>
                    <TableCell
                        colSpan={8}
                        className="py-8 text-center text-sm text-gray-500"
                    >
                        {loading
                            ? 'Loading ingredients...'
                            : 'No ingredients found in Sheets.'}
                    </TableCell>
                </TableRow>
            )
        }
        return rows.map((row) => (
            <TableRow key={row.name}>
                <TableCell>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                        {row.name}
                    </span>
                </TableCell>
                <TableCell>{row.package || '-'}</TableCell>
                <TableCell>{row.packageVolume || 0}</TableCell>
                <TableCell>{row.packageUnits || '-'}</TableCell>
                <TableCell>{row.addedStock || 0}</TableCell>
                <TableCell>{row.totalVolume || 0}</TableCell>
                <TableCell>
                    <input
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        className="w-32 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm outline-none dark:border-gray-700 dark:bg-gray-900"
                        value={inputs[row.name] ?? ''}
                        onChange={(e) => onChange(row.name, e.target.value)}
                        placeholder="0"
                    />
                </TableCell>
                <TableCell className="text-right">
                    <button
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 disabled:opacity-50"
                        onClick={() => onAdd(row)}
                        disabled={saving === row.name}
                    >
                        {saving === row.name ? 'Saving...' : 'Add'}
                    </button>
                </TableCell>
            </TableRow>
        ))
    }, [hasRows, inputs, loading, onAdd, onChange, rows, saving])

    return (
        <div className="py-4 sm:py-6">
            <div className="mb-4">
                <h1 className="text-lg font-semibold">
                    Inventory Management / Add Stock
                </h1>
                <p className="text-sm text-gray-500">
                    Review ingredient packages and record additional quantities
                    received.
                </p>
            </div>
            {error ? (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">
                    {error}
                </div>
            ) : null}
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[20%]">
                                Ingredient
                            </TableHead>
                            <TableHead>Package</TableHead>
                            <TableHead>Package Volume</TableHead>
                            <TableHead>Package Units</TableHead>
                            <TableHead>Added Stock</TableHead>
                            <TableHead>Total Volume</TableHead>
                            <TableHead>Purchase In</TableHead>
                            <TableHead className="w-[8rem] text-right">
                                Action
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>{tableBody}</TableBody>
                </Table>
            </div>
        </div>
    )
}
