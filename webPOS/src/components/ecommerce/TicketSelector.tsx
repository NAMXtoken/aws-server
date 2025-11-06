// TicketSelector.tsx
import { CartItem } from './types/pos'
import React, { ReactNode, useState } from 'react'

type Ticket = {
    ticketName: ReactNode
    ticketId: string
    openedBy: string
    openedAt: string
}

interface TicketSelectorProps {
    openTickets: Ticket[]
    selectedTicket: string | null
    cartByTicket: Record<string, CartItem[]>
    setSelectedTicket: (ticketId: string | null) => void
    openTicket: (openedBy: string) => Promise<{ ticketId: string }>
    fetchOpenTickets: () => void
    closeTicket: (ticketId: string) => Promise<void>
}

export const TicketSelector: React.FC<TicketSelectorProps> = ({
    openTickets,
    selectedTicket,
    cartByTicket,
    setSelectedTicket,
    openTicket,
    fetchOpenTickets,
    closeTicket,
}) => {
    const [showOpenTicketsView, setShowOpenTicketsView] = useState(true)
    const [localTicketId, setLocalTicketId] = useState<string | null>(null)
    const [cartItems, setCartItems] = useState<CartItem[]>([])

    const handleNewTicket = async () => {
        const tempId = `temp-${Date.now()}` // local temporary ticketId
        setLocalTicketId(tempId)
        setCartItems([]) // reset cart
        setCurrentView('pos')
    }

    const handleSelectTicket = (ticketId: string) => {
        setSelectedTicket(ticketId)
        setShowOpenTicketsView(false)
    }

    const handleBackToOpenTickets = async () => {
        if (selectedTicket) {
            const items = cartByTicket[selectedTicket] || []
            if (items.length === 0) {
                // Automatically close empty ticket
                await closeTicket(selectedTicket)
                fetchOpenTickets()
            }
        }
        setSelectedTicket(null)
        setShowOpenTicketsView(true)
    }

    return (
        <div className="px-6 py-2">
            {showOpenTicketsView ? (
                <div className="flex gap-2 overflow-x-auto">
                    <button
                        onClick={handleNewTicket}
                        className="px-4 py-2 rounded bg-green-500 text-white"
                    >
                        + New Ticket
                    </button>
                    {openTickets.map((ticket) => (
                        <button
                            key={ticket.ticketId}
                            onClick={() => handleSelectTicket(ticket.ticketId)}
                            className={`px-4 py-2 rounded ${
                                selectedTicket === ticket.ticketId
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-200'
                            }`}
                        >
                            {ticket.ticketName}
                        </button>
                    ))}
                </div>
            ) : selectedTicket ? (
                <div className="flex gap-2">
                    <button
                        onClick={handleBackToOpenTickets}
                        className="px-4 py-2 rounded bg-gray-300 text-gray-800"
                    >
                        Back to Open Tickets
                    </button>
                    <span className="px-4 py-2 rounded bg-primary text-primary-foreground">
                        Ticket #{selectedTicket}
                    </span>
                </div>
            ) : null}
        </div>
    )
}
function setCurrentView(arg0: string) {
    throw new Error('Function not implemented.')
}
