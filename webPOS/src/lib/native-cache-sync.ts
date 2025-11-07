'use client'

import type { Table } from 'dexie'
import type { PosDatabase } from './db'
import type { NativeCacheAPI, NativeCacheRecord, NativeCacheResponse } from './native-cache'
import { waitForNativeCache } from './native-cache'

type DexieChange = {
    type: number
    table: string
    key?: unknown
    obj?: Record<string, unknown>
    newObj?: Record<string, unknown>
    value?: Record<string, unknown>
    mods?: Record<string, unknown>
    oldObj?: Record<string, unknown>
}

const startedDbs = new WeakSet<PosDatabase>()

export async function startNativeCacheSync(db: PosDatabase) {
    if (startedDbs.has(db) || typeof window === 'undefined') {
        return
    }
    startedDbs.add(db)

    const nativeCache = await waitForNativeCache()
    if (!nativeCache) {
        return
    }

    try {
        if (!db.isOpen()) {
            await db.open()
        }
    } catch (error) {
        console.warn('[native-cache-sync] Failed to open Dexie', error)
        return
    }

    const tableMap = new Map<string, Table<any, any>>(
        db.tables.map((table) => [table.name, table])
    )
    if (!tableMap.size) {
        return
    }

    let applyingSnapshot = true
    try {
        await hydrateFromNative(nativeCache, tableMap)
    } finally {
        applyingSnapshot = false
    }

    const handleChanges = (changes: DexieChange[]) => {
        if (applyingSnapshot) {
            return
        }
        for (const change of changes) {
            const table = tableMap.get(change.table)
            if (!table) {
                continue
            }
            if (change.type === 3) {
                const key = resolvePrimaryKey(table, undefined, change.key)
                if (key) {
                    void nativeCache.remove(change.table, key).catch(() => {})
                }
                continue
            }
            const record =
                change.obj ??
                change.newObj ??
                change.value ??
                (change.mods
                    ? { ...(change.oldObj ?? {}), ...change.mods }
                    : undefined)
            if (!record) {
                continue
            }
            const key = resolvePrimaryKey(table, record, change.key)
            if (!key) {
                continue
            }
            void nativeCache
                .put(change.table, key, JSON.stringify(record ?? {}))
                .catch(() => {})
        }
    }

    ;(db.on as unknown as (event: string, handler: (changes: DexieChange[]) => void) => void)(
        'changes',
        handleChanges
    )
}

async function hydrateFromNative(
    nativeCache: NativeCacheAPI,
    tableMap: Map<string, Table<any, any>>
) {
    for (const [name, table] of tableMap) {
        const [nativeSnapshot, localRows] = await Promise.all([
            nativeCache
                .list(name)
                .catch<NativeCacheResponse>(() => ({ ok: false })),
            table
                .toArray()
                .catch(() => []) as Promise<Record<string, unknown>[]>,
        ])

        if (
            nativeSnapshot.ok &&
            Array.isArray(nativeSnapshot.records) &&
            nativeSnapshot.records.length
        ) {
            const parsedRows = nativeSnapshot.records
                .map((record: NativeCacheRecord) => safeParse(record.payload))
                .filter((row): row is Record<string, unknown> => row != null)
            await table.clear()
            if (parsedRows.length) {
                await table.bulkPut(parsedRows)
            }
            continue
        }

        if (!localRows.length) {
            continue
        }

        for (const row of localRows) {
            const key = resolvePrimaryKey(table, row)
            if (!key) {
                continue
            }
            await nativeCache.put(name, key, JSON.stringify(row ?? {}))
        }
    }
}

function resolvePrimaryKey(
    table: Table<any, any>,
    value?: Record<string, unknown>,
    explicitKey?: unknown
): string | null {
    if (explicitKey !== null && explicitKey !== undefined) {
        return String(explicitKey)
    }
    const keyPath: string | string[] | undefined =
        (table.schema as any)?.primKey?.keyPath ??
        (table.schema as any)?.primaryKey?.keyPath
    if (!keyPath) {
        return null
    }
    if (typeof keyPath === 'string') {
        const keyVal = value?.[keyPath]
        return keyVal === undefined || keyVal === null
            ? null
            : String(keyVal)
    }
    if (Array.isArray(keyPath)) {
        const parts = keyPath
            .map((segment) => value?.[segment])
            .filter((segment) => segment !== undefined && segment !== null)
        if (parts.length !== keyPath.length) {
            return null
        }
        return parts.map((part) => String(part)).join('::')
    }
    return null
}

function safeParse(payload: string | undefined): Record<string, unknown> | null {
    if (!payload) {
        return null
    }
    try {
        const parsed = JSON.parse(payload)
        return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
        return null
    }
}
