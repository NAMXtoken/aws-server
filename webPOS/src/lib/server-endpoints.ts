type EndpointOverrides = {
    httpBase?: string | null
    wsBase?: string | null
}

const STORAGE_KEYS = {
    http: 'bynd:server:httpBase',
    ws: 'bynd:server:wsBase',
}

const ENV_HTTP_BASE =
    process.env.NEXT_PUBLIC_SERVER_BASE_URL?.replace(/\/$/, '') ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    ''

const ENV_WS_BASE = process.env.NEXT_PUBLIC_SERVER_WS_URL?.trim() || ''

let overrides: EndpointOverrides | null = null
let overridesHydrated = false

function coerceString(value: unknown): string | null {
    if (value == null) return null
    const trimmed = String(value).trim()
    return trimmed.length ? trimmed : null
}

function normalizeHttpBase(base: string | null | undefined): string | null {
    const value = coerceString(base)
    if (!value) return null
    try {
        const url = new URL(value.includes('://') ? value : `https://${value}`)
        url.pathname = url.pathname.replace(/\/$/, '')
        return url.toString().replace(/\/$/, '')
    } catch {
        return null
    }
}

function normalizeWsBase(base: string | null | undefined): string | null {
    const value = coerceString(base)
    if (!value) return null
    try {
        const url = new URL(
            value.includes('://') ? value : `ws${value.startsWith('s') ? '' : 's'}://${value}`
        )
        if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
            url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
        }
        url.pathname = url.pathname.replace(/\/$/, '')
        return url.toString().replace(/\/$/, '')
    } catch {
        return null
    }
}

function httpToWebSocket(base: string): string | null {
    try {
        const url = new URL(base)
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
        url.pathname = url.pathname.replace(/\/$/, '')
        return url.toString()
    } catch {
        return null
    }
}

function readWindowGlobalOverrides(): EndpointOverrides | null {
    if (typeof window === 'undefined') return null
    const globalValue = (window as unknown as { __BYND_SERVER_ENDPOINTS__?: EndpointOverrides })
        .__BYND_SERVER_ENDPOINTS__
    if (!globalValue) return null
    return {
        httpBase: normalizeHttpBase(globalValue.httpBase),
        wsBase: normalizeWsBase(globalValue.wsBase),
    }
}

function readStoredOverrides(): EndpointOverrides | null {
    if (typeof window === 'undefined') return null
    try {
        const http = normalizeHttpBase(window.localStorage.getItem(STORAGE_KEYS.http))
        const ws = normalizeWsBase(window.localStorage.getItem(STORAGE_KEYS.ws))
        if (!http && !ws) return null
        return { httpBase: http, wsBase: ws }
    } catch {
        return null
    }
}

function ensureOverridesHydrated() {
    if (overridesHydrated) return
    overridesHydrated = true
    overrides =
        readWindowGlobalOverrides() ||
        readStoredOverrides() || {
            httpBase: null,
            wsBase: null,
        }
}

function persistOverrides(config: EndpointOverrides | null) {
    if (typeof window === 'undefined' || !config) return
    try {
        if (config.httpBase) window.localStorage.setItem(STORAGE_KEYS.http, config.httpBase)
        else window.localStorage.removeItem(STORAGE_KEYS.http)
        if (config.wsBase) window.localStorage.setItem(STORAGE_KEYS.ws, config.wsBase)
        else window.localStorage.removeItem(STORAGE_KEYS.ws)
    } catch {
        /* ignore persistence errors */
    }
}

function getHttpBase(): string | null {
    ensureOverridesHydrated()
    const override = normalizeHttpBase(overrides?.httpBase)
    if (override) return override
    const envBase = normalizeHttpBase(ENV_HTTP_BASE)
    if (envBase) return envBase
    if (typeof window !== 'undefined') {
        return window.location.origin.replace(/\/$/, '')
    }
    return null
}

function getWebSocketBase(): string | null {
    ensureOverridesHydrated()
    const override = normalizeWsBase(overrides?.wsBase)
    if (override) return override
    const envBase = normalizeWsBase(ENV_WS_BASE)
    if (envBase) return envBase
    const httpBase = getHttpBase()
    if (httpBase) {
        const derived = httpToWebSocket(httpBase)
        if (derived) return derived
    }
    if (typeof window !== 'undefined') {
        const origin = window.location.origin
        return httpToWebSocket(origin)
    }
    return null
}

export function resolveServerHttp(path: string): string | null {
    const base = getHttpBase()
    if (!base) return null
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    return `${base}${normalizedPath}`
}

export function resolveServerWebSocket(
    tenantId: string,
    pin: string | null,
    role: string | null
): string | null {
    const base = getWebSocketBase()
    if (!base) return null
    const url = new URL(base)
    url.pathname = url.pathname.replace(/\/$/, '') + '/api/ws'
    if (tenantId) url.searchParams.set('tenantId', tenantId)
    if (pin) url.searchParams.set('pin', pin)
    if (role) url.searchParams.set('role', role)
    return url.toString()
}

export function setServerEndpointOverrides(
    config: EndpointOverrides | null,
    options: { persist?: boolean } = {}
) {
    overridesHydrated = true
    overrides = {
        httpBase: normalizeHttpBase(config?.httpBase),
        wsBase: normalizeWsBase(config?.wsBase),
    }
    if (options.persist) {
        persistOverrides(overrides)
    }
}

export function getServerEndpointSnapshot(): {
    httpBase: string | null
    wsBase: string | null
} {
    return {
        httpBase: getHttpBase(),
        wsBase: getWebSocketBase(),
    }
}
