import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import AccessPanel from '@/components/onboarding/AccessPanel'
import { authOptions } from '@/lib/auth/options'

export const metadata: Metadata = {
    title: 'POS | Bynd',
    description:
        'Quickly launch sales, tickets, and shift workflows from the Bynd POS home.',
}

export default async function HomePage() {
    const session = await getServerSession(authOptions)

    return (
        <main className="relative min-h-[100svh] overflow-hidden bg-slate-950 text-white">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.2)_0,_rgba(15,23,42,0)_55%),radial-gradient(circle_at_bottom,_rgba(14,165,233,0.25)_0,_rgba(2,6,23,0)_60%)]" />
            <section className="relative mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-6 py-16 text-center">
                <span className="inline-flex items-center rounded-full border border-white/30 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/80">
                    POS Access
                </span>
                <div className="max-w-xl space-y-3">
                    <h1 className="text-4xl font-semibold tracking-tight text-white">
                        Step in, or preview the POS.
                    </h1>
                    <p className="text-base text-white/70">
                        Pick how you want to enter—sign in, try the guest demo,
                        or spin up a tenant via the sign-up link.
                    </p>
                </div>
                <AccessPanel hasSession={Boolean(session)} />
            </section>
        </main>
    )
}
