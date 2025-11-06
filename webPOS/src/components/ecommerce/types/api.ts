import { GOOGLE_SCRIPT_BASE } from '@/lib/env'
import type { CartItem } from './pos'

async function openTicket(openedBy: string) {
    const res = await fetch(
        `${GOOGLE_SCRIPT_BASE}?action=openTicket&openedBy=${encodeURIComponent(openedBy)}`
    )
    return res.json() // returns { ticketId }
}

async function addItemToTicket(ticketId: string, item: CartItem) {
    const res = await fetch(
        `${GOOGLE_SCRIPT_BASE}?action=addItem` +
            `&ticketId=${ticketId}` +
            `&itemName=${encodeURIComponent(item.name)}` +
            `&qty=${item.quantity}` +
            `&price=${item.price}`
    )
    return res.json()
}

async function closeTicket(ticketId: string) {
    const res = await fetch(
        `${GOOGLE_SCRIPT_BASE}?action=closeTicket&ticketId=${ticketId}`
    )
    return res.json()
}
