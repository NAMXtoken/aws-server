import { GOOGLE_SCRIPT_BASE } from '@/lib/env'
import { replicateGasPayloadToSupabase } from '@/lib/supabase/gas-sync'
import { isTenantUuid } from '@/lib/tenant-ids'
import { getToken } from 'next-auth/jwt'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const GAS_DISABLED =
    process.env.NEXT_PUBLIC_DISABLE_GAS === 'true' ||
    process.env.DISABLE_GAS === 'true'

// Simple in-memory TTL cache (per edge instance)
type CacheEntry = { expires: number; data: unknown; status: number }
const memoryCache = new Map<string, CacheEntry>()
// Keep listOpenTickets uncached to avoid stale open/closed state after payments
// Do not cache 'categories' to avoid stale removals
const CACHEABLE_ACTIONS = new Set(['menu', 'bootstrap', 'dailySalesSummary'])
const SHORT_TTL_MS = 5_000 // 5s for open tickets
const DEFAULT_TTL_MS = 60_000 // 60s for menu/categories/bootstrap
const LONG_TTL_MS = 5 * 60_000 // 5 minutes for heavy reports
const ACTION_TTL_OVERRIDES: Record<string, number> = {
    listOpenTickets: SHORT_TTL_MS,
    dailySalesSummary: LONG_TTL_MS,
}
const MUTATING_ACTIONS = new Set([
    'saveUser',
    'changePin',
    'recordTicket',
    'recordShift',
    'savePosSettings',
    'saveMenuItem',
    'saveCategory',
    'setMenuImage',
    'addIngredientStock',
    'consumeIngredient',
    'recordRestock',
    'saveTenantConfig',
    'clockPunch',
    'uploadExport',
    'uploadReceipt',
    'pageUser',
    'ackPager',
    'registerPushSubscription',
    'unregisterPushSubscription',
    'saveOpenTicketsSnapshot',
])
const DEFAULT_TIMEOUT_MS = 45_000
const MAX_RETRIES = 2
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])
const TENANT_ID_COOKIE = 'tenantId'
const TENANT_SLUG_COOKIE = 'tenantSlug'
const TENANT_EMAIL_COOKIE = 'accountEmail'

const parseCookies = (header: string | null) => {
    if (!header) return new Map<string, string>()
    const map = new Map<string, string>()
    header
        .split(';')
        .map((p) => p.trim())
        .forEach((pair) => {
            if (!pair) return
            const idx = pair.indexOf('=')
            if (idx === -1) return
            const key = pair.slice(0, idx)
            const value = pair.slice(idx + 1)
            if (!key) return
            try {
                map.set(key, decodeURIComponent(value))
            } catch {
                map.set(key, value)
            }
        })
    return map
}

const readTenantContext = (req: Request) => {
    const cookies = parseCookies(req.headers.get('cookie'))
    const rawTenant = cookies.get(TENANT_ID_COOKIE) || ''
    const tenantSlug =
        cookies.get(TENANT_SLUG_COOKIE) ||
        (rawTenant && !isTenantUuid(rawTenant) ? rawTenant : '')
    const accountEmail = cookies.get(TENANT_EMAIL_COOKIE) || ''
    return { tenantId: tenantSlug, supabaseTenantId: rawTenant, accountEmail }
}

function cacheKeyFromUrl(url: string) {
    // Key by the full upstream URL (or synthetic action for bootstrap)
    return url
}

function paramsToObject(params: URLSearchParams): Record<string, string> {
    const result: Record<string, string> = {}
    params.forEach((value, key) => {
        result[key] = value
    })
    return result
}

function ttlForAction(action: string | null): number {
    if (!action) return DEFAULT_TTL_MS
    return ACTION_TTL_OVERRIDES[action] ?? DEFAULT_TTL_MS
}

function setCachingHeaders(res: NextResponse, ttlMilliseconds: number) {
    const ttlSeconds = Math.floor(ttlMilliseconds / 1000)
    res.headers.set(
        'Cache-Control',
        `s-maxage=${ttlSeconds}, stale-while-revalidate=${ttlSeconds * 5}`
    )
}

async function forwardToGoogleWithJson(
    payload: Record<string, unknown>,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
) {
    let attempt = 0
    let lastError: unknown = null
    while (attempt <= MAX_RETRIES) {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), timeoutMs)
        try {
            const res = await fetch(GOOGLE_SCRIPT_BASE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal,
            })
            const raw = await res.text()
            let data: unknown = null
            try {
                data = raw ? JSON.parse(raw) : null
            } catch {
                data = null
            }
            if (
                !res.ok &&
                RETRYABLE_STATUS.has(res.status) &&
                attempt < MAX_RETRIES
            ) {
                lastError = { res, raw }
                await new Promise((resolve) =>
                    setTimeout(resolve, 250 * Math.pow(2, attempt))
                )
                attempt += 1
                continue
            }
            return { res, data, raw }
        } catch (error) {
            if (
                error instanceof Error &&
                error.name === 'AbortError' &&
                attempt >= MAX_RETRIES
            ) {
                throw error
            }
            lastError = error
            if (attempt >= MAX_RETRIES) throw error
            await new Promise((resolve) =>
                setTimeout(resolve, 250 * Math.pow(2, attempt))
            )
            attempt += 1
        } finally {
            clearTimeout(timeout)
        }
    }
    if (lastError instanceof Error) {
        throw lastError
    }
    throw new Error('Failed to reach Google Apps Script')
}

