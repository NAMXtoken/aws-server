'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@/components/ui/button/Button'
import { Modal } from '@/components/ui/modal'
import { db, uuid } from '@/lib/db'
import { getSessionActor } from '@/lib/session'
import { queueTicketEvent } from '@/lib/ticket-events'
import type { Ticket as TicketRecord, TicketItem } from '@/types/db'

type TicketSummary = {
    ticketId: string
    ticketName?: string
    openedBy?: string
}

type TransferItemState = {
    item: TicketItem
    remainingQty: number
    movedQty: number
}

type TransferTicketModalProps = {
    isOpen: boolean
    sourceTicketId: string | null
    sourceSummary?: TicketSummary
    openTickets: TicketSummary[]
    onClose: () => void
    formatCurrency: (value: number) => string
}

const toIntegerWithinBounds = (
    value: number,
    min = 0,
    max = Number.MAX_SAFE_INTEGER
) => Math.min(Math.max(Math.floor(value), min), max)

const formatQty = (value: number) =>
    Number.isFinite(value) ? value.toString() : '0'

const computeTotals = (items: TicketItem[]) =>
    items.reduce(
        (acc, item) => {
            const qty = Number(item.qty) || 0
            const price = Number(item.price) || 0
            const line = Number(item.lineTotal ?? qty * price) || 0
            acc.qty += qty
            acc.total += line
            return acc
        },
        { qty: 0, total: 0 }
    )

