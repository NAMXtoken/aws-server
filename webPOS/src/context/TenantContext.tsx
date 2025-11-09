'use client'

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    useRef,
    type ReactNode,
} from 'react'
import { useSession } from 'next-auth/react'
import { hydrateTenantCaches, shouldHydrateTenant } from '@/lib/data-refresh'
import type { TenantConfig } from '@/types/tenant'
import {
    persistTenantConfigRemote,
    fetchTenantConfigRemote,
    saveTenantConfigLocal,
    selectTenantForEmail,
    setTenantBootstrapFlag,
    getActiveTenantId,
    getTenantConfigLocal,
    deriveUserIdFromEmail,
} from '@/lib/tenant-config'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { getActiveTenantSupabaseId } from '@/lib/tenant-supabase'
import { syncMenuFromRemote } from '@/lib/local-catalog'
import { isTenantUuid, tenantSlugToSupabaseId } from '@/lib/tenant-ids'

type TenantContextValue = {
    tenant: TenantConfig | null
    loading: boolean
    userId: string | null
    markBootstrapComplete: () => Promise<void>
    refreshTenantData: () => Promise<void>
    switchTenant: (
        tenantId: string,
        options?: { fallback?: TenantConfig | null }
    ) => Promise<void>
}

const TENANT_ID_COOKIE = 'tenantId'
const TENANT_SLUG_COOKIE = 'tenantSlug'
const TENANT_EMAIL_COOKIE = 'accountEmail'
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

