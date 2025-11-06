'use client'

import Keypad from '@/components/common/Keypad'
import { getCurrentShift as dbGetCurrentShift } from '@/lib/local-pos'
import {
    fetchUserFromRemote,
    listUsersLocal,
    syncAllUsersFromRemote,
    upsertUserLocal,
    type UserProfile,
} from '@/lib/local-users'
import { cn } from '@/lib/utils'
import { useRouter, useSearchParams } from 'next/navigation'
import React from 'react'

type AllowedRole = 'admin' | 'limited'

type LockScreenProps = {
    /**
     * Fallback route to use when no explicit `from` query parameter or override is provided.
     * Defaults to `/sales` to align the POS entry flow.
     */
    defaultRedirect?: string
    /**
     * Optional override for the redirect destination. Useful when embedding the lock screen
     * outside of the `/lock` route (e.g. homepage on large displays).
     */
    redirectOverride?: string | null
    /**
     * Layout hint. `full` renders the full-screen safe-area experience used on the dedicated lock
     * route, while `panel` removes viewport padding so the keypad can live inside a card.
     */
    layout?: 'full' | 'panel'
    className?: string
}

const DEMO_PINS: Record<string, AllowedRole> = {
    '0000': 'admin',
    '1111': 'limited',
}

const resolveRole = (raw: string | null | undefined): AllowedRole => {
    const normalized = (raw ?? '').trim().toLowerCase()
    if (
        normalized === 'limited' ||
        normalized === 'read-only' ||
        normalized === 'readonly'
    ) {
        return 'limited'
    }
    return 'admin'
}

const sanitizeRedirect = (
    candidate: string | null | undefined,
    fallback: string
): string => {
    const trimmed = (candidate ?? '').trim()
    if (!trimmed) return fallback
    if (!trimmed.startsWith('/') || trimmed === '/') return fallback
    return trimmed
}

const DEMO_PROFILE: UserProfile = {
    id: '0000',
    name: 'Demo',
    role: 'admin',
    email: null,
    phone: null,
    notes: null,
}

const LOCK_CONTAINER_PADDING = {
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + 3rem)',
    paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2.5rem)',
} as const

