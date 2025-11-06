import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'

import LockScreen from '@/components/views/LockScreen'
import MobileNavGrid from '@/layout/MobileNavGrid'
import PagerAlert from '@/components/pager/PagerAlert'

export const metadata: Metadata = {
    title: 'POS | Bynd',
    description:
        'Quickly launch sales, tickets, and shift workflows from the Bynd POS home.',
}

export default function HomePage() {
    return (
        <main className="min-h-[100svh] bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-white">
            <section
                className="flex min-h-[100svh] flex-col gap-6 px-5 pb-10 md:hidden"
                style={{
                    paddingTop: 'calc(env(safe-area-inset-top, 0px) + 3.5rem)',
                    paddingBottom:
                        'calc(env(safe-area-inset-bottom, 0px) + 2.5rem)',
                }}
            >
                <header className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center rounded-full bg-brand-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                        Bynd POS
                    </span>
                    <PagerAlert />
                </header>
                <div className="flex-1">
                    <MobileNavGrid />
                </div>
                <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                    Need a different role?{' '}
                    <Link
                        href="/lock"
                        className="font-medium text-brand-600 underline underline-offset-4 dark:text-brand-300"
                    >
                        Switch user
                    </Link>
                </p>
            </section>

            <section className="relative hidden min-h-[100svh] items-center justify-center bg-gradient-to-br from-brand-500/15 via-transparent to-brand-700/20 px-6 py-10 md:flex">
                <div className="relative flex w-full max-w-6xl rounded-3xl border border-white/60 bg-white/80 p-10 shadow-xl backdrop-blur-2xl dark:border-white/10 dark:bg-white/10 dark:shadow-none">
                    <div className="flex-1 pr-12">
                        <span className="inline-flex items-center rounded-full bg-brand-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
                            Secured Access
                        </span>
                        <h2 className="mt-4 text-4xl font-semibold tracking-tight text-gray-900 dark:text-white">
                            Unlock the register to start taking orders.
                        </h2>
                        <p className="mt-3 max-w-lg text-base text-gray-600 dark:text-gray-200">
                            Enter your PIN to load the sales floor. Your access
                            level determines which tools and reports you can
                            open.
                        </p>
                        <p className="mt-5 text-sm text-gray-500 dark:text-gray-300">
                            Demo PINs: <span className="font-medium">0000</span>{' '}
                            (admin) or <span className="font-medium">1111</span>{' '}
                            (limited access).
                        </p>
                    </div>
                    <div className="flex-1 rounded-2xl border border-gray-200 bg-white/90 shadow-lg dark:border-white/10 dark:bg-white/5">
                        <Suspense fallback={null}>
                            <LockScreen
                                redirectOverride="/sales"
                                layout="panel"
                            />
                        </Suspense>
                    </div>
                </div>
            </section>
        </main>
    )
}
