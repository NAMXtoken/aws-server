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
import {
    addRestockRecord,
    listInventoryItems,
    listRestockRecords,
    listUnits,
} from '@/lib/local-inventory'
import type { RestockRecord } from '@/types/db'

type StockRow = {
    id: string
    name: string
    packageLabel: string
    unitLabel: string
    unitsPerPackage: number
    lastRestock?: RestockRecord
}

export default function AddStockPage() {
    const { toast } = useToast()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [rows, setRows] = useState<StockRow[]>([])
    const [inputs, setInputs] = useState<Record<string, string>>({})
    const [savingId, setSavingId] = useState<string | null>(null)

    const loadRows = useCallback(
        async (options?: { silent?: boolean }) => {
            if (!options?.silent) {
                setLoading(true)
                setError(null)
            }
            try {
                const [units, inventoryItems, restocks] = await Promise.all([
                    listUnits(),
                    listInventoryItems(),
                    listRestockRecords(),
                ])
                const inventoryMap = new Map<string, string>()
                for (const item of inventoryItems) {
                    if (item.id) {
                        inventoryMap.set(item.id, item.menuName || item.id)
                    }
                }
                const restockMap = new Map<string, RestockRecord>()
                for (const record of restocks) {
                    if (!restockMap.has(record.itemId)) {
                        restockMap.set(record.itemId, record)
                    }
                }
                const normalized: StockRow[] = units
                    .filter((unit) => unit.id)
                    .map((unit) => ({
                        id: unit.id,
                        name: inventoryMap.get(unit.id) || unit.id,
                        packageLabel: unit.package || 'Package',
                        unitLabel: unit.unit || 'Unit',
                        unitsPerPackage: unit.unitsPerPackage || 0,
                        lastRestock: restockMap.get(unit.id),
                    }))
                    .sort((a, b) => a.name.localeCompare(b.name))
                setRows(normalized)
                setInputs((prev) => {
                    const next: Record<string, string> = {}
                    for (const row of normalized) {
                        if (prev[row.id] != null) next[row.id] = prev[row.id]
                    }
                    return next
                })
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err)
                if (!options?.silent) {
                    setError(message)
                } else {
                    toast({
                        title: 'Refresh failed',
                        description: message,
                        variant: 'destructive',
                    })
                }
            } finally {
                if (!options?.silent) setLoading(false)
            }
        },
        [toast]
    )

    useEffect(() => {
        void loadRows()
    }, [loadRows])

    useRealtime({ onInventory: () => void loadRows({ silent: true }) })

    const onChange = useCallback((id: string, value: string) => {
        setInputs((prev) => ({ ...prev, [id]: value }))
    }, [])

    const onAdd = useCallback(
        async (row: StockRow) => {
            const raw = inputs[row.id]
            const qty = Number(raw)
            if (!Number.isFinite(qty) || qty <= 0) {
                toast({
                    title: 'Enter a valid quantity',
                    description: 'Packages must be greater than zero.',
                    variant: 'destructive',
                })
                return
            }
            setSavingId(row.id)
            try {
                const record = await addRestockRecord({
                    id: row.id,
                    packages: qty,
                    extraUnits: 0,
                })
                setRows((prev) =>
                    prev.map((item) =>
                        item.id === row.id
                            ? { ...item, lastRestock: record }
                            : item
                    )
                )
                setInputs((prev) => ({ ...prev, [row.id]: '' }))
                toast({
                    title: 'Stock recorded',
                    description: `${qty} packages added to ${row.name}.`,
                })
                broadcastUpdate('inventory')
                await loadRows({ silent: true })
            } catch (err) {
                toast({
                    title: 'Add stock failed',
                    description:
                        err instanceof Error ? err.message : String(err),
                    variant: 'destructive',
                })
            } finally {
                setSavingId(null)
            }
        },
        [inputs, loadRows, toast]
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
                            ? 'Loading stock items...'
                            : 'No inventory units configured yet.'}
                    </TableCell>
                </TableRow>
            )
        }
        return rows.map((row) => (
            <TableRow key={row.id}>
                <TableCell>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                        {row.name}
                    </span>
                </TableCell>
                <TableCell>{row.packageLabel || '-'}</TableCell>
                <TableCell>{row.unitsPerPackage || 0}</TableCell>
                <TableCell>{row.unitLabel || '-'}</TableCell>
                <TableCell>{row.lastRestock?.packages ?? 0}</TableCell>
                <TableCell>{row.lastRestock?.totalUnits ?? 0}</TableCell>
                <TableCell>
                    <input
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        className="w-32 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm outline-none dark:border-gray-700 dark:bg-gray-900"
                        value={inputs[row.id] ?? ''}
                        onChange={(e) => onChange(row.id, e.target.value)}
                        placeholder="0"
                    />
                </TableCell>
                <TableCell className="text-right">
                    <button
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 disabled:opacity-50"
                        onClick={() => onAdd(row)}
                        disabled={savingId === row.id}
                    >
                        {savingId === row.id ? 'Saving…' : 'Add'}
                    </button>
                </TableCell>
            </TableRow>
        ))
    }, [hasRows, inputs, loading, onAdd, onChange, rows, savingId])

    return (
        <div className="py-4 sm:py-6">
            <header className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">
                    Add Stock
                </h1>
                <p className="text-sm text-muted-foreground">
                    Record additional packages for each inventory unit.
                </p>
            </header>

            {error ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                    {error}
                </div>
            ) : null}

            <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
                <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 dark:border-gray-800 dark:bg-transparent dark:text-gray-200">
                    Inventory Units
                </div>
                <Table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                    <TableHeader>
                        <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead>Package</TableHead>
                            <TableHead>Units / Package</TableHead>
                            <TableHead>Unit Label</TableHead>
                            <TableHead>Last Packages</TableHead>
                            <TableHead>Total Units</TableHead>
                            <TableHead>Packages to Add</TableHead>
                            <TableHead></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>{tableBody}</TableBody>
                </Table>
            </div>
        </div>
    )
}
