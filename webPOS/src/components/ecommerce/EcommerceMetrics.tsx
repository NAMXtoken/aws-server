'use client'
import { useMemo, useState } from 'react'
import { useToast } from './hooks/use-toast'
import type { Ticket } from './types/pos'

const initialTickets: Ticket[] = [
    {
        ticketId: 'T-1001',
        openedBy: 'Alex',
        openedAt: new Date(Date.now() - 1000 * 60 * 34).toISOString(),
        price: '0',
        status: 'open',
        date: new Date().toISOString().slice(0, 10),
    },
    {
        ticketId: 'T-1002',
        openedBy: 'Sam',
        openedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
        price: '0',
        status: 'open',
        date: new Date().toISOString().slice(0, 10),
    },
    {
        ticketId: 'T-1003',
        openedBy: 'Jordan',
        openedAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
        price: '0',
        status: 'open',
        date: new Date().toISOString().slice(0, 10),
    },
]

export function EcommerceMetrics() {
    const { toast } = useToast()
    const [tickets, setTickets] = useState<Ticket[]>(initialTickets)
    const [query, setQuery] = useState('')
    const [selectedTicket, setSelectedTicket] = useState<string | null>(null)
    const openedAtFormatter = useMemo(
        () =>
            new Intl.DateTimeFormat('en-US', {
                dateStyle: 'short',
                timeStyle: 'short',
                timeZone: 'UTC',
            }),
        []
    )

    const openTickets = useMemo(
        () =>
            tickets.filter(
                (t) => (t.status ?? 'open').toLowerCase() === 'open'
            ),
        [tickets]
    )

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return openTickets
        return openTickets.filter(
            (t) =>
                t.ticketId.toLowerCase().includes(q) ||
                (t.openedBy ?? '').toLowerCase().includes(q)
        )
    }, [openTickets, query])

    const handleNewTicket = () => {
        const id = `T-${Math.floor(1000 + Math.random() * 9000)}`
        const now = new Date()
        const newTicket: Ticket = {
            ticketId: id,
            openedBy: 'POS User',
            openedAt: now.toISOString(),
            price: '0',
            status: 'open',
            date: now.toISOString().slice(0, 10),
        }
        setTickets((prev) => [newTicket, ...prev])
        setSelectedTicket(id)
        toast({ title: 'Ticket opened', description: `Opened ${id}` })
    }

    const handleResume = (id: string) => {
        setSelectedTicket(id)
        toast({ title: 'Resume ticket', description: `Resuming ${id}` })
    }

    const handleClose = (id: string) => {
        setTickets((prev) =>
            prev.map((t) =>
                t.ticketId === id ? { ...t, status: 'closed' } : t
            )
        )
        if (selectedTicket === id) setSelectedTicket(null)
        toast({ title: 'Ticket closed', description: `Closed ${id}` })
    }

    return (
        <div className="p-4 sm:p-6">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        Point of Sale
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        View and manage all open tickets
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-white shadow hover:opacity-90"
                        onClick={handleNewTicket}
                    >
                        New Ticket
                    </button>
                </div>
            </div>

            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-gray-600 dark:text-gray-300">
                    Open Tickets:{' '}
                    <span className="font-medium text-gray-900 dark:text-white">
                        {openTickets.length}
                    </span>
                    {selectedTicket ? (
                        <span className="ml-2 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                            Active: {selectedTicket}
                        </span>
                    ) : null}
                </div>
                <div className="relative">
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search tickets by ID or user..."
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-primary dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                    />
                </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="border-b border-gray-200 p-4 dark:border-gray-800">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        Open Tickets
                    </h3>
                </div>

                {filtered.length === 0 ? (
                    <div className="p-6 text-sm text-gray-500 dark:text-gray-400">
                        {query
                            ? 'No tickets match your search.'
                            : 'No open tickets.'}
                    </div>
                ) : (
                    <div className="w-full overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                            <thead className="bg-gray-50 dark:bg-gray-800/50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                        Ticket
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                        Opened By
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                        Opened At
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                {filtered.map((t) => (
                                    <tr
                                        key={t.ticketId}
                                        className="hover:bg-gray-50 dark:hover:bg-gray-800/60"
                                    >
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                    #{t.ticketId}
                                                </span>
                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                    {t.date}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                                            {t.openedBy || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                                            {t.openedAt
                                                ? openedAtFormatter.format(
                                                      new Date(t.openedAt)
                                                  )
                                                : '-'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center justify-center rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                                    onClick={() =>
                                                        handleResume(t.ticketId)
                                                    }
                                                >
                                                    Resume
                                                </button>
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center justify-center rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                                                    onClick={() =>
                                                        handleClose(t.ticketId)
                                                    }
                                                >
                                                    Close
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