const setCookie = (name: string, value: string | null) => {
    if (typeof document === 'undefined') return
    if (!value) {
        document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`
        return
    }
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
}

const getCookie = (name: string): string | null => {
    if (typeof document === 'undefined') return null
    const prefix = `${name}=`
    const parts = document.cookie.split(';')
    for (const part of parts) {
        const trimmed = part.trim()
        if (!trimmed || !trimmed.startsWith(prefix)) continue
        try {
            return decodeURIComponent(trimmed.slice(prefix.length))
        } catch {
            return trimmed.slice(prefix.length)
        }
    }
    return null
}

const updateTenantCookies = async (
    tenantIdentifier: string | null,
    accountEmail: string | null
) => {
    setCookie(TENANT_EMAIL_COOKIE, accountEmail)
    if (!tenantIdentifier) {
        setCookie(TENANT_SLUG_COOKIE, null)
        setCookie(TENANT_ID_COOKIE, null)
        return
    }
    const trimmed = tenantIdentifier.trim()
    if (!trimmed) {
        setCookie(TENANT_SLUG_COOKIE, null)
        setCookie(TENANT_ID_COOKIE, null)
        return
    }
    if (isTenantUuid(trimmed)) {
        setCookie(TENANT_SLUG_COOKIE, null)
        setCookie(TENANT_ID_COOKIE, trimmed)
        return
    }
    setCookie(TENANT_SLUG_COOKIE, trimmed)
    try {
        const supabaseId = await tenantSlugToSupabaseId(trimmed)
        setCookie(TENANT_ID_COOKIE, supabaseId)
    } catch (error) {
        console.warn('Failed to derive Supabase tenant ID', error)
        setCookie(TENANT_ID_COOKIE, trimmed)
    }
}

const TenantContext = createContext<TenantContextValue>({
    tenant: null,
    loading: true,
    userId: null,
    markBootstrapComplete: async () => {
        /* no-op */
    },
    refreshTenantData: async () => {
        /* no-op */
    },
    switchTenant: async () => {
        /* no-op */
    },
})

const hydrationPromises = new Map<string, Promise<void>>()

async function hydrateTenantData(
    config: TenantConfig | null,
    options?: { force?: boolean }
): Promise<void> {
    if (!config) return
    if (typeof window === 'undefined') return
    const tenantKey =
        config.tenantId && config.tenantId.length ? config.tenantId : 'default'
    const inFlight = hydrationPromises.get(tenantKey)
    if (inFlight) {
        if (options?.force) {
            await inFlight.catch(() => undefined)
            return hydrateTenantData(config, { force: false })
        }
        return inFlight
    }
    const worker = (async () => {
        try {
            const needsHydration =
                options?.force || (await shouldHydrateTenant(config.tenantId))
            if (!needsHydration) return
            await hydrateTenantCaches(config.tenantId, {
                force: options?.force,
            })
        } catch (error) {
            console.warn('Tenant cache hydration failed', error)
        }
    })()
    const managed = worker.finally(() => {
        hydrationPromises.delete(tenantKey)
    })
    hydrationPromises.set(tenantKey, managed)
    return managed
}

export function TenantProvider({ children }: { children: ReactNode }) {
    const { data: session, status } = useSession()
    const [tenant, setTenant] = useState<TenantConfig | null>(null)
    const [loading, setLoading] = useState(true)
    const mountedRef = useRef(true)
    const queryBootstrapRef = useRef(false)

    if (typeof window !== 'undefined' && !queryBootstrapRef.current) {
        queryBootstrapRef.current = true
        try {
            const url = new URL(window.location.href)
            const tenantParam =
                url.searchParams.get('tenant') ||
                url.searchParams.get('tenantId')
            const emailParam =
                url.searchParams.get('email') ||
                url.searchParams.get('accountEmail')
            const sessionTokenParam = url.searchParams.get('sessionToken')

            const normalizedTenant = tenantParam?.trim() ?? ''
            const normalizedEmail = emailParam?.trim() ?? ''

            if (normalizedTenant || normalizedEmail) {
                void updateTenantCookies(
                    normalizedTenant || null,
                    normalizedEmail || null
                )
                if (normalizedTenant) {
                    setTenantBootstrapFlag(normalizedTenant, false)
                }
            }

            if (sessionTokenParam && sessionTokenParam.trim().length > 0) {
                setCookie('sessionToken', sessionTokenParam.trim())
            }

            const keys = [
                'tenant',
                'tenantId',
                'email',
                'accountEmail',
                'sessionToken',
            ]
            let mutated = false
            for (const key of keys) {
                if (url.searchParams.has(key)) {
                    url.searchParams.delete(key)
                    mutated = true
                }
            }
            if (mutated) {
                const nextSearch = url.searchParams.toString()
                const cleaned =
                    url.pathname +
                    (nextSearch ? `?${nextSearch}` : '') +
                    url.hash
                window.history.replaceState(null, '', cleaned)
            }
        } catch (error) {
            console.warn('Failed to bootstrap tenant context from URL', error)
        }
    }

    useEffect(() => {
        return () => {
            mountedRef.current = false
        }
    }, [])

    const applyTenantConfig = useCallback(
        async (
            incoming: TenantConfig,
            options?: {
                hydrate?: boolean
                accountEmailOverride?: string | null
            }
        ) => {
            if (!mountedRef.current) return
            const accountEmailRaw =
                incoming.accountEmail || options?.accountEmailOverride || ''
            const accountEmail =
                accountEmailRaw && accountEmailRaw.length
                    ? accountEmailRaw.trim().toLowerCase()
                    : ''
            const effective: TenantConfig = {
                ...incoming,
                accountEmail,
                updatedAt: incoming.updatedAt || Date.now(),
            }
            setTenant(effective)
            await updateTenantCookies(
                effective.tenantId,
                accountEmail ? accountEmail : null
            )
            const bootstrapComplete =
                effective.metadata?.bootstrapComplete !== false
            setTenantBootstrapFlag(effective.tenantId, bootstrapComplete)
            await saveTenantConfigLocal(effective)
            if (options?.hydrate) {
                await hydrateTenantData(effective, { force: true })
            } else {
                void hydrateTenantData(effective)
            }
        },
        []
    )

    useEffect(() => {
        let cancelled = false
        const activeTenantId = getActiveTenantId()
        if (!activeTenantId) {
            if (mountedRef.current) {
                setLoading(false)
            }
            return
        }
        ;(async () => {
            try {
                const localConfig = await getTenantConfigLocal(activeTenantId)
                if (cancelled || !mountedRef.current) return
                if (localConfig) {
                    await applyTenantConfig(localConfig, { hydrate: false })
                }
            } catch (error) {
                if (!cancelled && mountedRef.current) {
                    console.warn(
                        'Failed to load tenant from local cache',
                        error
                    )
                }
            } finally {
                if (!cancelled && mountedRef.current) {
                    setLoading(false)
                }
            }
        })()
        return () => {
            cancelled = true
        }
    }, [applyTenantConfig])

    useEffect(() => {
        if (status === 'loading') return
        let cancelled = false
        const cookieEmail = getCookie(TENANT_EMAIL_COOKIE)
        const email = session?.user?.email ?? cookieEmail ?? null
        const activeTenantId = getActiveTenantId()

        const finish = () => {
            if (!cancelled && mountedRef.current) {
                setLoading(false)
            }
        }

        if (status === 'unauthenticated' && !email && !activeTenantId) {
            finish()
            return
        }

        if (activeTenantId) {
            if (tenant && tenant.tenantId === activeTenantId) {
                finish()
                return
            }
            if (mountedRef.current) {
                setLoading(true)
            }
            ;(async () => {
                try {
                    const localConfig =
                        await getTenantConfigLocal(activeTenantId)
                    if (cancelled || !mountedRef.current) return
                    if (localConfig) {
                        await applyTenantConfig(localConfig, {
                            hydrate: false,
                            accountEmailOverride: email,
                        })
                    }
                    if (!localConfig) {
                        const remoteConfig = await fetchTenantConfigRemote(
                            activeTenantId,
                            email ?? undefined
                        )
                        if (cancelled || !mountedRef.current) return
                        if (!remoteConfig) {
                            if (email) {
                                try {
                                    const { config } =
                                        await selectTenantForEmail(email)
                                    if (
                                        cancelled ||
                                        !mountedRef.current ||
                                        !config
                                    )
                                        return
                                    await applyTenantConfig(config, {
                                        hydrate: true,
                                        accountEmailOverride: email,
                                    })
                                } catch (recoveryError) {
                                    if (!cancelled && mountedRef.current) {
                                        console.error(
                                            'Failed to recover tenant configuration',
                                            recoveryError
                                        )
                                    }
                                }
                            } else if (!cancelled && mountedRef.current) {
                                console.warn(
                                    'Active tenant configuration unavailable and no email context; skipping hydration'
                                )
                            }
                            return
                        }
                        await applyTenantConfig(remoteConfig, {
                            hydrate: true,
                            accountEmailOverride: email,
                        })
                    } else {
                        void (async () => {
                            try {
                                const remoteConfig =
                                    await fetchTenantConfigRemote(
                                        activeTenantId,
                                        email ?? undefined
                                    )
                                if (
                                    !remoteConfig ||
                                    cancelled ||
                                    !mountedRef.current
                                )
                                    return
                                await applyTenantConfig(remoteConfig, {
                                    hydrate: true,
                                    accountEmailOverride: email,
                                })
                            } catch (error) {
                                if (!cancelled && mountedRef.current) {
                                    console.warn(
                                        'Background tenant sync failed',
                                        error
                                    )
                                }
                            }
                        })()
                    }
                } catch (error) {
                    if (!cancelled && mountedRef.current) {
                        console.error('Failed to hydrate active tenant', error)
                    }
                } finally {
                    finish()
                }
            })()
            return () => {
                cancelled = true
            }
        }

        if (!email) {
            finish()
            return
        }

        if (mountedRef.current) {
            setLoading(true)
        }
        ;(async () => {
            try {
                const { config } = await selectTenantForEmail(email)
                if (cancelled || !mountedRef.current) return
                await applyTenantConfig(config, {
                    hydrate: true,
                    accountEmailOverride: email,
                })
            } catch (error) {
                if (!cancelled && mountedRef.current) {
                    console.error('Failed to select tenant', error)
                    void updateTenantCookies(null, null)
                    setTenant(null)
                }
            } finally {
                finish()
            }
        })()

        return () => {
            cancelled = true
        }
    }, [status, session?.user?.email, tenant?.tenantId, applyTenantConfig])

    const refreshTenantData = useCallback(async () => {
        if (!tenant?.metadata?.bootstrapComplete) return
        await hydrateTenantData(tenant, { force: true })
    }, [tenant])

    const switchTenant = useCallback(
        async (
            tenantId: string,
            options?: { fallback?: TenantConfig | null }
        ) => {
            const trimmed = tenantId.trim()
            if (!trimmed) return
            if (tenant && tenant.tenantId === trimmed) return

            const resolveLocalConfig = async (): Promise<TenantConfig> => {
                const provided = options?.fallback
                if (provided) return provided
                const local = await getTenantConfigLocal(trimmed)
                if (local) return local
                return {
                    tenantId: trimmed,
                    accountEmail: session?.user?.email ?? '',
                    settingsSpreadsheetId: '',
                    menuSpreadsheetId: null,
                    driveFolderId: null,
                    metadata: null,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                }
            }

            const initialConfig = await resolveLocalConfig()
            await applyTenantConfig(initialConfig, {
                hydrate: false,
                accountEmailOverride: session?.user?.email ?? null,
            })

            void (async () => {
                try {
                    const remoteConfig = await fetchTenantConfigRemote(
                        trimmed,
                        session?.user?.email ??
                            tenant?.accountEmail ??
                            undefined
                    )
                    if (!remoteConfig || !mountedRef.current) return
                    await applyTenantConfig(remoteConfig, {
                        hydrate: true,
                        accountEmailOverride: session?.user?.email ?? null,
                    })
                } catch (error) {
                    if (mountedRef.current) {
                        console.warn('Background tenant sync failed', error)
                    }
                }
            })()
        },
        [tenant, applyTenantConfig, session?.user?.email]
    )

    const markBootstrapComplete = useCallback(async () => {
        if (!tenant) return
        if (tenant.metadata?.bootstrapComplete) return
        const next: TenantConfig = {
            ...tenant,
            metadata: { ...(tenant.metadata ?? {}), bootstrapComplete: true },
            updatedAt: Date.now(),
        }
        setTenant(next)
        await updateTenantCookies(next.tenantId, next.accountEmail)
        setTenantBootstrapFlag(next.tenantId, true)
        await saveTenantConfigLocal(next)
        await persistTenantConfigRemote(next.tenantId, {
            accountEmail: next.accountEmail,
            settingsSpreadsheetId: next.settingsSpreadsheetId,
            menuSpreadsheetId: next.menuSpreadsheetId ?? undefined,
            driveFolderId: next.driveFolderId ?? undefined,
            metadata: next.metadata ?? null,
            tenantId: '',
            createdAt: 0,
            updatedAt: 0,
        })
        await hydrateTenantData(next, { force: true })
    }, [tenant])

    const userId = useMemo(
        () =>
            tenant?.accountEmail
                ? deriveUserIdFromEmail(tenant.accountEmail)
                : null,
        [tenant?.accountEmail]
    )

    useEffect(() => {
        if (!tenant) return
        const supabase = getSupabaseBrowserClient()
        let channel: ReturnType<typeof supabase.channel> | null = null
        let cancelled = false
        ;(async () => {
            const supabaseId = await getActiveTenantSupabaseId()
            if (!supabaseId || cancelled) return
            channel = supabase
                .channel(`menu-items-${supabaseId}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'menu_items',
                        filter: `tenant_id=eq.${supabaseId}`,
                    },
                    () => {
                        void syncMenuFromRemote({ ignoreBootstrap: true })
                    }
                )
                .subscribe()
        })()
        return () => {
            cancelled = true
            channel?.unsubscribe()
        }
    }, [tenant?.tenantId])

    const value = useMemo<TenantContextValue>(
        () => ({
            tenant,
            loading,
            userId,
            markBootstrapComplete,
            refreshTenantData,
            switchTenant,
        }),
        [
            tenant,
            loading,
            userId,
            markBootstrapComplete,
            refreshTenantData,
            switchTenant,
        ]
    )

    useEffect(() => {
        if (!tenant) return
        void hydrateTenantData(tenant)
    }, [tenant])

    return (
        <TenantContext.Provider value={value}>
            {children}
        </TenantContext.Provider>
    )
}

export const useTenant = (): TenantContextValue => {
    return useContext(TenantContext)
}
