'use client'

import { useEffect, useMemo, useState } from 'react'

import Button from '@/components/ui/button/Button'
import {
    getStartingPettyForCurrentShift,
    setStartingPettyForCurrentShift,
    listPettyCashEntriesForCurrentShift,
    addPettyCashEntryForCurrentShift,
    getCurrentShift as dbGetCurrentShift,
} from '@/lib/local-pos'
import type { PettyCashEntry, PettyCashCategory } from '@/lib/local-pos'
import { uploadReceiptToDrive } from '@/lib/attachments'

const CURRENCY = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
})

export default function PettyCashPage() {
    const [startingPetty, setStartingPetty] = useState<number>(0)
    const [entries, setEntries] = useState<PettyCashEntry[]>([])
    const [loading, setLoading] = useState<boolean>(true)
    const [saving, setSaving] = useState<boolean>(false)
    const [posting, setPosting] = useState<boolean>(false)
    const [error, setError] = useState<string | null>(null)
    const [entryOpen, setEntryOpen] = useState<boolean>(false)
    const [entryCategory, setEntryCategory] =
        useState<PettyCashCategory>('expense')
    const [entryAmount, setEntryAmount] = useState<string>('')
    const [entryDesc, setEntryDesc] = useState<string>('')
    const [receiptUploading, setReceiptUploading] = useState<boolean>(false)
    const [receiptUrl, setReceiptUrl] = useState<string>('')
    const [receiptError, setReceiptError] = useState<string | null>(null)

    useEffect(() => {
        const loadLocal = async () => {
            setLoading(true)
            setError(null)
            try {
                const cur = await dbGetCurrentShift()
                if (!cur) throw new Error('No open shift')

                const petty = await getStartingPettyForCurrentShift()
                setStartingPetty(Number(petty?.startingPetty || 0) || 0)

                const { entries } = await listPettyCashEntriesForCurrentShift()
                setEntries(entries)
            } catch (e) {
                setError(String((e as Error)?.message || e))
            } finally {
                setLoading(false)
            }
        }
        void loadLocal()
    }, [])

    const saveStarting = async (value: number) => {
        try {
            setSaving(true)
            await setStartingPettyForCurrentShift(value)
            await reload()
        } catch (e) {
            setError(String((e as Error)?.message || e))
        } finally {
            setSaving(false)
        }
    }

    const reload = async () => {
        setLoading(true)
        setError(null)
        try {
            const petty = await getStartingPettyForCurrentShift()
            setStartingPetty(Number(petty?.startingPetty || 0) || 0)
            const { entries } = await listPettyCashEntriesForCurrentShift()
            setEntries(entries)
        } catch (e) {
            setError(String((e as Error)?.message || e))
        } finally {
            setLoading(false)
        }
    }

    const recordEntry = async () => {
        const amt = Number(entryAmount)
        if (!isFinite(amt) || amt === 0) {
            setError('Enter a non-zero amount for the entry.')
            return
        }
        if (!entryDesc.trim()) {
            setError('Please enter a description for this entry.')
            return
        }
        try {
            setPosting(true)
            await addPettyCashEntryForCurrentShift(
                entryCategory,
                amt,
                entryDesc,
                receiptUrl || undefined
            )
            setEntryAmount('')
            setEntryDesc('')
            setReceiptUrl('')
            await reload()
            setEntryOpen(false)
        } catch (e) {
            setError(String((e as Error)?.message || e))
        } finally {
            setPosting(false)
        }
    }

    const handleReceiptSelect: React.ChangeEventHandler<
        HTMLInputElement
    > = async (e) => {
        setReceiptError(null)
        const f = e.target.files?.[0]
        if (!f) return
        try {
            setReceiptUploading(true)
            const result = await uploadReceiptToDrive(f, 'petty-cash')
            if (!result.ok) {
                setReceiptError(result.error || 'Upload failed')
                return
            }
            if (result.url) setReceiptUrl(result.url)
        } catch (err) {
            setReceiptError(String((err as Error)?.message || err))
        } finally {
            setReceiptUploading(false)
        }
    }

    const totals = useMemo(() => {
        const expenses = entries
            .filter((item) => item.amount < 0)
            .reduce((sum, item) => sum + item.amount, 0)
        const credits = entries
            .filter((item) => item.amount > 0)
            .reduce((sum, item) => sum + item.amount, 0)
        const currentBalance = startingPetty + expenses + credits
        return { expenses, credits, currentBalance }
    }, [entries, startingPetty])

    return (
        <div className="space-y-6 py-4 sm:py-6">
            <header className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">
                    Petty Cash
                </h1>
                <p className="text-sm text-muted-foreground">
                    Monitor small cash expenses and reimbursements. Figures
                    below use placeholder data until the live sync lands.
                </p>
            </header>

            {error ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                    {error}
                </div>
            ) : null}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <BalanceCard
                    title="Balance Brought Forward"
                    value={startingPetty}
                    hint="Opening petty cash set for the current shift"
                />
                <EditableCard
                    title="Starting Petty Cash"
                    value={startingPetty}
                    onChange={(v) => setStartingPetty(v)}
                    onCommit={(v) => saveStarting(v)}
                    hint={
                        saving ? 'Saving…' : 'Edit and leave the field to save'
                    }
                />
                <BalanceCard
                    title="Credits (shift)"
                    value={totals.credits}
                    hint={loading ? 'Loading…' : 'Top-ups / reimbursements'}
                    positive
                />
                <BalanceCard
                    title="Current Petty Balance"
                    value={totals.currentBalance}
                    highlight
                    hint="Opening petty cash ± expenses ± credits"
                />
            </section>

            <section className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                    <h2 className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        Ledger
                    </h2>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEntryOpen((v) => !v)}
                    >
                        {entryOpen ? 'Cancel' : 'Record Entry'}
                    </Button>
                </div>
                {entryOpen ? (
                    <div className="grid gap-3 border-b border-gray-200 p-4 text-sm dark:border-gray-800 sm:grid-cols-5">
                        <div>
                            <label className="mb-1 block text-xs text-muted-foreground">
                                Category
                            </label>
                            <select
                                className="w-full rounded-md border border-gray-300 bg-white p-2 dark:border-gray-700 dark:bg-gray-900"
                                value={entryCategory}
                                onChange={(e) =>
                                    setEntryCategory(
                                        e.target.value as PettyCashCategory
                                    )
                                }
                            >
                                <option value="expense">Expense</option>
                                <option value="reimbursement">
                                    Reimbursement
                                </option>
                                <option value="topup">Top-up</option>
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs text-muted-foreground">
                                Amount
                            </label>
                            <input
                                type="number"
                                inputMode="decimal"
                                className="w-full rounded-md border border-gray-300 p-2 dark:border-gray-700 dark:bg-gray-900"
                                value={entryAmount}
                                onChange={(e) => setEntryAmount(e.target.value)}
                                placeholder="0.00"
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="mb-1 block text-xs text-muted-foreground">
                                Description
                                <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                className="w-full rounded-md border border-gray-300 p-2 dark:border-gray-700 dark:bg-gray-900"
                                value={entryDesc}
                                onChange={(e) => setEntryDesc(e.target.value)}
                                placeholder="Enter a brief description (required)"
                                required
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs text-muted-foreground">
                                Receipt Image
                            </label>
                            <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="w-full rounded-md border border-gray-300 bg-white p-2 text-xs dark:border-gray-700 dark:bg-gray-900"
                                onChange={handleReceiptSelect}
                            />
                            {receiptUploading ? (
                                <div className="mt-1 text-xs text-muted-foreground">
                                    Uploading…
                                </div>
                            ) : receiptUrl ? (
                                <div className="mt-1 text-xs">
                                    <a
                                        className="text-primary underline"
                                        href={receiptUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        View uploaded receipt
                                    </a>
                                </div>
                            ) : receiptError ? (
                                <div className="mt-1 text-xs text-red-600 dark:text-red-400">
                                    {receiptError}
                                </div>
                            ) : null}
                        </div>
                        <div className="flex items-end">
                            <Button
                                size="sm"
                                onClick={recordEntry}
                                disabled={posting}
                            >
                                {posting ? 'Recording…' : 'Record'}
                            </Button>
                        </div>
                    </div>
                ) : null}
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
                        <thead className="bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                            <tr>
                                <th className="px-4 py-3 text-left">
                                    Description
                                </th>
                                <th className="px-4 py-3 text-left">
                                    Category
                                </th>
                                <th className="px-4 py-3 text-right">Amount</th>
                                <th className="px-4 py-3 text-left">
                                    Recorded
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                            {entries.map((entry) => (
                                <tr
                                    key={entry.id}
                                    className="hover:bg-gray-50 dark:hover:bg-gray-800/60"
                                >
                                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                                        {entry.description}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600 capitalize dark:text-gray-300">
                                        {entry.category}
                                    </td>
                                    <td
                                        className={`px-4 py-3 text-right font-medium ${
                                            entry.amount >= 0
                                                ? 'text-emerald-600 dark:text-emerald-400'
                                                : 'text-red-600 dark:text-red-400'
                                        }`}
                                    >
                                        {CURRENCY.format(entry.amount)}
                                    </td>
                                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                                        <div>
                                            {new Date(
                                                entry.timestamp
                                            ).toLocaleString()}
                                        </div>
                                        {entry.receiptUrl ? (
                                            <a
                                                className="text-xs text-primary underline"
                                                href={entry.receiptUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                Receipt
                                            </a>
                                        ) : null}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 text-sm dark:border-gray-800">
                    <div className="text-gray-600 dark:text-gray-300">
                        Total expenses: {CURRENCY.format(totals.expenses)} ·
                        Credits: {CURRENCY.format(totals.credits)}
                    </div>
                    <div className="text-gray-500 dark:text-gray-400">
                        {loading
                            ? 'Loading…'
                            : 'Manual entries will appear here when recorded.'}
                    </div>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        End of Shift Checklist
                    </h3>
                    <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-gray-600 dark:text-gray-300">
                        <li>Count remaining petty cash in the drawer.</li>
                        <li>Scan or keep receipts for every expense.</li>
                        <li>Reconcile with the expected balance shown here.</li>
                        <li>
                            Move reconciled data into the shift close modal.
                        </li>
                    </ol>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Button size="sm" disabled>
                            Attach Receipt (soon)
                        </Button>
                        <Button size="sm" variant="outline" disabled>
                            Export Ledger
                        </Button>
                    </div>
                </div>
                <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Shift Integration Roadmap
                    </h3>
                    <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-gray-600 dark:text-gray-300">
                        <li>
                            Link petty cash top-ups/returns to float
                            adjustments.
                        </li>
                        <li>
                            Auto-populate shift close modal with counted
                            balances.
                        </li>
                        <li>
                            Push reconciled data to Google Sheets via the GAS
                            proxy.
                        </li>
                        <li>
                            Alert when petty cash dips below configured
                            thresholds.
                        </li>
                    </ul>
                </div>
            </section>
        </div>
    )
}

function BalanceCard({
    title,
    value,
    hint,
    highlight = false,
    positive = false,
}: {
    title: string
    value: number
    hint?: string
    highlight?: boolean
    positive?: boolean
}) {
    return (
        <div
            className={`rounded-lg border p-4 shadow-sm transition dark:border-gray-800 dark:bg-gray-900 ${
                highlight
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-gray-200 bg-white'
            }`}
        >
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {title}
            </div>
            <div
                className={`mt-2 text-lg font-semibold ${
                    highlight
                        ? 'text-primary'
                        : positive
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-gray-900 dark:text-white'
                }`}
            >
                {CURRENCY.format(value)}
            </div>
            {hint ? (
                <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
            ) : null}
        </div>
    )
}

function EditableCard({
    title,
    value,
    onChange,
    onCommit,
    hint,
}: {
    title: string
    value: number
    onChange: (value: number) => void
    onCommit?: (value: number) => void | Promise<void>
    hint?: string
}) {
    return (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {title}
            </div>
            <input
                type="number"
                inputMode="decimal"
                value={value}
                onChange={(event) => onChange(Number(event.target.value) || 0)}
                onBlur={() => onCommit?.(value)}
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:focus:border-primary"
            />
            <div className="mt-2">
                <Button size="sm" onClick={() => onCommit?.(value)}>
                    Save
                </Button>
            </div>
            {hint ? (
                <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
            ) : null}
        </div>
    )
}
