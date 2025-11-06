'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@/components/ui/button/Button'
import { Modal } from '@/components/ui/modal'
import { db, uuid } from '@/lib/db'
import { openTicket } from '@/lib/local-pos'
import { queueTicketEvent } from '@/lib/ticket-events'
import { getSessionActor } from '@/lib/session'
import type { Ticket as TicketRecord, TicketItem } from '@/types/db'

type TicketSummary = {
    ticketId: string
    ticketName?: string
    openedBy?: string
}

type SplitTicketModalProps = {
    isOpen: boolean
    ticketId: string | null
    onClose: () => void
    formatCurrency: (value: number) => string
    ticketSummary?: TicketSummary
}

type SplitItemState = {
    item: TicketItem
    remainingQty: number
    movedQty: number
}

const toIntegerWithinBounds = (
    value: number,
    min = 0,
    max = Number.MAX_SAFE_INTEGER
) => Math.min(Math.max(Math.floor(value), min), max)

const formatQty = (value: number) =>
    Number.isFinite(value) ? value.toString() : '0'

export default function SplitTicketModal({
    isOpen,
    ticketId,
    onClose,
    formatCurrency,
    ticketSummary,
}: SplitTicketModalProps) {
    const [loading, setLoading] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [actionError, setActionError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [successTicketId, setSuccessTicketId] = useState<string | null>(null)
    const [ticketRecord, setTicketRecord] = useState<TicketRecord | null>(null)
    const [items, setItems] = useState<SplitItemState[]>([])
    const [moveDraft, setMoveDraft] = useState<Record<string, string>>({})
    const [returnDraft, setReturnDraft] = useState<Record<string, string>>({})

    const resetState = useCallback(() => {
        setTicketRecord(null)
        setItems([])
        setMoveDraft({})
        setReturnDraft({})
        setLoadError(null)
        setActionError(null)
        setSuccessTicketId(null)
        setLoading(false)
        setSaving(false)
    }, [])

    const loadTicket = useCallback(async () => {
        if (!ticketId) return
        setLoading(true)
        setLoadError(null)
        try {
            const [ticket, ticketItems] = await Promise.all([
                db.tickets.get(ticketId),
                db.ticket_items.where('ticketId').equals(ticketId).toArray(),
            ])
            setTicketRecord(ticket ?? null)
            setItems(
                ticketItems.map((item) => ({
                    item,
                    remainingQty: item.qty,
                    movedQty: 0,
                }))
            )
            setMoveDraft({})
            setReturnDraft({})
        } catch (err) {
            console.error('Failed to load ticket for splitting', err)
            setLoadError('Unable to load ticket details. Please try again.')
        } finally {
            setLoading(false)
        }
    }, [ticketId])

    useEffect(() => {
        if (!isOpen || !ticketId) {
            resetState()
            return
        }
        void loadTicket()
    }, [isOpen, ticketId, loadTicket, resetState])

    const originalTotals = useMemo(() => {
        return items.reduce(
            (acc, current) => {
                acc.qty += current.remainingQty
                acc.total += current.item.price * current.remainingQty
                return acc
            },
            { qty: 0, total: 0 }
        )
    }, [items])

    const splitTotals = useMemo(() => {
        return items.reduce(
            (acc, current) => {
                acc.qty += current.movedQty
                acc.total += current.item.price * current.movedQty
                return acc
            },
            { qty: 0, total: 0 }
        )
    }, [items])

    const movedItems = useMemo(
        () => items.filter((item) => item.movedQty > 0),
        [items]
    )

    const handleMove = useCallback((id: string, quantity: number) => {
        setSuccessTicketId(null)
        setActionError(null)
        setItems((prev) =>
            prev.map((entry) => {
                if (entry.item.id !== id) return entry
                const allowedQty = toIntegerWithinBounds(
                    quantity,
                    0,
                    entry.remainingQty
                )
                if (allowedQty <= 0) return entry
                return {
                    ...entry,
                    remainingQty: entry.remainingQty - allowedQty,
                    movedQty: entry.movedQty + allowedQty,
                }
            })
        )
        setMoveDraft((prev) => ({ ...prev, [id]: '' }))
    }, [])

    const handleMoveAll = useCallback(
        (id: string) => {
            const match = items.find((entry) => entry.item.id === id)
            if (!match || match.remainingQty <= 0) return
            handleMove(id, match.remainingQty)
        },
        [handleMove, items]
    )

    const handleReturn = useCallback((id: string, quantity: number) => {
        setSuccessTicketId(null)
        setActionError(null)
        setItems((prev) =>
            prev.map((entry) => {
                if (entry.item.id !== id) return entry
                const allowedQty = toIntegerWithinBounds(
                    quantity,
                    0,
                    entry.movedQty
                )
                if (allowedQty <= 0) return entry
                return {
                    ...entry,
                    remainingQty: entry.remainingQty + allowedQty,
                    movedQty: entry.movedQty - allowedQty,
                }
            })
        )
        setReturnDraft((prev) => ({ ...prev, [id]: '' }))
    }, [])

    const handleReturnAll = useCallback(
        (id: string) => {
            const match = items.find((entry) => entry.item.id === id)
            if (!match || match.movedQty <= 0) return
            handleReturn(id, match.movedQty)
        },
        [handleReturn, items]
    )

    const renderOriginalItem = (entry: SplitItemState) => {
        const remaining = entry.remainingQty
        const moveValue = moveDraft[entry.item.id] ?? ''
        const moveNumeric = Number.parseFloat(moveValue)
        const moveDisabled =
            remaining <= 0 || !Number.isFinite(moveNumeric) || moveNumeric <= 0
        const moveAllDisabled = remaining <= 0

        return (
            <div
                key={entry.item.id}
                className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/40"
            >
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                            {entry.item.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                            Remaining: {formatQty(remaining)} &middot; Price:{' '}
                            {formatCurrency(entry.item.price)}
                        </div>
                        {entry.item.options &&
                            entry.item.options.length > 0 && (
                                <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                                    {entry.item.options.map((option, index) => (
                                        <div key={index}>
                                            {option.groupName}:{' '}
                                            {option.choiceName}
                                        </div>
                                    ))}
                                </div>
                            )}
                    </div>
                    <div className="text-right text-sm font-medium text-gray-900 dark:text-gray-100">
                        {formatCurrency(entry.item.price * remaining)}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        type="number"
                        min={0}
                        max={remaining}
                        step={1}
                        inputMode="numeric"
                        className="h-9 w-20 rounded-md border border-gray-300 bg-white px-2 text-sm focus:border-primary focus:outline-none dark:border-gray-700 dark:bg-gray-900"
                        value={moveValue}
                        onChange={(event) => {
                            setMoveDraft((prev) => ({
                                ...prev,
                                [entry.item.id]: event.target.value,
                            }))
                        }}
                    />
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-9 px-3 text-xs"
                        disabled={moveDisabled}
                        onClick={() => handleMove(entry.item.id, moveNumeric)}
                    >
                        Move
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-9 px-3 text-xs"
                        disabled={moveAllDisabled}
                        onClick={() => handleMoveAll(entry.item.id)}
                    >
                        Move All
                    </Button>
                </div>
            </div>
        )
    }

    const renderMovedItem = (entry: SplitItemState) => {
        const moved = entry.movedQty
        const returnValue = returnDraft[entry.item.id] ?? ''
        const returnNumeric = Number.parseFloat(returnValue)
        const returnDisabled =
            moved <= 0 || !Number.isFinite(returnNumeric) || returnNumeric <= 0
        const returnAllDisabled = moved <= 0

        return (
            <div
                key={entry.item.id}
                className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/40"
            >
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                            {entry.item.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                            In new ticket: {formatQty(moved)} &middot; Price:{' '}
                            {formatCurrency(entry.item.price)}
                        </div>
                        {entry.item.options &&
                            entry.item.options.length > 0 && (
                                <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                                    {entry.item.options.map((option, index) => (
                                        <div key={index}>
                                            {option.groupName}:{' '}
                                            {option.choiceName}
                                        </div>
                                    ))}
                                </div>
                            )}
                    </div>
                    <div className="text-right text-sm font-medium text-gray-900 dark:text-gray-100">
                        {formatCurrency(entry.item.price * moved)}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        type="number"
                        min={0}
                        max={moved}
                        step={1}
                        inputMode="numeric"
                        className="h-9 w-20 rounded-md border border-gray-300 bg-white px-2 text-sm focus:border-primary focus:outline-none dark:border-gray-700 dark:bg-gray-900"
                        value={returnValue}
                        onChange={(event) => {
                            setReturnDraft((prev) => ({
                                ...prev,
                                [entry.item.id]: event.target.value,
                            }))
                        }}
                    />
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-9 px-3 text-xs"
                        disabled={returnDisabled}
                        onClick={() =>
                            handleReturn(entry.item.id, returnNumeric)
                        }
                    >
                        Return
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-9 px-3 text-xs"
                        disabled={returnAllDisabled}
                        onClick={() => handleReturnAll(entry.item.id)}
                    >
                        Return All
                    </Button>
                </div>
            </div>
        )
    }

    const summaryTitle =
        ticketSummary?.ticketName || ticketRecord?.name || ticketId || 'Ticket'
    const hasMovedItems = movedItems.length > 0
    const confirmDisabled =
        !hasMovedItems || saving || loading || Boolean(loadError)

    const handleConfirmSplit = async () => {
        if (!ticketId) return
        if (!hasMovedItems) {
            setActionError(
                'Move at least one item to the new ticket before confirming.'
            )
            return
        }
        setSaving(true)
        setActionError(null)
        setSuccessTicketId(null)
        const selectedEntries = items.filter((entry) => entry.movedQty > 0)
        const actor = getSessionActor()
        const timestamp = Date.now()
        const movedSnapshot = selectedEntries.map((entry) => {
            const unitPrice = Number(entry.item.price) || 0
            const qty = Number(entry.movedQty) || 0
            const lineTotal = unitPrice * qty
            return {
                itemId: entry.item.sku || '',
                itemName: entry.item.name,
                qty,
                unitPrice,
                lineTotal,
            }
        })
        const remainingSnapshot = selectedEntries
            .filter((entry) => entry.remainingQty > 0)
            .map((entry) => {
                const unitPrice = Number(entry.item.price) || 0
                const qty = Number(entry.remainingQty) || 0
                const lineTotal = unitPrice * qty
                return {
                    itemId: entry.item.sku || '',
                    itemName: entry.item.name,
                    qty,
                    unitPrice,
                    lineTotal,
                }
            })
        let newTicketId: string | null = null
        try {
            const sourceOpenedBy =
                ticketSummary?.openedBy || ticketRecord?.openedBy || undefined
            const newTicket = await openTicket(sourceOpenedBy)
            newTicketId = newTicket.ticketId
            await db.transaction('readwrite', db.ticket_items, async () => {
                for (const entry of selectedEntries) {
                    if (entry.movedQty <= 0) continue
                    if (entry.remainingQty <= 0) {
                        await db.ticket_items.delete(entry.item.id)
                    } else {
                        await db.ticket_items.update(entry.item.id, {
                            qty: entry.remainingQty,
                            lineTotal:
                                Number(entry.remainingQty) *
                                Number(entry.item.price),
                        })
                    }
                    const newItem: TicketItem = {
                        ...entry.item,
                        id: uuid(),
                        ticketId: newTicketId!,
                        qty: entry.movedQty,
                        addedAt: timestamp,
                        lineTotal:
                            Number(entry.movedQty) * Number(entry.item.price),
                    }
                    await db.ticket_items.add(newItem)
                }
            })
            const movedLookup = new Map(
                selectedEntries.map((entry) => [entry.item.id, entry])
            )
            setItems(
                (prev) =>
                    prev
                        .map((entry) => {
                            const match = movedLookup.get(entry.item.id)
                            if (!match) return entry
                            if (match.remainingQty <= 0) {
                                return null
                            }
                            const updatedLineTotal =
                                Number(match.remainingQty) *
                                Number(entry.item.price)
                            return {
                                ...entry,
                                item: {
                                    ...entry.item,
                                    qty: match.remainingQty,
                                    lineTotal: updatedLineTotal,
                                },
                                remainingQty: match.remainingQty,
                                movedQty: 0,
                            }
                        })
                        .filter(Boolean) as SplitItemState[]
            )
            setMoveDraft({})
            setReturnDraft({})
            setSuccessTicketId(newTicketId)
            if (newTicketId) {
                const movedTotals = movedSnapshot.reduce(
                    (acc, item) => {
                        acc.qty += Number(item.qty) || 0
                        acc.total += Number(item.lineTotal) || 0
                        return acc
                    },
                    { qty: 0, total: 0 }
                )
                void queueTicketEvent(
                    'ticket.split',
                    {
                        timestamp,
                        actor,
                        sourceTicketId: ticketId,
                        sourceTicketName: summaryTitle,
                        destinationTicketId: newTicketId,
                        destinationTicketName:
                            newTicket.name ||
                            newTicketId.split('-').pop() ||
                            '',
                        ticketId: ticketId,
                        ticketName: summaryTitle,
                        itemsMoved: movedSnapshot,
                        totalsMoved: movedTotals,
                        sourceItemsRemaining: remainingSnapshot,
                    },
                    timestamp
                )
            }
        } catch (err) {
            console.error('Failed to confirm ticket split', err)
            if (newTicketId) {
                try {
                    await db.ticket_items
                        .where('ticketId')
                        .equals(newTicketId)
                        .delete()
                    await db.tickets.delete(newTicketId)
                } catch (cleanupError) {
                    console.error(
                        'Failed to clean up partial split ticket',
                        cleanupError
                    )
                }
            }
            setActionError(
                'Unable to confirm the split right now. Please try again.'
            )
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            className="max-w-6xl max-h-[90vh] overflow-hidden"
            ariaLabelledBy="split-ticket-title"
        >
            <div className="flex h-full flex-col gap-6 overflow-hidden p-6 sm:p-8">
                <header className="space-y-2">
                    <h2
                        id="split-ticket-title"
                        className="text-xl font-semibold text-gray-900 dark:text-gray-100"
                    >
                        Split Ticket: {summaryTitle}
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Select the items you would like to move into a new open
                        ticket. Adjust quantities before confirming the split.
                    </p>
                </header>

                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex min-h-[200px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                            Loading ticket details...
                        </div>
                    ) : loadError ? (
                        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                            <p>{loadError}</p>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    void loadTicket()
                                }}
                            >
                                Retry
                            </Button>
                        </div>
                    ) : (
                        <div className="grid gap-6 lg:grid-cols-2">
                            <section className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                                <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-6 py-4 dark:border-gray-800">
                                    <div>
                                        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            Original Ticket
                                        </h3>
                                        <p className="text-sm text-gray-700 dark:text-gray-300">
                                            {summaryTitle}
                                        </p>
                                        {ticketSummary?.openedBy && (
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                Opened by{' '}
                                                {ticketSummary.openedBy}
                                            </p>
                                        )}
                                    </div>
                                    <div className="text-right text-sm text-gray-600 dark:text-gray-300">
                                        <div>
                                            Items:{' '}
                                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                                                {formatQty(originalTotals.qty)}
                                            </span>
                                        </div>
                                        <div>
                                            Total:{' '}
                                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                                                {formatCurrency(
                                                    originalTotals.total
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
                                    {items.length === 0 ? (
                                        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                            This ticket has no items to split.
                                        </div>
                                    ) : (
                                        items.map((entry) =>
                                            renderOriginalItem(entry)
                                        )
                                    )}
                                </div>
                            </section>

                            <section className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                                <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-6 py-4 dark:border-gray-800">
                                    <div>
                                        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            New Ticket Preview
                                        </h3>
                                        <p className="text-sm text-gray-700 dark:text-gray-300">
                                            Draft split ticket
                                        </p>
                                    </div>
                                    <div className="text-right text-sm text-gray-600 dark:text-gray-300">
                                        <div>
                                            Items:{' '}
                                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                                                {formatQty(splitTotals.qty)}
                                            </span>
                                        </div>
                                        <div>
                                            Total:{' '}
                                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                                                {formatCurrency(
                                                    splitTotals.total
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
                                    {movedItems.length === 0 ? (
                                        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                            Move items from the original ticket
                                            to start building the split ticket.
                                        </div>
                                    ) : (
                                        movedItems.map((entry) =>
                                            renderMovedItem(entry)
                                        )
                                    )}
                                </div>
                            </section>
                        </div>
                    )}
                </div>

                <footer className="flex flex-col gap-3 border-t border-gray-200 pt-4 text-sm dark:border-gray-800 sm:flex-row sm:items-center sm:justify-end">
                    <div className="flex flex-1 flex-col gap-1 text-xs text-gray-500 dark:text-gray-400 sm:flex-none sm:text-right">
                        <span>
                            Note: Splitting a ticket will create a new open
                            ticket with the selected items. Adjust quantities,
                            then confirm to finalize the split.
                        </span>
                        {successTicketId && (
                            <span className="text-emerald-600 dark:text-emerald-400">
                                Created new ticket {successTicketId}. You can
                                continue splitting or close this dialog.
                            </span>
                        )}
                        {actionError && (
                            <span className="text-red-600 dark:text-red-400">
                                {actionError}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                        <Button
                            variant="outline"
                            onClick={onClose}
                            disabled={saving}
                        >
                            Close
                        </Button>
                        <Button
                            variant="primary"
                            disabled={confirmDisabled}
                            onClick={() => {
                                void handleConfirmSplit()
                            }}
                        >
                            {saving ? 'Splitting...' : 'Confirm Split'}
                        </Button>
                    </div>
                </footer>
            </div>
        </Modal>
    )
}
