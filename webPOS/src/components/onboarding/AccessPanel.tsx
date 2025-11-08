'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { bootstrapGuestExperience } from '@/lib/onboarding/guest'
import { toast } from '@/hooks/use-toast'

type AccessPanelProps = {
    hasSession?: boolean
}

export default function AccessPanel({ hasSession = false }: AccessPanelProps) {
    const [signingIn, setSigningIn] = useState(false)
    const [guestLoading, setGuestLoading] = useState(false)
    const router = useRouter()

    const handleGoogleSignIn = async () => {
        if (signingIn) return
        setSigningIn(true)
        try {
            await signIn('google', { callbackUrl: '/lock' })
        } catch (error) {
            console.error('Sign-in failed', error)
            toast({
                title: 'Unable to sign in',
                description:
                    error instanceof Error
                        ? error.message
                        : 'Check your connection and try again.',
            })
            setSigningIn(false)
        }
    }

    const handleGuestAccess = async () => {
        if (guestLoading) return
        setGuestLoading(true)
        try {
            const result = await bootstrapGuestExperience()
            toast({
                title: 'Guest mode ready',
                description: `Explore the POS instantly. PIN ${result.pin} unlocks the demo if prompted.`,
            })
            router.push('/sales')
        } catch (error) {
            console.error('Guest bootstrap failed', error)
            toast({
                title: 'Guest data failed',
                description:
                    error instanceof Error
                        ? error.message
                        : 'Refresh and try again.',
            })
        } finally {
            setGuestLoading(false)
        }
    }

    const handleSignup = () => {
        router.push('/get-started')
    }

    const handleGoToLock = () => {
        router.push('/lock')
    }

    return (
        <div className="landing-access-card space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6 text-white backdrop-blur-md">
            <div className="space-y-2">
                <p className="text-sm uppercase tracking-wide text-white/70">
                    Start Here
                </p>
                <h2 className="text-2xl font-semibold">
                    Sign in or use the demo
                </h2>
            </div>
            <div className="space-y-3">
                <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={signingIn}
                    className="flex w-full items-center justify-center gap-3 rounded-xl bg-white/90 px-4 py-3 text-base font-semibold text-gray-900 shadow-lg shadow-gray-900/20 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                    {signingIn ? 'Redirecting…' : 'Sign in with Google'}
                </button>
                <button
                    type="button"
                    onClick={handleGuestAccess}
                    disabled={guestLoading}
                    className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/40 px-4 py-3 text-base font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {guestLoading ? 'Preparing demo…' : 'Continue as guest'}
                </button>
                <button
                    type="button"
                    onClick={handleSignup}
                    className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/20 px-4 py-3 text-base font-semibold text-white/90 transition hover:bg-white/10"
                >
                    Sign up instead
                </button>
                {hasSession ? (
                    <button
                        type="button"
                        onClick={handleGoToLock}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/30 px-4 py-3 text-base font-semibold text-white transition hover:bg-white/10"
                    >
                        Open lock screen
                    </button>
                ) : null}
            </div>
        </div>
    )
}
