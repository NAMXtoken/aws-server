import SalesRangeView from '@/components/reports/SalesRangeView'

export default async function SalesReportPage() {
    return (
        <div className="space-y-6 py-4 sm:py-6">
            <header className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">
                    Sales Report
                </h1>
                <p className="text-sm text-muted-foreground">
                    Review daily performance, payment mix, and team highlights.
                </p>
            </header>

            <SalesRangeView />
        </div>
    )
}
