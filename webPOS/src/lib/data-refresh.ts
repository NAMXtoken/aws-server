'use client'

import { syncMenuFromRemote } from '@/lib/local-catalog'
import {
    refreshRestockRecordsFromRemote,
    refreshUnitsFromRemote,
} from '@/lib/local-inventory'
import { refreshIngredientsFromRemote } from '@/lib/local-ingredients'
import {
    syncCurrentShiftFromRemote,
    syncOpenTicketsFromRemote,
} from '@/lib/local-pos'
import { syncAllUsersFromRemote } from '@/lib/local-users'
import { db } from '@/lib/db'
import {
    DEFAULT_GENERAL_SETTINGS,
    loadGeneralSettings,
    saveGeneralSettings,
    type GeneralSettings,
} from '@/lib/settings'
import {
    fetchDailySalesSummary,
    fetchInventorySnapshotClient,
} from '@/lib/reports-client'
import {
    makeDailyReportKey,
    saveDailyReportCache,
} from '@/lib/daily-report-cache'

export type RefreshSummary = {
    menuItems: number
    categories: number
    units: number
    restocks: number
    ingredients: number
    users: number
    settingsUpdated: boolean
    errors: string[]
}

const DEFAULT_SUMMARY: RefreshSummary = {
    menuItems: 0,
    categories: 0,
    units: 0,
    restocks: 0,
    ingredients: 0,
    users: 0,
    settingsUpdated: false,
    errors: [],
}

async function refreshSettingsFromRemote(): Promise<{
    updated: boolean
    settings: GeneralSettings
}> {
    if (typeof fetch === 'undefined') {
        return { updated: false, settings: loadGeneralSettings() }
    }
    try {
        const res = await fetch('/api/gas?action=getPosSettings')
        if (!res.ok) {
            return {
                updated: false,
                settings: loadGeneralSettings(),
            }
        }
        const payload = await res.json().catch(() => ({}))
        const remote =
            (payload?.settings as Partial<GeneralSettings>) ??
            (payload?.data as Partial<GeneralSettings>) ??
            {}
        if (Object.keys(remote).length === 0) {
            return {
                updated: false,
                settings: loadGeneralSettings(),
            }
        }
        const merged: GeneralSettings = {
            ...DEFAULT_GENERAL_SETTINGS,
            ...loadGeneralSettings(),
            ...remote,
        }
        saveGeneralSettings(merged)
        return { updated: true, settings: merged }
    } catch (error) {
        console.warn('Failed to refresh settings from remote', error)
        return {
            updated: false,
            settings: loadGeneralSettings(),
        }
    }
}

export async function refreshAllData(options?: {
    freshMenu?: boolean
}): Promise<RefreshSummary> {
    const summary: RefreshSummary = { ...DEFAULT_SUMMARY, errors: [] }
    const errors: string[] = []

    try {
        const shouldForceFresh = options?.freshMenu === true
        const { menu, categories } = await syncMenuFromRemote({
            ...(shouldForceFresh ? { fresh: true, allowEmpty: true } : {}),
            ignoreBootstrap: true,
        })
        summary.menuItems = menu
        summary.categories = categories
    } catch (error) {
        errors.push('menu')
        console.warn('Failed to refresh menu from remote', error)
    }

    try {
        summary.units = await refreshUnitsFromRemote()
    } catch (error) {
        errors.push('units')
        console.warn('Failed to refresh units from remote', error)
    }

    try {
        summary.restocks = await refreshRestockRecordsFromRemote()
    } catch (error) {
        errors.push('restocks')
        console.warn('Failed to refresh restock records from remote', error)
    }

    try {
        const ingredients = await refreshIngredientsFromRemote()
        if (Array.isArray(ingredients)) {
            summary.ingredients = ingredients.length
        }
    } catch (error) {
        errors.push('ingredients')
        console.warn('Failed to refresh ingredients from remote', error)
    }

    try {
        summary.users = (await syncAllUsersFromRemote()).length
    } catch (error) {
        errors.push('users')
        console.warn('Failed to refresh users from remote', error)
    }

    try {
        const result = await refreshSettingsFromRemote()
        summary.settingsUpdated = result.updated
    } catch (error) {
        errors.push('settings')
        console.warn('Failed to refresh settings from remote', error)
    }

    summary.errors = errors
    return summary
}

