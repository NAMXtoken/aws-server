'use client'

import type { TenantMetadata } from '@/types/tenant'

export type TenantDirectoryEntry = {
    tenantId: string
    accountEmail: string
    settingsSpreadsheetId: string
    menuSpreadsheetId: string | null
    driveFolderId: string | null
    metadata: TenantMetadata | null
    createdAt: number
    updatedAt: number
    label: string
    ownerUserId: string | null
}

type TenantDirectoryCache = {
    entries: TenantDirectoryEntry[]
    cachedAt: number
}

const DIRECTORY_CACHE_KEY = 'pos:tenant-directory:v1'
const CACHE_TTL_MS = 5 * 60_000

const isBrowser = () => typeof window !== 'undefined'

const slugifyEmail = (value: string | null | undefined): string | null => {
    if (!value) return null
    const trimmed = value.trim().toLowerCase()
    if (!trimmed) return null
    const slug = trimmed
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '')
    return slug.length ? slug : null
}

function parseTenantMetadata(raw: unknown): TenantMetadata | null {
    if (!raw) return null
    if (typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as TenantMetadata
    }
    if (typeof raw === 'string') {
        const trimmed = raw.trim()
        if (!trimmed) return null
        try {
            const parsed = JSON.parse(trimmed)
            return typeof parsed === 'object' && parsed !== null
                ? (parsed as TenantMetadata)
                : null
        } catch (error) {
            console.warn('Failed to parse tenant metadata', error)
            return null
        }
    }
    return null
}

function normalizeEntry(input: unknown): TenantDirectoryEntry | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null
    const raw = input as Record<string, unknown>
    const tenantId = String(raw.tenantId ?? '').trim()
    if (!tenantId) return null
    const accountEmail = String(raw.accountEmail ?? '').trim()
    const settingsSpreadsheetId = String(raw.settingsSpreadsheetId ?? '').trim()
    const menuSpreadsheetIdRaw = String(raw.menuSpreadsheetId ?? '').trim()
    const driveFolderIdRaw = String(raw.driveFolderId ?? '').trim()
    const metadataSource =
        raw.metadata ??
        (raw.metadataJson !== undefined ? raw.metadataJson : null)
    const metadata = parseTenantMetadata(metadataSource ?? null)
    const createdAt = Number(raw.createdAt ?? 0) || 0
    const updatedAt = Number(raw.updatedAt ?? 0) || 0
    let ownerUserId: string | null = null
    if (typeof raw.ownerUserId === 'string') {
        const trimmedOwner = raw.ownerUserId.trim()
        ownerUserId = trimmedOwner.length ? trimmedOwner : null
    }
    if (!ownerUserId) {
        const slug = slugifyEmail(accountEmail)
        ownerUserId = slug ? `user-${slug}` : null
    }

    let label = ''
    if (metadata && typeof metadata.storeName === 'string') {
        label = metadata.storeName.trim()
    }
    if (!label && accountEmail) {
        label = accountEmail
    }
    if (!label) {
        label = tenantId
    }

    return {
        tenantId,
        accountEmail,
        settingsSpreadsheetId,
        menuSpreadsheetId: menuSpreadsheetIdRaw || null,
        driveFolderId: driveFolderIdRaw || null,
        metadata: metadata ?? null,
        createdAt,
        updatedAt,
        label,
        ownerUserId,
    }
}

function readCache(): TenantDirectoryCache | null {
    if (!isBrowser()) return null
    try {
        const raw = window.localStorage.getItem(DIRECTORY_CACHE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as TenantDirectoryCache
        if (
            !parsed ||
            typeof parsed !== 'object' ||
            !Array.isArray(parsed.entries) ||
            typeof parsed.cachedAt !== 'number'
        ) {
            return null
        }
        return parsed
    } catch (error) {
        console.warn('Failed to read tenant directory cache', error)
        return null
    }
}

function writeCache(entries: TenantDirectoryEntry[]): void {
    if (!isBrowser()) return
    try {
        const payload: TenantDirectoryCache = {
            entries,
            cachedAt: Date.now(),
        }
        window.localStorage.setItem(
            DIRECTORY_CACHE_KEY,
            JSON.stringify(payload)
        )
    } catch (error) {
        console.warn('Failed to write tenant directory cache', error)
    }
}

export function clearTenantDirectoryCache(): void {
    if (!isBrowser()) return
    try {
        window.localStorage.removeItem(DIRECTORY_CACHE_KEY)
    } catch {
        /* ignore */
    }
}

function shouldUseCache(cache: TenantDirectoryCache | null): boolean {
    if (!cache) return false
    if (!Array.isArray(cache.entries) || cache.entries.length === 0)
        return false
    return Date.now() - cache.cachedAt < CACHE_TTL_MS
}

export async function getTenantDirectory(options?: {
    forceRefresh?: boolean
}): Promise<TenantDirectoryEntry[]> {
    const cache = readCache()
    if (!options?.forceRefresh && shouldUseCache(cache)) {
        return cache!.entries
    }

    const params = new URLSearchParams({ action: 'listTenants' })
    if (options?.forceRefresh) {
        params.set('fresh', '1')
    }

    const response = await fetch(`/api/gas?${params.toString()}`, {
        method: 'GET',
        cache: options?.forceRefresh ? 'no-store' : 'default',
    })
    if (!response.ok) {
        throw new Error(`Failed to load tenant directory (${response.status})`)
    }
    const payload: unknown = await response.json().catch(() => null)
    if (!payload || typeof payload !== 'object' || payload === null) {
        throw new Error('Tenant directory unavailable')
    }
    const payloadObject = payload as {
        ok?: boolean
        error?: unknown
        tenants?: unknown
    }
    if (payloadObject.ok === false) {
        throw new Error(
            payloadObject.error
                ? String(payloadObject.error)
                : 'Tenant directory unavailable'
        )
    }
    const rows: unknown[] = Array.isArray(payloadObject.tenants)
        ? (payloadObject.tenants as unknown[])
        : []
    const normalized = rows
        .map((row) => normalizeEntry(row))
        .filter((entry): entry is TenantDirectoryEntry => entry !== null)
        .sort((a, b) => a.label.localeCompare(b.label))

    writeCache(normalized)
    return normalized
}
