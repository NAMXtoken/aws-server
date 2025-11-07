'use client'

export type NativeCacheRecord = {
    namespace: string
    key: string
    payload: string
    updatedAt: number
}

export type NativeCacheResponse = {
    ok: boolean
    error?: string
    record?: NativeCacheRecord | null
    records?: NativeCacheRecord[]
    removed?: boolean
    cleared?: number
}

type NativeCacheBridge = {
    put(namespace: string, key: string, payload: string): string | undefined
    get(namespace: string, key: string): string | undefined
    list(namespace: string): string | undefined
    remove(namespace: string, key: string): string | undefined
    clear(namespace: string): string | undefined
    clearAll(): string | undefined
}

export type NativeCacheAPI = {
    put(namespace: string, key: string, payload: string): Promise<NativeCacheResponse>
    get(namespace: string, key: string): Promise<NativeCacheResponse>
    list(namespace: string): Promise<NativeCacheResponse>
    remove(namespace: string, key: string): Promise<NativeCacheResponse>
    clear(namespace: string): Promise<NativeCacheResponse>
    clearAll(): Promise<NativeCacheResponse>
}

declare global {
    interface Window {
        ByndNativeCache?: NativeCacheBridge
    }
}

const READY_EVENT_NAME = 'byndNativeCacheReady'
const pendingResolvers = new Set<(api: NativeCacheAPI | null) => void>()
let cachedApi: NativeCacheAPI | null = null
let readyListenerInstalled = false

const notifyResolvers = () => {
    if (!pendingResolvers.size) {
        return
    }
    for (const resolver of Array.from(pendingResolvers)) {
        pendingResolvers.delete(resolver)
        resolver(cachedApi)
    }
}

const installReadyListener = () => {
    if (readyListenerInstalled || typeof window === 'undefined') {
        return
    }
    readyListenerInstalled = true
    window.addEventListener(READY_EVENT_NAME, () => {
        if (window.ByndNativeCache) {
            cachedApi = createNativeCacheApi(window.ByndNativeCache)
            notifyResolvers()
        }
    })
    if (window.ByndNativeCache) {
        cachedApi = createNativeCacheApi(window.ByndNativeCache)
        notifyResolvers()
    }
}

installReadyListener()

function createNativeCacheApi(bridge: NativeCacheBridge): NativeCacheAPI {
    const callBridge = (
        method: keyof NativeCacheBridge,
        ...args: unknown[]
    ): NativeCacheResponse => {
        const impl = bridge[method]
        if (typeof impl !== 'function') {
            return { ok: false, error: 'missing_bridge_method' }
        }
        try {
            const handler = impl as (...handlerArgs: unknown[]) => string | undefined
            const raw = handler.apply(bridge, args)
            return normalizeResponse(raw)
        } catch (error) {
            return {
                ok: false,
                error:
                    error instanceof Error
                        ? error.message
                        : 'native_cache_error',
            }
        }
    }

    return {
        put: (namespace, key, payload) =>
            Promise.resolve(callBridge('put', namespace, key, payload)),
        get: (namespace, key) =>
            Promise.resolve(callBridge('get', namespace, key)),
        list: (namespace) =>
            Promise.resolve(callBridge('list', namespace)),
        remove: (namespace, key) =>
            Promise.resolve(callBridge('remove', namespace, key)),
        clear: (namespace) =>
            Promise.resolve(callBridge('clear', namespace)),
        clearAll: () => Promise.resolve(callBridge('clearAll')),
    }
}

function normalizeResponse(payload: unknown): NativeCacheResponse {
    if (
        payload &&
        typeof payload === 'object' &&
        'ok' in payload &&
        typeof (payload as { ok: unknown }).ok === 'boolean'
    ) {
        return payload as NativeCacheResponse
    }
    if (typeof payload === 'string' && payload.trim().length) {
        try {
            const parsed = JSON.parse(payload) as NativeCacheResponse
            if (parsed && typeof parsed.ok === 'boolean') {
                return parsed
            }
        } catch {
            return { ok: false, error: 'native_cache_malformed_json' }
        }
    }
    return { ok: false, error: 'native_cache_empty_response' }
}

export function isNativeCacheAvailable() {
    return Boolean(cachedApi)
}

export function waitForNativeCache(timeoutMs = 1500) {
    if (typeof window === 'undefined') {
        return Promise.resolve<NativeCacheAPI | null>(null)
    }
    if (cachedApi) {
        return Promise.resolve(cachedApi)
    }

    installReadyListener()

    return new Promise<NativeCacheAPI | null>((resolve) => {
        let settled = false
        const timeout = window.setTimeout(() => {
            if (settled) return
            settled = true
            pendingResolvers.delete(resolver)
            resolve(cachedApi)
        }, timeoutMs)
        const resolver = (api: NativeCacheAPI | null) => {
            if (settled) {
                return
            }
            settled = true
            window.clearTimeout(timeout)
            resolve(api)
        }
        pendingResolvers.add(resolver)
    })
}
