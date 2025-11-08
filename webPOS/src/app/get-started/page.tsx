import type { Metadata } from 'next'
import Link from 'next/link'
import TenantPersonaWizard from '@/components/onboarding/TenantPersonaWizard'

export const metadata: Metadata = {
    title: 'Sign up | Bynd POS',
    description:
        'Create an owner or sub-tenant persona for the Bynd POS experience.',
}

export default function SignupPage() {
    return (
        <main className="min-h-[100svh] bg-slate-50 py-12 text-slate-900 dark:bg-slate-950 dark:text-white">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 sm:px-8">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <p className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Step A · Create your POS persona
                        </p>
                        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                            Sign up as an account owner or sub-tenant
                        </h1>
                    </div>
                    <Link
                        href="/"
                        className="text-sm font-semibold text-slate-600 underline-offset-4 hover:underline dark:text-slate-300"
                    >
                        Back to access options
                    </Link>
                </div>
                <TenantPersonaWizard
                    restrictToDev={false}
                    title="Create a tenant or join one"
                    description="Choose owner to mint a tenant and invite, or sub-tenant to join with an invite and set your PIN."
                    instructions={null}
                    ctaHint="Use the same email on the sign-in screen to hit the PIN keypad."
                    className="bg-white dark:bg-slate-900"
                />
            </div>
        </main>
    )
}
