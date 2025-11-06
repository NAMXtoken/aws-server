'use client'

import { clearAllLocalData, db, uuid } from '@/lib/db'
import { SyncQueue } from '@/lib/sync-queue'
import {
    getTenantDirectory,
    type TenantDirectoryEntry,
} from '@/lib/tenant-directory'
import type { TenantConfigRow } from '@/types/db'
import type { TenantConfig, TenantConfigUpdate } from '@/types/tenant'

const TENANT_ACTION_GET = 'tenantConfig'
const TENANT_ACTION_SAVE = 'saveTenantConfig'
const ACTIVE_TENANT_KEY = 'pos.activeTenant'

const tenantBootstrapKey = (tenantId: string) =>
    `pos.tenant.${tenantId}.bootstrap`
const SETTINGS_PLACEHOLDER = 'SETTINGS_SPREADSHEET_ID'

const slugifyEmail = (value?: string | null): string | null => {
    if (!value) return null
    const trimmed = value.trim().toLowerCase()
    if (!trimmed) return null
    const slug = trimmed
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '')
    return slug.length ? slug : null
}

export const deriveTenantIdFromEmail = (
    email?: string | null
): string | null => {
    const slug = slugifyEmail(email)
    return slug ? `tenant-${slug}` : null
}

export const deriveUserIdFromEmail = (email?: string | null): string | null => {
    const slug = slugifyEmail(email)
    return slug ? `user-${slug}` : null
}

const normalizeEmail = (email: string | null | undefined): string => {
    if (!email) return ''
    return email.trim().toLowerCase()
}

function toPersistPayload(config: TenantConfig): TenantConfigUpdate {
    return {
        accountEmail: config.accountEmail,
        settingsSpreadsheetId: config.settingsSpreadsheetId,
        menuSpreadsheetId: config.menuSpreadsheetId ?? undefined,
        driveFolderId: config.driveFolderId ?? undefined,
        metadata: config.metadata ?? null,
        tenantId: '',
        createdAt: 0,
        updatedAt: 0,
    }
}

async function resolveDirectoryEntryForTenant(
    tenantId: string,
    email: string
): Promise<TenantDirectoryEntry | null> {
    const attempts = [false, true] as const
    const normalizedTenantId = tenantId.trim()
    const normalizedEmail = normalizeEmail(email)
    for (const forceRefresh of attempts) {
        try {
            const entries = await getTenantDirectory({ forceRefresh })
            if (normalizedTenantId.length > 0) {
                const byId = entries.find(
                    (entry) => entry.tenantId.trim() === normalizedTenantId
                )
                if (byId) return byId
            }
            if (normalizedEmail.length > 0) {
                const byEmail =
                    entries.find(
                        (entry) =>
                            normalizeEmail(entry.accountEmail) ===
                            normalizedEmail
                    ) ?? null
                if (byEmail) return byEmail
            }
        } catch (error) {
            console.warn('Failed to resolve tenant directory entry', error)
        }
    }
    return null
}

function mergeConfigWithDirectory(
    base: TenantConfig,
    entry: TenantDirectoryEntry | null,
    fallbackEmail: string | null
): { config: TenantConfig; changed: boolean } {
    let changed = false
    const next: TenantConfig = { ...base }

    const applyString = <K extends keyof TenantConfig>(
        key: K,
        value: string | null | undefined
    ) => {
        if (!value) return
        const trimmed = value.trim()
        if (!trimmed.length) return
        const current = typeof next[key] === 'string' ? String(next[key]) : ''
        if (current.trim() !== trimmed) {
            next[key] = trimmed as TenantConfig[K]
            changed = true
        }
    }

    if (entry) {
        applyString('accountEmail', entry.accountEmail)
        applyString('settingsSpreadsheetId', entry.settingsSpreadsheetId)
        if (entry.menuSpreadsheetId) {
            applyString('menuSpreadsheetId', entry.menuSpreadsheetId)
        }
        if (entry.driveFolderId) {
            applyString('driveFolderId', entry.driveFolderId)
        }
        if (entry.metadata) {
            const existing = next.metadata ?? null
            if (JSON.stringify(existing) !== JSON.stringify(entry.metadata)) {
                next.metadata = entry.metadata
                changed = true
            }
        }
    }

    if (
        (!next.accountEmail || !next.accountEmail.trim().length) &&
        fallbackEmail &&
        fallbackEmail.trim().length
    ) {
        next.accountEmail = fallbackEmail.trim()
        changed = true
    }

    if (
        next.settingsSpreadsheetId &&
        next.settingsSpreadsheetId.trim() === SETTINGS_PLACEHOLDER &&
        entry?.settingsSpreadsheetId?.trim()
    ) {
        next.settingsSpreadsheetId = entry.settingsSpreadsheetId.trim()
        changed = true
    }

    if (changed) {
        next.updatedAt = Date.now()
        return { config: next, changed }
    }

    return { config: base, changed }
}