export default function LockScreen({
    defaultRedirect = '/sales',
    redirectOverride = null,
    layout = 'full',
    className,
}: LockScreenProps) {
    const router = useRouter()
    const searchParams = useSearchParams()

    const redirectTarget = React.useMemo(
        () =>
            sanitizeRedirect(
                redirectOverride ?? searchParams?.get('from'),
                defaultRedirect
            ),
        [defaultRedirect, redirectOverride, searchParams]
    )

    const [pin, setPin] = React.useState('')
    const [error, setError] = React.useState<string | null>(null)
    const [profiles, setProfiles] = React.useState<UserProfile[]>([])
    const [loadingProfiles, setLoadingProfiles] = React.useState(true)
    const [verifying, setVerifying] = React.useState(false)

    React.useEffect(() => {
        let cancelled = false
        const applyProfiles = (rows: UserProfile[]) => {
            setProfiles(rows)
            setLoadingProfiles(false)
        }
        ;(async () => {
            try {
                const local = await listUsersLocal()
                if (cancelled) return
                applyProfiles(local)
            } catch (err) {
                console.warn('Failed to load cached PINs', err)
                if (!cancelled) applyProfiles([])
            }
            ;(async () => {
                try {
                    const refreshed = await syncAllUsersFromRemote()
                    if (!cancelled && refreshed.length) {
                        applyProfiles(refreshed)
                    }
                } catch (err) {
                    console.warn('Failed to refresh staff PINs', err)
                }
            })()
        })()
        return () => {
            cancelled = true
        }
    }, [])

    const findProfile = React.useCallback(
        (enteredPin: string): UserProfile | undefined => {
            return profiles.find((p) => p.id === enteredPin)
        },
        [profiles]
    )

    const cacheProfile = React.useCallback(
        async (
            profile: UserProfile,
            roleOverride?: AllowedRole
        ): Promise<UserProfile> => {
            const storedRole = roleOverride ?? resolveRole(profile.role)
            const nextProfile: UserProfile = {
                ...profile,
                role: storedRole,
            }
            await upsertUserLocal({
                pin: nextProfile.id,
                name: nextProfile.name,
                role: nextProfile.role ?? null,
                email: nextProfile.email ?? null,
                phone: nextProfile.phone ?? null,
                notes: nextProfile.notes ?? null,
            })
            setProfiles((prev) => {
                const exists = prev.some((p) => p.id === nextProfile.id)
                return exists
                    ? prev.map((p) =>
                          p.id === nextProfile.id ? nextProfile : p
                      )
                    : [...prev, nextProfile]
            })
            return nextProfile
        },
        []
    )

    React.useEffect(() => {
        if (pin.length !== 4 || verifying || loadingProfiles) return
        let cancelled = false
        const verify = async () => {
            setVerifying(true)
            const cleanup = () => {
                if (!cancelled) setVerifying(false)
            }
            try {
                let profile = findProfile(pin)

                if (profile) {
                    profile = await cacheProfile(profile)
                }

                if (!profile && !loadingProfiles) {
                    const remote = await fetchUserFromRemote(pin)
                    if (remote) {
                        profile = await cacheProfile(remote)
                    }
                }

                if (!profile) {
                    const demoRole = DEMO_PINS[pin]
                    if (demoRole) {
                        profile = await cacheProfile(
                            {
                                ...DEMO_PROFILE,
                                id: pin,
                                role: demoRole,
                            },
                            demoRole
                        )
                    }
                }

                if (!profile) {
                    setError('Incorrect PIN. Try again.')
                    setTimeout(() => {
                        if (!cancelled) {
                            setPin('')
                            setError(null)
                        }
                    }, 900)
                    return
                }

                const role = resolveRole(profile.role)
                const displayName = profile.name?.trim() || profile.id || pin
                const maxAge = 60 * 60 * 8
                document.cookie = `unlocked=true; path=/; max-age=${maxAge}`
                document.cookie = `role=${encodeURIComponent(role)}; path=/; max-age=${maxAge}`
                document.cookie = `pin=${encodeURIComponent(profile.id)}; path=/; max-age=${maxAge}`
                document.cookie = `name=${encodeURIComponent(displayName)}; path=/; max-age=${maxAge}`

                setError(null)
                setPin('')
                setTimeout(async () => {
                    const cur = await dbGetCurrentShift()
                    if (!cur) {
                        router.replace('/sales')
                        return
                    }
                    router.replace(redirectTarget)
                }, 0)
            } catch (err) {
                console.error('PIN verification failed', err)
                setError('Unable to verify PIN. Check your connection.')
                setTimeout(() => {
                    if (!cancelled) {
                        setPin('')
                        setError(null)
                    }
                }, 1500)
            } finally {
                cleanup()
            }
        }
        verify()
        return () => {
            cancelled = true
        }
    }, [
        pin,
        verifying,
        loadingProfiles,
        findProfile,
        cacheProfile,
        router,
        redirectTarget,
    ])

    const containerClass =
        layout === 'panel'
            ? 'flex flex-col items-center justify-center px-6 py-8'
            : 'grid min-h-[100svh] place-items-center px-4'

    return (
        <div
            className={cn(containerClass, className)}
            style={layout === 'panel' ? undefined : LOCK_CONTAINER_PADDING}
        >
            <div className="w-full max-w-[420px] rounded-2xl border border-gray-200 bg-white p-6 text-center dark:border-gray-800 dark:bg-white/3">
                <h1 className="mb-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
                    Enter Access PIN
                </h1>
                <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
                    Demo PINs: 0000 (admin) or 1111 (limited access).
                </p>

                <div className="mb-5 flex justify-center gap-3">
                    {[0, 1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className={`h-3 w-3 rounded-full transition-all ${
                                pin.length > i
                                    ? 'bg-gray-800 dark:bg-white/90'
                                    : 'bg-gray-300 dark:bg-white/30'
                            }`}
                        />
                    ))}
                </div>

                {error ? (
                    <div className="mb-4 text-sm text-red-600">{error}</div>
                ) : null}

                <Keypad
                    onDigit={(d) => {
                        if (pin.length < 4) setPin((prev) => prev + d)
                    }}
                />

                <button
                    type="button"
                    onClick={() => setPin('')}
                    className="mt-4 text-sm text-gray-600 underline underline-offset-4 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
                >
                    Clear
                </button>
            </div>
        </div>
    )
}
