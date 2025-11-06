import OpenTicketsList from '@/components/views/OpenTicketsList'

export default function TicketsPage() {
    return (
        <div className="space-y-6 py-4 sm:py-6" data-nav-target="/tickets">
            <header className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">
                    Tickets
                </h1>
                <p className="text-sm text-muted-foreground">
                    Open, save, and manage tickets.
                </p>
            </header>
            <OpenTicketsList />
        </div>
    )
}