const parseMetadata = (value: unknown): Record<string, unknown> | null => {
    if (!value) return null
    if (typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>
    }
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value)
            return typeof parsed === 'object' && parsed !== null ? parsed : null
        } catch {
            return null
        }
    }
    return null
}

const toRow = (config: TenantConfig): TenantConfigRow => ({
    tenantId: config.tenantId,
    accountEmail: config.accountEmail,
    settingsSpreadsheetId: config.settingsSpreadsheetId,
    menuSpreadsheetId: config.menuSpreadsheetId ?? null,
    driveFolderId: config.driveFolderId ?? null,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
    metadataJson: config.metadata ? JSON.stringify(config.metadata) : null,
})

const fromRow = (row: TenantConfigRow | undefined): TenantConfig | null => {
    if (!row) return null
    return {
        tenantId: row.tenantId,
        accountEmail: row.accountEmail,
        settingsSpreadsheetId: row.settingsSpreadsheetId,
        menuSpreadsheetId: row.menuSpreadsheetId ?? null,
        driveFolderId: row.driveFolderId ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        metadata: parseMetadata(row.metadataJson),
    }
}

const normalizeTenantPayload = (
    input: unknown,
    fallbackTenantId?: string
): TenantConfig | null => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return null
    }
    const raw = input as Record<string, unknown>
    const tenantId = String(
        raw.tenantId ?? raw.id ?? fallbackTenantId ?? ''
    ).trim()
    if (!tenantId) return null
    const createdAtRaw = Number(raw.createdAt ?? Date.now())
    const updatedAtRaw = Number(raw.updatedAt ?? createdAtRaw)
    return {
        tenantId,
        accountEmail: String(raw.accountEmail ?? ''),
        settingsSpreadsheetId: String(
            raw.settingsSpreadsheetId ?? raw.settingsId ?? ''
        ).trim(),
        menuSpreadsheetId: raw.menuSpreadsheetId
            ? String(raw.menuSpreadsheetId)
            : null,
        driveFolderId: raw.driveFolderId ? String(raw.driveFolderId) : null,
        createdAt: Number.isFinite(createdAtRaw) ? createdAtRaw : Date.now(),
        updatedAt: Number.isFinite(updatedAtRaw) ? updatedAtRaw : Date.now(),
        metadata: parseMetadata(raw.metadataJson ?? raw.metadata),
    }
}

const setActiveTenantStorage = (tenantId: string, bootstrap: boolean) => {
    if (typeof window === 'undefined') return
    try {
        localStorage.setItem(ACTIVE_TENANT_KEY, tenantId)
        localStorage.setItem(
            tenantBootstrapKey(tenantId),
            bootstrap ? 'true' : 'false'
        )
    } catch {
        /* ignore storage errors */
    }
}

export const getActiveTenantId = (): string | null => {
    if (typeof window === 'undefined') return null
    try {
        const value = localStorage.getItem(ACTIVE_TENANT_KEY)
        return value && value.length ? value : null
    } catch {
        return null
    }
}

export const isActiveTenantBootstrapped = (): boolean => {
    if (typeof window === 'undefined') return true
    try {
        const tenantId = getActiveTenantId()
        if (!tenantId) return true
        const flag = localStorage.getItem(tenantBootstrapKey(tenantId))
        if (flag === 'false') return false
        return true
    } catch {
        return true
    }
}

export const setTenantBootstrapFlag = (
    tenantId: string,
    value: boolean
): void => {
    setActiveTenantStorage(tenantId, value)
}

