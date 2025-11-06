export default function FullWidthPageLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="relative min-h-[100svh]">
            <div className="app-backdrop" aria-hidden="true" />
            <div className="page-shell">
                <div className="app-surface overflow-hidden p-5 sm:p-7 md:p-10">
                    {children}
                </div>
            </div>
        </div>
    )
}
