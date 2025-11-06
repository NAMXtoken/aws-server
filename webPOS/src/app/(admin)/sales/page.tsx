import { TicketView } from '@/components/views/TicketView'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Sales | POS',
    description: 'Sales (POS) view with menu and tickets',
}

export default function SalesPage() {
    return (
        <div
            className="grid grid-cols-12 pt-[8px] gap-4 md:gap-6"
            data-nav-target="/sales"
        >
            <div className="col-span-12">
                <TicketView />
            </div>
        </div>
    )
}