const hasExistingLocalData = async (): Promise<boolean> => {
    const [menuCount, categoryCount, ticketCount] = await Promise.all([
        db.menu_items.count(),
        db.categories.count(),
        db.tickets.count(),
    ])
    return menuCount > 0 || categoryCount > 0 || ticketCount > 0
}

const createTenantConfig = (
    tenantId: string,
    accountEmail: string,
    bootstrap: boolean
): TenantConfig => {
    const now = Date.now()
    return {
        tenantId,
        accountEmail: '',
        settingsSpreadsheetId: '',
        menuSpreadsheetId: null,
        driveFolderId: null,
        metadata: { bootstrapComplete: bootstrap },
        createdAt: now,
        updatedAt: now,
    }
}

export async function getTenantConfigLocal(
    tenantId: string
): Promise<TenantConfig | null> {
    const row = await db.tenant_config.get(tenantId)
    return fromRow(row)
}

export async function saveTenantConfigLocal(
    config: TenantConfig
): Promise<void> {
    const row = toRow(config)
    await db.tenant_config.put(row)
}

export async function syncTenantConfigFromRemote(
    payload: unknown,
    fallbackTenantId?: string
): Promise<TenantConfig | null> {
    const normalized = normalizeTenantPayload(payload, fallbackTenantId)
    if (!normalized) return null
    await saveTenantConfigLocal(normalized)
    return normalized
}

export async function fetchTenantConfigRemote(
    tenantId?: string,
    accountEmail?: string
): Promise<TenantConfig | null> {
    if (typeof fetch === 'undefined') return null
    const params = new URLSearchParams({ action: TENANT_ACTION_GET })
    if (tenantId) params.set('tenantId', tenantId)
    if (!tenantId && accountEmail) params.set('accountEmail', accountEmail)
    const res = await fetch(`/api/gas?${params.toString()}`)
    if (!res.ok) return null
    const data: unknown = await res.json().catch(() => null)
    if (!data || typeof data !== 'object') return null
    if ((data as { ok?: boolean }).ok === false) return null
    return await syncTenantConfigFromRemote(
        data,
        tenantId && tenantId.length ? tenantId : undefined
    )
}