async function resolveActor(req: Request): Promise<string | null> {
    try {
        const token = await getToken({ req: req as any })
        const email = (token as any)?.email as string | undefined
        const name = (token as any)?.name as string | undefined
        if (email || name) return email || name || null
    } catch {
        // fall through to cookie parsing
    }
    try {
        const cookie = req.headers.get('cookie') || ''
        // naive parse for pin/role cookies
        const map = Object.fromEntries(
            cookie
                .split(';')
                .map((p) => p.trim().split('=').map(decodeURIComponent))
                .filter((kv) => kv.length === 2)
        )
        const pin = map['pin']
        const role = map['role']
        const name = map['name']
        const actor =
            name ||
            (pin ? `pin:${pin}` : null) ||
            (role ? `role:${role}` : null)
        return actor || null
    } catch {
        return null
    }
}

export async function GET(req: Request) {
    try {
        const url = new URL(req.url)
        const { searchParams } = url
        const tenant = readTenantContext(req)
        if (tenant.tenantId && !searchParams.has('tenantId')) {
            searchParams.set('tenantId', tenant.tenantId)
        }
        if (tenant.accountEmail && !searchParams.has('accountEmail')) {
            searchParams.set('accountEmail', tenant.accountEmail)
        }
        const action = searchParams.get('action')
        if (!action) {
            return NextResponse.json(
                { ok: false, error: 'action required' },
                { status: 400 }
            )
        }

        if (GAS_DISABLED) {
            switch (action) {
                case 'bootstrap':
                    return NextResponse.json({
                        menu: [],
                        categories: [],
                        openTickets: [],
                    })
                case 'menu':
                case 'categories':
                case 'ingredients':
                case 'restocks':
                case 'inventoryUnits':
                case 'listPushSubscriptions':
                    return NextResponse.json({ ok: true, items: [] })
                case 'listUsers':
                    return NextResponse.json({ ok: true, users: [] })
                case 'getUser':
                    return NextResponse.json({ ok: true, user: null })
                case 'listOpenTickets':
                    return NextResponse.json({ ok: true, tickets: [] })
                case 'shiftSummary':
                    return NextResponse.json({ ok: true, open: null })
                case 'getCurrentShift':
                    return NextResponse.json({ ok: true, shift: null })
                case 'salesByDay':
                case 'salesByMonth':
                case 'summaryByWindow':
                case 'salesByItem':
                    return NextResponse.json({ ok: true, data: [] })
                default:
                    return NextResponse.json(
                        { ok: false, error: 'gas-disabled', action },
                        { status: 503 }
                    )
            }
        }
        // Bootstrap is a synthetic action handled here to reduce client round-trips
        if (action === 'bootstrap') {
            const tenantKey = tenant.tenantId || 'default'
            const key = cacheKeyFromUrl(`bootstrap:${tenantKey}`)
            const now = Date.now()
            const cached = memoryCache.get(key)
            if (cached && cached.expires > now) {
                const resp = NextResponse.json(cached.data, {
                    status: cached.status,
                })
                setCachingHeaders(resp, DEFAULT_TTL_MS)
                return resp
            }

            const tenantQuery = new URLSearchParams()
            if (tenant.tenantId) tenantQuery.set('tenantId', tenant.tenantId)
            if (tenant.accountEmail)
                tenantQuery.set('accountEmail', tenant.accountEmail)
            const tenantSuffix = tenantQuery.toString()
            const tenantQs = tenantSuffix ? `&${tenantSuffix}` : ''

            const menuUrl = `${GOOGLE_SCRIPT_BASE}?action=menu${tenantQs}`
            const catUrl = `${GOOGLE_SCRIPT_BASE}?action=categories${tenantQs}`
            const ticketsUrl = `${GOOGLE_SCRIPT_BASE}?action=listOpenTickets${tenantQs}`

            const [menuRes, catRes, ticketsRes] = await Promise.all([
                fetch(menuUrl, {
                    method: 'GET',
                    cache: 'force-cache',
                    next: { revalidate: 60 },
                }),
                // Categories should reflect immediate changes; skip caching
                fetch(catUrl, { method: 'GET', cache: 'no-store' }),
                fetch(ticketsUrl, { method: 'GET', cache: 'no-store' }),
            ])

            const [menuRaw, catRaw, ticketsRaw] = await Promise.all([
                menuRes.text(),
                catRes.text(),
                ticketsRes.text(),
            ])

            try {
                const menu = menuRaw ? JSON.parse(menuRaw) : []
                const categories = catRaw ? JSON.parse(catRaw) : []
                const openTickets = ticketsRaw ? JSON.parse(ticketsRaw) : []
                const combined = { menu, categories, openTickets }
                const status =
                    menuRes.ok && catRes.ok && ticketsRes.ok ? 200 : 207 // multi-status-ish
                memoryCache.set(key, {
                    data: combined,
                    status,
                    expires: now + DEFAULT_TTL_MS,
                })
                const resp = NextResponse.json(combined, { status })
                setCachingHeaders(resp, DEFAULT_TTL_MS)
                return resp
            } catch {
                return NextResponse.json(
                    {
                        ok: false,
                        error: 'Upstream returned non-JSON during bootstrap',
                        statuses: {
                            menu: menuRes.status,
                            categories: catRes.status,
                            openTickets: ticketsRes.status,
                        },
                    },
                    { status: 502 }
                )
            }
        }

        // Pass through query to GAS for other actions
        // Attach actor for mutating GET actions
        const forceFresh = searchParams.get('fresh') === '1'
        if (forceFresh) searchParams.delete('fresh')

        if (MUTATING_ACTIONS.has(action)) {
            const actor = await resolveActor(req)
            if (actor) {
                searchParams.set('actor', actor)
            }
            const payload = paramsToObject(searchParams)
            if (!payload.action) {
                payload.action = action
            }
            const { res, data, raw } = await forwardToGoogleWithJson(payload)
            if (data === null) {
                return NextResponse.json(
                    {
                        ok: false,
                        error: 'Upstream returned non-JSON',
                        status: res.status,
                        bodySnippet: raw.slice(0, 300),
                    },
                    { status: 502 }
                )
            }
            return NextResponse.json(data, {
                status: res.ok ? 200 : res.status,
            })
        }

        const actor = await resolveActor(req)
        if (actor && !searchParams.has('actor')) {
            searchParams.set('actor', actor)
        }
        const urlWithParams = `${GOOGLE_SCRIPT_BASE}?${searchParams.toString()}`

        const isCacheable = CACHEABLE_ACTIONS.has(action)
        const key = cacheKeyFromUrl(urlWithParams)
        const now = Date.now()
        if (isCacheable && !forceFresh) {
            const cached = memoryCache.get(key)
            if (cached && cached.expires > now) {
                const resp = NextResponse.json(cached.data, {
                    status: cached.status,
                })
                const ttl = ttlForAction(action)
                setCachingHeaders(resp, ttl)
                return resp
            }
        }

        const res = await fetch(urlWithParams, {
            method: 'GET',
            cache: forceFresh || !isCacheable ? 'no-store' : 'force-cache',
            ...(!forceFresh && isCacheable ? { next: { revalidate: 60 } } : {}),
        })
        const raw = await res.text()
        try {
            const data = raw ? JSON.parse(raw) : null
            if (isCacheable) {
                const ttl = ttlForAction(action)
                memoryCache.set(key, {
                    data,
                    status: res.ok ? 200 : res.status,
                    expires: now + ttl,
                })
            }
            const resp = NextResponse.json(data, {
                status: res.ok ? 200 : res.status,
            })
            if (isCacheable) {
                const ttl = ttlForAction(action)
                setCachingHeaders(resp, ttl)
            }
            return resp
        } catch {
            return NextResponse.json(
                {
                    ok: false,
                    error: 'Upstream returned non-JSON',
                    status: res.status,
                    bodySnippet: raw.slice(0, 300),
                },
                { status: 502 }
            )
        }
    } catch (e: unknown) {
        const err = e as Error
        return NextResponse.json(
            { ok: false, error: String((err && err.message) || e) },
            { status: 500 }
        )
    }
}
export async function POST(req: Request) {
    try {
        const payload = await req.json().catch(() => ({}))
        if (GAS_DISABLED) {
            return NextResponse.json({ ok: true })
        }
        const tenant = readTenantContext(req)
        if (
            tenant.tenantId &&
            payload &&
            typeof payload === 'object' &&
            !('tenantId' in payload)
        ) {
            ;(payload as any).tenantId = tenant.tenantId
        }
        if (
            tenant.accountEmail &&
            payload &&
            typeof payload === 'object' &&
            !('accountEmail' in payload)
        ) {
            ;(payload as any).accountEmail = tenant.accountEmail
        }
        // Attach actor for POST if not present
        if (payload && typeof payload === 'object' && !('actor' in payload)) {
            const actor = await resolveActor(req)
            if (actor) (payload as any).actor = actor
        }
        if (!payload || !payload.action) {
            return NextResponse.json(
                { ok: false, error: 'action required' },
                { status: 400 }
            )
        }
        try {
            await replicateGasPayloadToSupabase(payload, tenant)
        } catch (error) {
            console.error('Supabase replication failed', error)
        }
        const { res, data, raw } = await forwardToGoogleWithJson(payload)
        if (data === null) {
            return NextResponse.json(
                {
                    ok: false,
                    error: 'Upstream returned non-JSON',
                    status: res.status,
                    bodySnippet: raw.slice(0, 300),
                },
                { status: 502 }
            )
        }
        return NextResponse.json(data, {
            status: res.ok ? 200 : res.status,
        })
    } catch (e: unknown) {
        const err = e as Error
        return NextResponse.json(
            { ok: false, error: String((err && err.message) || e) },
            { status: 500 }
        )
    }
}