export default function TransferTicketModal({
    isOpen,
    sourceTicketId,
    sourceSummary,
    openTickets,
    onClose,
    formatCurrency,
}: TransferTicketModalProps) {
    const [loadingSource, setLoadingSource] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [actionError, setActionError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [successTargetId, setSuccessTargetId] = useState<string | null>(null)

    const [sourceTicket, setSourceTicket] = useState<TicketRecord | null>(null)
    const [sourceItems, setSourceItems] = useState<TransferItemState[]>([])
    const [moveDraft, setMoveDraft] = useState<Record<string, string>>({})
    const [returnDraft, setReturnDraft] = useState<Record<string, string>>({})

    const [selectedTargetId, setSelectedTargetId] = useState<string>('')
    const [targetTicket, setTargetTicket] = useState<TicketRecord | null>(null)
    const [targetItems, setTargetItems] = useState<TicketItem[]>([])
    const [loadingTarget, setLoadingTarget] = useState(false)
    const [targetLoadError, setTargetLoadError] = useState<string | null>(null)

    const candidateTargets = useMemo(
        () =>
            openTickets.filter((ticket) => ticket.ticketId !== sourceTicketId),
        [openTickets, sourceTicketId]
    )

    const resetState = useCallback(() => {
        setSourceTicket(null)
        setSourceItems([])
        setMoveDraft({})
        setReturnDraft({})
        setLoadError(null)
        setActionError(null)
        setSuccessTargetId(null)
        setSaving(false)
        setSelectedTargetId('')
        setTargetTicket(null)
        setTargetItems([])
        setTargetLoadError(null)
        setLoadingSource(false)
        setLoadingTarget(false)
    }, [])

    const loadSourceTicket = useCallback(async () => {
        if (!sourceTicketId) return
        setLoadingSource(true)
        setLoadError(null)
        try {
            const [ticket, ticketItems] = await Promise.all([
                db.tickets.get(sourceTicketId),
                db.ticket_items
                    .where('ticketId')
                    .equals(sourceTicketId)
                    .toArray(),
            ])
            setSourceTicket(ticket ?? null)
            setSourceItems(
                ticketItems.map((item) => ({
                    item,
                    remainingQty: item.qty,
                    movedQty: 0,
                }))
            )
            setMoveDraft({})
            setReturnDraft({})
        } catch (err) {
            console.error('Failed to load ticket for transfer', err)
            setLoadError('Unable to load ticket details. Please try again.')
        } finally {
            setLoadingSource(false)
        }
    }, [sourceTicketId])

    const loadTargetTicket = useCallback(async (targetId: string | null) => {
        if (!targetId) {
            setTargetTicket(null)
            setTargetItems([])
            setTargetLoadError(null)
            return
        }
        setLoadingTarget(true)
        setTargetLoadError(null)
        try {
            const [ticket, items] = await Promise.all([
                db.tickets.get(targetId),
                db.ticket_items.where('ticketId').equals(targetId).toArray(),
            ])
            setTargetTicket(ticket ?? null)
            setTargetItems(items)
        } catch (err) {
            console.error('Failed to load destination ticket', err)
            setTargetLoadError(
                'Unable to load the destination ticket. Please try another ticket.'
            )
            setTargetTicket(null)
            setTargetItems([])
        } finally {
            setLoadingTarget(false)
        }
    }, [])

    useEffect(() => {
        if (!isOpen || !sourceTicketId) {
            resetState()
            return
        }
        void loadSourceTicket()
    }, [isOpen, sourceTicketId, loadSourceTicket, resetState])

    useEffect(() => {
        if (!isOpen) return
        if (candidateTargets.length === 0) {
            setSelectedTargetId('')
            void loadTargetTicket(null)
            return
        }
        setSelectedTargetId((prev) =>
            prev && candidateTargets.some((ticket) => ticket.ticketId === prev)
                ? prev
                : candidateTargets[0].ticketId
        )
    }, [candidateTargets, isOpen, loadTargetTicket])

    useEffect(() => {
        if (!isOpen || !selectedTargetId) {
            if (!selectedTargetId) void loadTargetTicket(null)
            return
        }
        void loadTargetTicket(selectedTargetId)
    }, [isOpen, selectedTargetId, loadTargetTicket])

    useEffect(() => {
        if (!isOpen) return
        setSuccessTargetId(null)
        setActionError(null)
    }, [isOpen, selectedTargetId])

    const movedItems = useMemo(
        () => sourceItems.filter((entry) => entry.movedQty > 0),
        [sourceItems]
    )

    const moveItem = useCallback((id: string, quantity: number) => {
        setSuccessTargetId(null)
        setActionError(null)
        setSourceItems((prev) =>
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

    const moveAll = useCallback(
        (id: string) => {
            const match = sourceItems.find((entry) => entry.item.id === id)
            if (!match || match.remainingQty <= 0) return
            moveItem(id, match.remainingQty)
        },
        [moveItem, sourceItems]
    )

    const returnItem = useCallback((id: string, quantity: number) => {
        setSuccessTargetId(null)
        setActionError(null)
        setSourceItems((prev) =>
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

    const returnAll = useCallback(
        (id: string) => {
            const match = sourceItems.find((entry) => entry.item.id === id)
            if (!match || match.movedQty <= 0) return
            returnItem(id, match.movedQty)
        },
        [returnItem, sourceItems]
    )

    const sourceTotals = useMemo(
        () =>
            sourceItems.reduce(
                (acc, entry) => {
                    acc.qty += entry.remainingQty
                    acc.total += entry.item.price * entry.remainingQty
                    return acc
                },
                { qty: 0, total: 0 }
            ),
        [sourceItems]
    )

    const movedTotals = useMemo(
        () =>
            sourceItems.reduce(
                (acc, entry) => {
                    acc.qty += entry.movedQty
                    acc.total += entry.item.price * entry.movedQty
                    return acc
                },
                { qty: 0, total: 0 }
            ),
        [sourceItems]
    )

    const targetTotals = useMemo(() => {
        const existing = computeTotals(targetItems)
        return {
            qty: existing.qty + movedTotals.qty,
            total: existing.total + movedTotals.total,
        }
    }, [targetItems, movedTotals])

    const transferSourceName = useMemo(() => {
        if (sourceSummary?.ticketName) return sourceSummary.ticketName
        if (sourceTicket?.name) return sourceTicket.name
        if (sourceTicketId) return sourceTicketId
        return 'Ticket'
    }, [sourceSummary?.ticketName, sourceTicket?.name, sourceTicketId])

    const transferTargetName = useMemo(() => {
        const targetFromList = openTickets.find(
            (ticket) => ticket.ticketId === selectedTargetId
        )
        if (targetFromList?.ticketName) return targetFromList.ticketName
        if (targetTicket?.name) return targetTicket.name
        if (selectedTargetId) return selectedTargetId
        return 'Ticket'
    }, [openTickets, selectedTargetId, targetTicket?.name])

    const confirmDisabled =
        !selectedTargetId ||
        movedItems.length === 0 ||
        saving ||
        loadingSource ||
        Boolean(loadError)

    const handleConfirmTransfer = useCallback(async () => {
        if (!sourceTicketId) return
        if (!selectedTargetId) {
            setActionError('Select an open ticket to transfer items to.')
            return
        }
        if (movedItems.length === 0) {
            setActionError('Move at least one item before confirming.')
            return
        }
        const actor = getSessionActor()
        const sourceName = transferSourceName
        const destinationName = transferTargetName
        const timestamp = Date.now()
        const movedSnapshot = movedItems.map((entry) => {
            const unitPrice = Number(entry.item.price) || 0
            const qty = Number(entry.movedQty) || 0
            return {
                itemId: entry.item.sku || '',
                itemName: entry.item.name,
                qty,
                unitPrice,
                lineTotal: unitPrice * qty,
            }
        })
        const movedTotals = movedSnapshot.reduce(
            (acc, item) => {
                acc.qty += Number(item.qty) || 0
                acc.total += Number(item.lineTotal) || 0
                return acc
            },
            { qty: 0, total: 0 }
        )
        setSaving(true)
        setActionError(null)
        setSuccessTargetId(null)
        try {
            await db.transaction('readwrite', db.ticket_items, async () => {
                for (const entry of movedItems) {
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
                        ticketId: selectedTargetId,
                        qty: entry.movedQty,
                        addedAt: timestamp,
                        lineTotal:
                            Number(entry.movedQty) * Number(entry.item.price),
                    }
                    await db.ticket_items.add(newItem)
                }
            })
            await loadSourceTicket()
            await loadTargetTicket(selectedTargetId)
            setMoveDraft({})
            setReturnDraft({})
            setSuccessTargetId(selectedTargetId)
            void queueTicketEvent(
                'ticket.transfer',
                {
                    timestamp,
                    actor,
                    sourceTicketId,
                    ticketId: sourceTicketId,
                    ticketName: sourceName,
                    sourceTicketName: sourceName,
                    destinationTicketId: selectedTargetId,
                    destinationTicketName: destinationName,
                    itemsMoved: movedSnapshot,
                    totalsMoved: movedTotals,
                },
                timestamp
            )
        } catch (err) {
            console.error('Failed to transfer ticket items', err)
            setActionError(
                'Unable to transfer items right now. Please try again.'
            )
        } finally {
            setSaving(false)
        }
    }, [
        loadSourceTicket,
        loadTargetTicket,
        movedItems,
        selectedTargetId,
        sourceTicketId,
        transferSourceName,
        transferTargetName,
    ])

    const renderSourceItem = (entry: TransferItemState) => {
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
                        onClick={() => moveItem(entry.item.id, moveNumeric)}
                    >
                        Move
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-9 px-3 text-xs"
                        disabled={moveAllDisabled}
                        onClick={() => moveAll(entry.item.id)}
                    >
                        Move All
                    </Button>
                </div>
            </div>
        )
    }

    const renderMovedItem = (entry: TransferItemState) => {
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
                            To transfer: {formatQty(moved)} &middot; Price:{' '}
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
                        onClick={() => returnItem(entry.item.id, returnNumeric)}
                    >
                        Return
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-9 px-3 text-xs"
                        disabled={returnAllDisabled}
                        onClick={() => returnAll(entry.item.id)}
                    >
                        Return All
                    </Button>
                </div>
            </div>
        )
    }

    const renderTargetItem = (item: TicketItem) => (
        <div
            key={item.id}
            className="flex items-center justify-between rounded-lg border border-transparent bg-gray-50 px-4 py-2 text-sm text-gray-600 dark:bg-gray-800/50 dark:text-gray-300"
        >
            <div className="flex flex-col">
                <span className="font-medium text-gray-800 dark:text-gray-100">
                    {item.name}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                    Qty: {formatQty(item.qty)} &middot;{' '}
                    {formatCurrency(
                        Number(item.lineTotal ?? item.qty * item.price)
                    )}
                </span>
            </div>
        </div>
    )

    const sourceTitle =
        sourceSummary?.ticketName ||
        sourceTicket?.name ||
        sourceTicketId ||
        'Ticket'
    const targetTitle = targetTicket
        ? targetTicket.name || selectedTargetId
        : selectedTargetId || 'Select ticket'

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            className="max-w-6xl max-h-[90vh] overflow-hidden"
            ariaLabelledBy="transfer-ticket-title"
        >
            <div className="flex h-full flex-col gap-6 overflow-hidden p-6 sm:p-8">
                <header className="space-y-2">
                    <h2
                        id="transfer-ticket-title"
                        className="text-xl font-semibold text-gray-900 dark:text-gray-100"
                    >
                        Transfer Items: {sourceTitle}
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Move selected items from this ticket into another open
                        ticket. Quantities you transfer will be added to the
                        destination ticket.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Destination Ticket
                        </label>
                        <select
                            className="h-10 min-w-[220px] rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-primary focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                            value={selectedTargetId}
                            onChange={(event) =>
                                setSelectedTargetId(event.target.value)
                            }
                            disabled={candidateTargets.length === 0}
                        >
                            {candidateTargets.length === 0 ? (
                                <option value="">
                                    No other open tickets available
                                </option>
                            ) : (
                                candidateTargets.map((ticket) => (
                                    <option
                                        key={ticket.ticketId}
                                        value={ticket.ticketId}
                                    >
                                        {ticket.ticketName || ticket.ticketId}
                                        {ticket.openedBy
                                            ? ` — ${ticket.openedBy}`
                                            : ''}
                                    </option>
                                ))
                            )}
                        </select>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto">
                    {loadingSource ? (
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
                                    void loadSourceTicket()
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
                                            Source Ticket
                                        </h3>
                                        <p className="text-sm text-gray-700 dark:text-gray-300">
                                            {sourceTitle}
                                        </p>
                                        {sourceSummary?.openedBy && (
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                Opened by{' '}
                                                {sourceSummary.openedBy}
                                            </p>
                                        )}
                                    </div>
                                    <div className="text-right text-sm text-gray-600 dark:text-gray-300">
                                        <div>
                                            Items:{' '}
                                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                                                {formatQty(sourceTotals.qty)}
                                            </span>
                                        </div>
                                        <div>
                                            Total:{' '}
                                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                                                {formatCurrency(
                                                    sourceTotals.total
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
                                    {sourceItems.length === 0 ? (
                                        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                            This ticket has no items to
                                            transfer.
                                        </div>
                                    ) : (
                                        sourceItems.map((entry) =>
                                            renderSourceItem(entry)
                                        )
                                    )}
                                </div>
                            </section>

                            <section className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                                <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-6 py-4 dark:border-gray-800">
                                    <div>
                                        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            Destination Overview
                                        </h3>
                                        <p className="text-sm text-gray-700 dark:text-gray-300">
                                            {targetTitle}
                                        </p>
                                        {targetTicket?.openedBy && (
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                Opened by{' '}
                                                {targetTicket.openedBy}
                                            </p>
                                        )}
                                    </div>
                                    <div className="text-right text-sm text-gray-600 dark:text-gray-300">
                                        <div>
                                            Items:{' '}
                                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                                                {formatQty(targetTotals.qty)}
                                            </span>
                                        </div>
                                        <div>
                                            Total:{' '}
                                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                                                {formatCurrency(
                                                    targetTotals.total
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                                    {candidateTargets.length === 0 ? (
                                        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                            No other open tickets are available.
                                            Open a new ticket first, then
                                            transfer items.
                                        </div>
                                    ) : loadingTarget ? (
                                        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                            Loading destination ticket...
                                        </div>
                                    ) : targetLoadError ? (
                                        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                                            {targetLoadError}
                                        </div>
                                    ) : (
                                        <>
                                            <div className="space-y-3">
                                                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                    Existing Items
                                                </h4>
                                                {targetItems.length === 0 ? (
                                                    <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                                        This ticket has no items
                                                        yet.
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {targetItems.map(
                                                            (item) =>
                                                                renderTargetItem(
                                                                    item
                                                                )
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="space-y-3">
                                                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                    Items to Transfer
                                                </h4>
                                                {movedItems.length === 0 ? (
                                                    <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                                        Move items from the
                                                        source ticket to queue
                                                        them for transfer.
                                                    </div>
                                                ) : (
                                                    movedItems.map((entry) =>
                                                        renderMovedItem(entry)
                                                    )
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </section>
                        </div>
                    )}
                </div>

                <footer className="flex flex-col gap-3 border-t border-gray-200 pt-4 text-sm dark:border-gray-800 sm:flex-row sm:items-center sm:justify-end">
                    <div className="flex flex-1 flex-col gap-1 text-xs text-gray-500 dark:text-gray-400 sm:flex-none sm:text-right">
                        <span>
                            Items you move will remain on this screen until you
                            confirm. Once confirmed, quantities transfer to the
                            selected ticket immediately.
                        </span>
                        {successTargetId && (
                            <span className="text-emerald-600 dark:text-emerald-400">
                                Successfully transferred items to ticket{' '}
                                {successTargetId}.
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
                                void handleConfirmTransfer()
                            }}
                        >
                            {saving ? 'Transferring...' : 'Confirm Transfer'}
                        </Button>
                    </div>
                </footer>
            </div>
        </Modal>
    )
}
