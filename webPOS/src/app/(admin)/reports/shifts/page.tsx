export const dynamic = 'force-dynamic'
export const revalidate = 0

import Link from 'next/link'
import PaymentDonut from '@/components/reports/PaymentDonut'
import TopItemsBar from '@/components/reports/TopItemsBar'
import { fetchShiftSummary } from '@/lib/reports'
import ShiftClosuresView from '@/components/reports/ShiftClosuresView'

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="text-xs text-gray-500 dark:text-gray-400">
                {label}
            </div>
            <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                {value}
            </div>
        </div>
    )
}

export default async function ShiftsReportPage() {
    const shift = await fetchShiftSummary()
    const open = shift.open
    const cash = open?.cashSales ?? 0
    const card = open?.cardSales ?? 0
    const prompt = open?.promptPaySales ?? 0
    const items = open?.itemsSold ?? []

    return (
        <div className="space-y-6 py-4 sm:py-6">
            <header className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">
                    Shifts Report
                </h1>
                <p className="text-sm text-muted-foreground">
                    Live open-shift metrics. For actions, see the
                    <Link href="/shift" className="ml-1 text-primary underline">
                        Shift page
                    </Link>
                    .
                </p>
            </header>

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Tickets" value={String(open?.ticketsCount ?? 0)} />
                <Stat label="Cash Sales" value={cash.toFixed(2)} />
                <Stat label="Card Sales" value={card.toFixed(2)} />
                <Stat label="PromptPay Sales" value={prompt.toFixed(2)} />
            </section>

            <section className="grid gap-4 md:grid-cols-2">
                <PaymentDonut cash={cash} card={card} prompt={prompt} />
                <TopItemsBar
                    items={items.map((i) => ({ name: i.name, qty: i.qty }))}
                />
            </section>

            {!open && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    No open shift detected. Open a shift to view live metrics.
                </p>
            )}

            <ShiftClosuresView />
        </div>
    )
}