export async function persistTenantConfigRemote(
    tenantId: string,
    update: TenantConfigUpdate
): Promise<boolean> {
    if (!tenantId) return false
    const payload = {
        action: TENANT_ACTION_SAVE,
        ...update,
        metadataJson: update.metadata ? JSON.stringify(update.metadata) : null,
    }
    if (typeof fetch === 'undefined') {
        await SyncQueue.enqueue({
            action: TENANT_ACTION_SAVE,
            payload,
            ts: Date.now(),
        })
        return false
    }
    try {
        const res = await fetch('/api/gas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error(`tenant save failed: ${res.status}`)
        return true
    } catch {
        await SyncQueue.enqueue({
            action: TENANT_ACTION_SAVE,
            payload,
            ts: Date.now(),
        })
        return false
    }
}

const ensureBootstrapMetadata = async (
    config: TenantConfig
): Promise<TenantConfig> => {
    const hasBootstrap = config.metadata?.bootstrapComplete
    if (typeof hasBootstrap === 'boolean') return config
    const fallback = await hasExistingLocalData()
    const metadata = {
        ...(config.metadata ?? {}),
        bootstrapComplete: fallback,
    }
    const next: TenantConfig = {
        ...config,
        metadata,
        updatedAt: Date.now(),
    }
    await saveTenantConfigLocal(next)
    return next
}

export async function selectTenantForEmail(
    email: string
): Promise<{ config: TenantConfig; changed: boolean }> {
    const trimmedEmail = email.trim()
    const normalizedEmail = normalizeEmail(trimmedEmail)
    const tenantId = deriveTenantIdFromEmail(trimmedEmail)
    if (!tenantId) throw new Error('Unable to derive tenant from email')
    const existingRow = await db.tenant_config.toCollection().first()
    const existingConfig = fromRow(existingRow)
    const remoteConfig = await fetchTenantConfigRemote(tenantId, trimmedEmail)

    let directoryEntryPromise: Promise<TenantDirectoryEntry | null> | null =
        null

    const loadDirectoryEntry = async () => {
        if (!directoryEntryPromise) {
            directoryEntryPromise = resolveDirectoryEntryForTenant(
                tenantId,
                trimmedEmail
            )
        }
        return directoryEntryPromise
    }

    const configNeedsDirectory = (config: TenantConfig): boolean => {
        const settings = config.settingsSpreadsheetId?.trim() ?? ''
        const account = normalizeEmail(config.accountEmail)
        if (!settings || settings === SETTINGS_PLACEHOLDER) return true
        if (normalizedEmail && account !== normalizedEmail) return true
        if (!account && normalizedEmail) return true
        return false
    }

    const applyDirectoryOverlay = async (
        base: TenantConfig
    ): Promise<{ config: TenantConfig; changed: boolean }> => {
        if (!configNeedsDirectory(base)) {
            if (
                normalizedEmail &&
                (!base.accountEmail || !base.accountEmail.trim().length)
            ) {
                const next: TenantConfig = {
                    ...base,
                    accountEmail: trimmedEmail,
                    updatedAt: Date.now(),
                }
                return { config: next, changed: true }
            }
            return { config: base, changed: false }
        }
        const entry = await loadDirectoryEntry()
        return mergeConfigWithDirectory(base, entry, trimmedEmail || null)
    }

    const applyBootstrapFlag = async (
        config: TenantConfig
    ): Promise<TenantConfig> => {
        const ensured =
            config.metadata && config.metadata.bootstrapComplete !== undefined
                ? config
                : await ensureBootstrapMetadata(config)
        const bootstrapComplete = ensured.metadata?.bootstrapComplete !== false
        setActiveTenantStorage(tenantId, bootstrapComplete)
        return ensured
    }

    if (!existingConfig) {
        let config =
            remoteConfig ??
            createTenantConfig(
                tenantId,
                trimmedEmail,
                await hasExistingLocalData()
            )
        const { config: hydrated, changed: directoryChanged } =
            await applyDirectoryOverlay(config)
        config = hydrated
        await saveTenantConfigLocal(config)
        const ensured = await applyBootstrapFlag(config)
        if (!remoteConfig || directoryChanged) {
            await persistTenantConfigRemote(tenantId, toPersistPayload(ensured))
        }
        return { config: ensured, changed: false }
    }

    if (existingConfig.tenantId === tenantId) {
        let config = remoteConfig ?? existingConfig
        const { config: hydrated, changed: directoryChanged } =
            await applyDirectoryOverlay(config)
        config = hydrated
        await saveTenantConfigLocal(config)
        const ensured = await applyBootstrapFlag(config)
        if (!remoteConfig || directoryChanged) {
            await persistTenantConfigRemote(tenantId, toPersistPayload(ensured))
        }
        return { config: ensured, changed: false }
    }

    await clearAllLocalData()
    let config =
        remoteConfig ?? createTenantConfig(tenantId, trimmedEmail, false)
    if (!remoteConfig) {
        config = { ...config, updatedAt: Date.now() }
    }
    const { config: hydrated, changed: directoryChanged } =
        await applyDirectoryOverlay(config)
    config = hydrated
    await saveTenantConfigLocal(config)
    const ensured = await applyBootstrapFlag(config)
    if (!remoteConfig || directoryChanged) {
        await persistTenantConfigRemote(tenantId, toPersistPayload(ensured))
    }
    return { config: ensured, changed: true }
}

export async function ensureTenantConfig(
    defaults?: Partial<TenantConfig>
): Promise<TenantConfig> {
    let existing: TenantConfigRow | undefined
    try {
        existing = await db.tenant_config.toCollection().first()
    } catch (error) {
        console.warn(
            'tenant_config store missing, recreating with schema bump',
            error
        )
        await db.close()
        await db.delete()
        await db.open()
        existing = undefined
    }
    if (existing) {
        const normalized = fromRow(existing)
        if (normalized) return normalized
    }
    const tenantId = defaults?.tenantId || uuid()
    const accountEmail = defaults?.accountEmail || String()
    const base: TenantConfig = {
        tenantId,
        accountEmail,
        settingsSpreadsheetId:
            defaults?.settingsSpreadsheetId ?? 'SETTINGS_SPREADSHEET_ID',
        menuSpreadsheetId: defaults?.menuSpreadsheetId ?? null,
        driveFolderId: defaults?.driveFolderId ?? null,
        metadata: defaults?.metadata ?? null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    }
    await saveTenantConfigLocal(base)
    return base
}
