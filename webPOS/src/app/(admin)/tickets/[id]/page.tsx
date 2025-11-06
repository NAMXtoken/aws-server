'use client'

import { db } from '@/lib/db'
import type { Ticket, TicketItem } from '@/types/db'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

const formatCurrency = (value: number | null | undefined): string => {
    if (!Number.isFinite(value ?? NaN)) return '$0.00'
    return `${(Number(value) || 0).toFixed(2)}`
}

const formatDateTime = (value?: number | null): string => {
    if (!value) return '-'
    try {
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(new Date(value))
    } catch {
        return '-'
    }
}

type TicketState = {
    ticket: Ticket
    items: TicketItem[]
}

export default function TicketDetailPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()
    const ticketId = decodeURIComponent(params.id)
    const [data, setData] = useState<TicketState | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const ticket = await db.tickets.get(ticketId)
                if (cancelled) return
                if (!ticket) {
                    setError('Ticket not found locally.')
                    setLoading(false)
                    return
                }
                if (ticket.status === 'open') {
                    try {
                        document.cookie = `selectedTicket=${encodeURIComponent(
                            ticket.id
                        )}; path=/; max-age=${60 * 60 * 2}`
                    } catch {}
                    router.replace('/sales')
                    return
                }
                const items = await db.ticket_items
                    .where('ticketId')
                    .equals(ticket.id)
                    .toArray()
                if (cancelled) return
                setData({ ticket, items })
                setError(null)
            } catch (err) {
                if (cancelled) return
                console.error('Failed to load ticket', err)
                setError('Unable to load ticket details.')
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [ticketId, router])

    const subtotal = useMemo(() => {
        if (!data) return 0
        return data.items.reduce((acc, item) => {
            const qty = Number(item.qty || 0)
            const price = Number(item.price || 0)
            return acc + qty * price
        }, 0)
    }, [data])

    const ticketName = useMemo(() => {
        if (!data) return ticketId
        const record = data.ticket as Ticket & { name?: string }
        return record.name || record.id
    }, [data, ticketId])

    if (loading) {
        return (
            <div className="space-y-6 py-4 sm:py-6">
                <Link
                    href="/tickets"
                    className="text-sm text-primary underline-offset-4 hover:underline"
                >
                    ← Back to tickets
                </Link>
                <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                    Loading ticket…
                </div>
            </div>
        )
    }

    if (error || !data) {
        return (
            <div className="space-y-6 py-4 sm:py-6">
                <Link
                    href="/tickets"
                    className="text-sm text-primary underline-offset-4 hover:underline"
                >
                    ← Back to tickets
                </Link>
                <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                    {error || 'Ticket not found.'}
                </div>
            </div>
        )
    }

    const { ticket, items } = data
    const closedAt = ticket.closedAt ?? null
    const closedBy = ticket.closedBy ?? ticket.payReference ?? null
    const paymentMethod = ticket.payMethod || '—'
    const paymentAmount =
        Number.isFinite(ticket.payAmount ?? NaN) && ticket.payAmount !== null
            ? ticket.payAmount
            : subtotal

    return (
        <div className="space-y-6 py-4 sm:py-6">
            <Link
                href="/tickets"
                className="text-sm text-primary underline-offset-4 hover:underline"
            >
                ← Back to tickets
            </Link>

            <header className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">
                    Ticket {ticketName}
                </h1>
                <p className="text-sm text-muted-foreground">
                    Closed tickets are read-only snapshots of sales activity.
                </p>
            </header>

            <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Summary
                </h2>
                <dl className="mt-4 grid grid-cols-1 gap-y-4 gap-x-8 text-sm sm:grid-cols-2">
                    <div>
                        <dt className="text-muted-foreground">Ticket ID</dt>
                        <dd className="font-medium text-gray-900 dark:text-gray-100">
                            {ticket.id}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">Status</dt>
                        <dd className="font-medium text-gray-900 dark:text-gray-100">
                            {ticket.status === 'closed' ? 'Closed' : 'Open'}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">Opened By</dt>
                        <dd className="font-medium text-gray-900 dark:text-gray-100">
                            {ticket.openedBy || '—'}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">Opened At</dt>
                        <dd className="font-medium text-gray-900 dark:text-gray-100">
                            {formatDateTime(ticket.openedAt)}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">Closed By</dt>
                        <dd className="font-medium text-gray-900 dark:text-gray-100">
                            {closedBy || '—'}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">Closed At</dt>
                        <dd className="font-medium text-gray-900 dark:text-gray-100">
                            {formatDateTime(closedAt)}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">
                            Payment Method
                        </dt>
                        <dd className="font-medium text-gray-900 dark:text-gray-100">
                            {paymentMethod || '—'}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">
                            Payment Amount
                        </dt>
                        <dd className="font-medium text-gray-900 dark:text-gray-100">
                            {formatCurrency(paymentAmount)}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">Notes</dt>
                        <dd className="font-medium text-gray-900 dark:text-gray-100">
                            {ticket.notes || '—'}
                        </dd>
                    </div>
                </dl>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="border-b border-gray-200 p-4 dark:border-gray-800">
                    <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                        Items
                    </h2>
                </div>
                {items.length === 0 ? (
                    <div className="p-6 text-sm text-muted-foreground">
                        No items recorded for this ticket.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
                            <thead className="bg-gray-50 dark:bg-gray-800/50">
                                <tr>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        Item
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        Quantity
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        Price
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        Total
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                {items.map((item) => {
                                    const qty = Number(item.qty || 0)
                                    const price = Number(item.price || 0)
                                    const lineTotal = qty * price
                                    return (
                                        <tr key={item.id}>
                                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                                                {item.name || item.sku}
                                            </td>
                                            <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                                                {qty}
                                            </td>
                                            <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                                                {formatCurrency(price)}
                                            </td>
                                            <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                                                {formatCurrency(lineTotal)}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                            <tfoot className="bg-gray-50 dark:bg-gray-800/50">
                                <tr>
                                    <th
                                        colSpan={3}
                                        className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-gray-100"
                                    >
                                        Subtotal
                                    </th>
                                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100">
                                        {formatCurrency(subtotal)}
                                    </td>
                                </tr>
                                <tr>
                                    <th
                                        colSpan={3}
                                        className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-gray-100"
                                    >
                                        Payment Amount
                                    </th>
                                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100">
                                        {formatCurrency(paymentAmount)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </section>
        </div>
    )
}