const HYDRATION_KEY_PREFIX = 'pos.cache.lastHydrated'
const HYDRATION_TTL_MS = 1000 * 60 * 60 * 24 * 3 // 3 days
const INVENTORY_SNAPSHOT_CACHE_PREFIX = 'pos.cache.inventorySnapshot'

const hydrationKeyForTenant = (tenantId?: string | null) => {
    const normalized =
        tenantId && tenantId.trim().length > 0 ? tenantId.trim() : 'default'
    return `${HYDRATION_KEY_PREFIX}:${normalized}`
}

function markHydratedTimestamp(
    tenantId: string | null | undefined,
    timestamp: number
) {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(
            hydrationKeyForTenant(tenantId),
            String(timestamp)
        )
    } catch {
        /* ignore storage errors */
    }
}

async function getLocalCacheCounts(): Promise<{
    menu: number
    categories: number
    users: number
}> {
    try {
        const [menu, categories, users] = await Promise.all([
            db.menu_items.count(),
            db.categories.count(),
            db.users.count(),
        ])
        return { menu, categories, users }
    } catch (error) {
        console.warn('Failed to inspect local cache counts', error)
        return { menu: 0, categories: 0, users: 0 }
    }
}

async function primeDailySalesCache(): Promise<void> {
    try {
        const now = new Date()
        const year = now.getFullYear()
        const month = now.getMonth() + 1
        const result = await fetchDailySalesSummary(year, month)
        if (!result?.ok) return
        const fallbackLabel = new Date(year, month - 1, 1).toLocaleString(
            undefined,
            { month: 'long' }
        )
        await saveDailyReportCache({
            key: makeDailyReportKey(result.year, result.month),
            year: result.year,
            month: result.month,
            monthName: result.monthName || fallbackLabel,
            days: result.days || [],
            fetchedAt: Date.now(),
        })
    } catch (error) {
        console.warn('Failed to prefetch daily sales summary', error)
    }
}

const inventorySnapshotKeyForTenant = (tenantId?: string | null) => {
    const normalized =
        tenantId && tenantId.trim().length > 0 ? tenantId.trim() : 'default'
    return `${INVENTORY_SNAPSHOT_CACHE_PREFIX}:${normalized}`
}

async function primeInventorySnapshotCache(
    tenantId?: string | null
): Promise<void> {
    if (typeof window === 'undefined') return
    try {
        const snapshot = await fetchInventorySnapshotClient({ fresh: true })
        if (!snapshot?.ok) return
        window.localStorage.setItem(
            inventorySnapshotKeyForTenant(tenantId),
            JSON.stringify({
                fetchedAt: Date.now(),
                snapshot,
            })
        )
    } catch (error) {
        console.warn('Failed to prefetch inventory snapshot', error)
    }
}

export async function shouldHydrateTenant(
    tenantId?: string | null
): Promise<boolean> {
    if (typeof window === 'undefined') return false
    const key = hydrationKeyForTenant(tenantId)
    const now = Date.now()
    let lastHydrated = 0
    try {
        const raw = window.localStorage.getItem(key)
        if (raw) {
            const parsed = Number(raw)
            if (Number.isFinite(parsed)) lastHydrated = parsed
        }
    } catch {
        lastHydrated = 0
    }
    if (!lastHydrated || now - lastHydrated > HYDRATION_TTL_MS) {
        return true
    }
    const counts = await getLocalCacheCounts()
    if (counts.menu === 0 || counts.categories === 0 || counts.users === 0) {
        return true
    }
    return false
}

export async function hydrateTenantCaches(
    tenantId?: string | null,
    options?: { force?: boolean }
): Promise<void> {
    try {
        await refreshAllData({ freshMenu: options?.force })
    } catch (error) {
        console.warn('refreshAllData failed during hydration', error)
    }

    await Promise.allSettled([
        syncOpenTicketsFromRemote(),
        syncCurrentShiftFromRemote(),
        primeDailySalesCache(),
        primeInventorySnapshotCache(tenantId),
    ])

    markHydratedTimestamp(tenantId ?? null, Date.now())
}

export function getInventorySnapshotCacheKey(tenantId?: string | null): string {
    return inventorySnapshotKeyForTenant(tenantId)
}
