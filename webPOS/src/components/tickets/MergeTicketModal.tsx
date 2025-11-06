'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@/components/ui/button/Button'
import { Modal } from '@/components/ui/modal'
import { db } from '@/lib/db'
import { getSessionActor } from '@/lib/session'
import { queueTicketEvent } from '@/lib/ticket-events'
import type { Ticket as TicketRecord, TicketItem } from '@/types/db'

type TicketSummary = {
    ticketId: string
    ticketName?: string
    openedBy?: string
}

type MergeTicketModalProps = {
    isOpen: boolean
    sourceTicketId: string | null
    sourceSummary?: TicketSummary
    openTickets: TicketSummary[]
    onClose: () => void
    formatCurrency: (value: number) => string
}

const formatQty = (value: number) =>
    Number.isFinite(value) ? value.toString() : '0'

const computeTotals = (items: TicketItem[]) =>
    items.reduce(
        (acc, item) => {
            const qty = Number(item.qty) || 0
            const price = Number(item.price) || 0
            const lineTotal = Number(item.lineTotal ?? qty * price) || 0
            acc.qty += qty
            acc.total += lineTotal
            return acc
        },
        { qty: 0, total: 0 }
    )

export default function MergeTicketModal({
    isOpen,
    sourceTicketId,
    sourceSummary,
    openTickets,
    onClose,
    formatCurrency,
}: MergeTicketModalProps) {
    const [loadingSource, setLoadingSource] = useState(false)
    const [sourceTicket, setSourceTicket] = useState<TicketRecord | null>(null)
    const [sourceItems, setSourceItems] = useState<TicketItem[]>([])
    const [sourceError, setSourceError] = useState<string | null>(null)

    const [selectedTargetId, setSelectedTargetId] = useState<string>('')
    const [targetTicket, setTargetTicket] = useState<TicketRecord | null>(null)
    const [targetItems, setTargetItems] = useState<TicketItem[]>([])
    const [loadingTarget, setLoadingTarget] = useState(false)
    const [targetError, setTargetError] = useState<string | null>(null)

    const [saving, setSaving] = useState(false)
    const [actionError, setActionError] = useState<string | null>(null)
    const [successTargetId, setSuccessTargetId] = useState<string | null>(null)

    const candidateTargets = useMemo(
        () =>
            openTickets.filter((ticket) => ticket.ticketId !== sourceTicketId),
        [openTickets, sourceTicketId]
    )

    const resetState = useCallback(() => {
        setLoadingSource(false)
        setSourceTicket(null)
        setSourceItems([])
        setSourceError(null)
        setSelectedTargetId('')
        setTargetTicket(null)
        setTargetItems([])
        setLoadingTarget(false)
        setTargetError(null)
        setSaving(false)
        setActionError(null)
        setSuccessTargetId(null)
    }, [])

    const loadSourceTicket = useCallback(async () => {
        if (!sourceTicketId) return
        setLoadingSource(true)
        setSourceError(null)
        try {
            const [ticket, items] = await Promise.all([
                db.tickets.get(sourceTicketId),
                db.ticket_items
                    .where('ticketId')
                    .equals(sourceTicketId)
                    .toArray(),
            ])
            setSourceTicket(ticket ?? null)
            setSourceItems(items)
        } catch (err) {
            console.error('Failed to load source ticket for merge', err)
            setSourceError('Unable to load this ticket right now.')
        } finally {
            setLoadingSource(false)
        }
    }, [sourceTicketId])

    const loadTargetTicket = useCallback(async (ticketId: string | null) => {
        if (!ticketId) {
            setTargetTicket(null)
            setTargetItems([])
            setTargetError(null)
            return
        }
        setLoadingTarget(true)
        setTargetError(null)
        try {
            const [ticket, items] = await Promise.all([
                db.tickets.get(ticketId),
                db.ticket_items.where('ticketId').equals(ticketId).toArray(),
            ])
            setTargetTicket(ticket ?? null)
            setTargetItems(items)
        } catch (err) {
            console.error('Failed to load merge destination ticket', err)
            setTargetTicket(null)
            setTargetItems([])
            setTargetError(
                'Unable to load the selected ticket. Please choose another one.'
            )
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
        setActionError(null)
        setSuccessTargetId(null)
    }, [isOpen, selectedTargetId])

    const sourceTotals = useMemo(
        () => computeTotals(sourceItems),
        [sourceItems]
    )

    const destinationTotalsBefore = useMemo(
        () => computeTotals(targetItems),
        [targetItems]
    )

    const mergeSourceName = useMemo(() => {
        if (sourceSummary?.ticketName) return sourceSummary.ticketName
        if (sourceTicket?.name) return sourceTicket.name
        if (sourceTicketId) return sourceTicketId
        return 'Ticket'
    }, [sourceSummary?.ticketName, sourceTicket?.name, sourceTicketId])

    const mergeTargetName = useMemo(() => {
        const targetFromList = openTickets.find(
            (ticket) => ticket.ticketId === selectedTargetId
        )
        if (targetFromList?.ticketName) return targetFromList.ticketName
        if (targetTicket?.name) return targetTicket.name
        if (selectedTargetId) return selectedTargetId
        return 'Ticket'
    }, [openTickets, selectedTargetId, targetTicket?.name])

    const targetTotals = useMemo(() => {
        const existing = destinationTotalsBefore
        const merged = computeTotals(sourceItems)
        return {
            qty: existing.qty + merged.qty,
            total: existing.total + merged.total,
        }
    }, [destinationTotalsBefore, sourceItems])

    const confirmDisabled =
        !selectedTargetId ||
        saving ||
        loadingSource ||
        Boolean(sourceError) ||
        candidateTargets.length === 0 ||
        sourceItems.length === 0

    const handleConfirmMerge = useCallback(async () => {
        if (!sourceTicketId) return
        if (!selectedTargetId) {
            setActionError('Select an open ticket to merge into.')
            return
        }
        if (sourceItems.length === 0) {
            setActionError('Source ticket has no items to merge.')
            return
        }
        const actor = getSessionActor()
        const timestamp = Date.now()
        const sourceName = mergeSourceName
        const targetName = mergeTargetName
        const itemsSnapshot = sourceItems.map((item) => {
            const unitPrice = Number(item.price) || 0
            const qty = Number(item.qty) || 0
            return {
                itemId: item.sku || '',
                itemName: item.name,
                qty,
                unitPrice,
                lineTotal:
                    Number(item.lineTotal ?? unitPrice * qty) ||
                    unitPrice * qty,
            }
        })
        const totalsMoved = itemsSnapshot.reduce(
            (acc, item) => {
                acc.qty += Number(item.qty) || 0
                acc.total += Number(item.lineTotal) || 0
                return acc
            },
            { qty: 0, total: 0 }
        )
        const destinationTotalsBefore = computeTotals(targetItems)
        setSaving(true)
        setActionError(null)
        setSuccessTargetId(null)
        try {
            await db.transaction(
                'readwrite',
                db.ticket_items,
                db.tickets,
                async () => {
                    await db.ticket_items
                        .where('ticketId')
                        .equals(sourceTicketId)
                        .modify((item) => {
                            item.ticketId = selectedTargetId
                            item.addedAt = Date.now()
                        })
                    await db.tickets.delete(sourceTicketId)
                }
            )
            setSuccessTargetId(selectedTargetId)
            await Promise.all([
                loadTargetTicket(selectedTargetId),
                loadSourceTicket(),
            ])
            void queueTicketEvent(
                'ticket.merge',
                {
                    timestamp,
                    actor,
                    sourceTicketId,
                    ticketId: sourceTicketId,
                    ticketName: sourceName,
                    sourceTicketName: sourceName,
                    destinationTicketId: selectedTargetId,
                    destinationTicketName: targetName,
                    itemsMerged: itemsSnapshot,
                    totalsMerged: totalsMoved,
                    destinationTotalsBefore,
                    destinationTotalsAfter: {
                        qty: destinationTotalsBefore.qty + totalsMoved.qty,
                        total:
                            destinationTotalsBefore.total + totalsMoved.total,
                    },
                },
                timestamp
            )
        } catch (err) {
            console.error('Failed to merge tickets', err)
            setActionError(
                'Unable to merge these tickets right now. Please try again.'
            )
        } finally {
            setSaving(false)
        }
    }, [
        loadSourceTicket,
        loadTargetTicket,
        mergeSourceName,
        mergeTargetName,
        selectedTargetId,
        sourceItems,
        sourceTicketId,
        targetItems,
    ])

    const sourceTitle = mergeSourceName

    const targetTitle = selectedTargetId ? mergeTargetName : 'Select ticket'

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            className="max-w-4xl max-h-[90vh] overflow-hidden"
            ariaLabelledBy="merge-ticket-title"
        >
            <div className="flex h-full flex-col gap-6 overflow-hidden p-6 sm:p-8">
                <header className="space-y-2">
                    <h2
                        id="merge-ticket-title"
                        className="text-xl font-semibold text-gray-900 dark:text-gray-100"
                    >
                        Merge Ticket: {sourceTitle}
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Merging will move every item from this ticket into the
                        selected destination ticket, then remove the empty
                        ticket.
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
                    ) : sourceError ? (
                        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                            <p>{sourceError}</p>
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
                                            This ticket currently has no items.
                                        </div>
                                    ) : (
                                        sourceItems.map((item) => (
                                            <div
                                                key={item.id}
                                                className="flex items-center justify-between rounded-lg border border-transparent bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:bg-gray-800/50 dark:text-gray-300"
                                            >
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-gray-800 dark:text-gray-100">
                                                        {item.name}
                                                    </span>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                                        Qty:{' '}
                                                        {formatQty(item.qty)}{' '}
                                                        &middot;{' '}
                                                        {formatCurrency(
                                                            Number(
                                                                item.lineTotal ??
                                                                    item.qty *
                                                                        item.price
                                                            )
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </section>

                            <section className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                                <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-6 py-4 dark:border-gray-800">
                                    <div>
                                        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            Destination Summary
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
                                <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
                                    {candidateTargets.length === 0 ? (
                                        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                            No other open tickets are available.
                                            Open another ticket first, then
                                            merge.
                                        </div>
                                    ) : loadingTarget ? (
                                        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                            Loading destination ticket...
                                        </div>
                                    ) : targetError ? (
                                        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                                            {targetError}
                                        </div>
                                    ) : (
                                        <>
                                            <div className="space-y-2">
                                                {targetItems.length === 0 ? (
                                                    <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                                        Destination currently
                                                        has no items.
                                                    </div>
                                                ) : (
                                                    targetItems.map((item) => (
                                                        <div
                                                            key={item.id}
                                                            className="flex items-center justify-between rounded-lg border border-transparent bg-gray-50 px-4 py-2 text-sm text-gray-600 dark:bg-gray-800/50 dark:text-gray-300"
                                                        >
                                                            <div className="flex flex-col">
                                                                <span className="font-medium text-gray-800 dark:text-gray-100">
                                                                    {item.name}
                                                                </span>
                                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                                    Qty:{' '}
                                                                    {formatQty(
                                                                        item.qty
                                                                    )}{' '}
                                                                    &middot;{' '}
                                                                    {formatCurrency(
                                                                        Number(
                                                                            item.lineTotal ??
                                                                                item.qty *
                                                                                    item.price
                                                                        )
                                                                    )}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))
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
                            After merging, the source ticket will be removed and
                            all of its activity will live on the destination
                            ticket.
                        </span>
                        {successTargetId && (
                            <span className="text-emerald-600 dark:text-emerald-400">
                                Merged successfully into ticket{' '}
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
                                void handleConfirmMerge()
                            }}
                        >
                            {saving ? 'Merging...' : 'Confirm Merge'}
                        </Button>
                    </div>
                </footer>
            </div>
        </Modal>
    )
}
