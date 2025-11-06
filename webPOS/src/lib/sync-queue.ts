'use client'

// Lightweight IndexedDB queue for local-first sync on Vercel
// Store name: pos-sync / queue

type QueueItem = {
    id: string
    action: string
    payload: unknown
    ts: number
    retries: number
}

type FlushResult = {
    ok: boolean
    sent: number
    remaining: number
    error?: string
}

const DB_NAME = 'pos-sync'
const DB_VERSION = 1
const STORE = 'queue'

let dbPromise: Promise<IDBDatabase> | null = null
let flushing = false

function isBrowser() {
    return typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
}

function openDB(): Promise<IDBDatabase> {
    if (!isBrowser()) return Promise.reject(new Error('IndexedDB unavailable'))
    if (dbPromise) return dbPromise
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION)
        req.onupgradeneeded = () => {
            const db = req.result
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'id' })
            }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error || new Error('IDB open failed'))
    })
    return dbPromise
}

async function tx(storeMode: IDBTransactionMode) {
    const db = await openDB()
    return db.transaction(STORE, storeMode).objectStore(STORE)
}

function uuid(): string {
    try {
        return crypto.randomUUID()
    } catch {
        return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`
    }
}

export async function enqueue(input: {
    action: string
    payload: unknown
    ts?: number
}) {
    const item: QueueItem = {
        id: uuid(),
        action: input.action,
        payload: input.payload,
        ts: input.ts ?? Date.now(),
        retries: 0,
    }
    const store = await tx('readwrite')
    await new Promise<void>((resolve, reject) => {
        const req = store.add(item)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
    })
    return item.id
}

export async function count(): Promise<number> {
    const store = await tx('readonly')
    return await new Promise<number>((resolve, reject) => {
        const req = store.count()
        req.onsuccess = () => resolve(req.result || 0)
        req.onerror = () => reject(req.error)
    })
}

export async function list(limit = 500): Promise<QueueItem[]> {
    const store = await tx('readonly')
    return await new Promise<QueueItem[]>((resolve, reject) => {
        const items: QueueItem[] = []
        const cursorReq = store.openCursor()
        cursorReq.onsuccess = (event: Event) => {
            const cursorTarget =
                event.target as IDBRequest<IDBCursorWithValue | null> | null
            const cursor = cursorTarget?.result ?? null
            if (cursor && items.length < limit) {
                items.push(cursor.value as QueueItem)
                cursor.continue()
            } else {
                resolve(items)
            }
        }
        cursorReq.onerror = () => reject(cursorReq.error)
    })
}

async function removeMany(ids: string[]) {
    if (!ids.length) return
    const store = await tx('readwrite')
    await new Promise<void>((resolve, reject) => {
        let pending = ids.length
        ids.forEach((id) => {
            const req = store.delete(id)
            req.onsuccess = () => {
                pending -= 1
                if (pending === 0) resolve()
            }
            req.onerror = () => reject(req.error)
        })
    })
}

export async function exportCsv(): Promise<string> {
    const rows = await list(10_000)
    const header = ['id', 'action', 'ts', 'payload_json']
    const csvRows = [header.join(',')]
    for (const r of rows) {
        const payload = JSON.stringify(r.payload ?? {})
        const escapedPayload = '"' + payload.replace(/"/g, '""') + '"'
        csvRows.push([r.id, r.action, String(r.ts), escapedPayload].join(','))
    }
    return csvRows.join('\n')
}

export async function listQueued(limit = 1000): Promise<QueueItem[]> {
    return list(limit)
}

export async function flush(): Promise<FlushResult> {
    if (!isBrowser())
        return { ok: false, sent: 0, remaining: 0, error: 'not-in-browser' }
    if (flushing) return { ok: true, sent: 0, remaining: await count() }
    flushing = true
    try {
        const batch = await list(500)
        if (batch.length === 0) return { ok: true, sent: 0, remaining: 0 }

        const body = {
            action: 'bulkImport',
            items: batch.map(({ id, action, payload, ts }) => ({
                id,
                action,
                payload,
                ts,
            })),
        }

        const res = await fetch('/api/gas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })

        if (!res.ok) {
            const text = await res.text().catch(() => String(res.status))
            return { ok: false, sent: 0, remaining: await count(), error: text }
        }

        let data: unknown = null
        try {
            data = await res.json()
        } catch {
            data = null
        }
        const ack: string[] = Array.isArray(
            (data as { ackIds?: unknown })?.ackIds
        )
            ? ((data as { ackIds?: unknown })?.ackIds as unknown[]).map((s) =>
                  String(s)
              )
            : []
        if (ack.length > 0) {
            await removeMany(ack)
            const remaining = await count()
            return { ok: true, sent: ack.length, remaining }
        }

        // If bulk path didn't ack anything, fall back to per-item POSTs to avoid data loss.
        let sent = 0
        for (const it of batch) {
            try {
                const payloadBody =
                    typeof it.payload === 'object' &&
                    it.payload !== null &&
                    !Array.isArray(it.payload)
                        ? (it.payload as Record<string, unknown>)
                        : { payload: it.payload }
                const r = await fetch('/api/gas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: it.action,
                        ...payloadBody,
                    }),
                })
                const ok = r.ok
                if (ok) {
                    await removeMany([it.id])
                    sent += 1
                }
            } catch {
                // keep in queue
            }
        }
        const remaining = await count()
        return { ok: sent > 0, sent, remaining }
    } catch (err: unknown) {
        const message =
            err instanceof Error
                ? err.message
                : typeof err === 'string'
                  ? err
                  : 'unknown-error'
        return {
            ok: false,
            sent: 0,
            remaining: await count().catch(() => 0),
            error: message,
        }
    } finally {
        flushing = false
    }
}

export const SyncQueue = { enqueue, flush, exportCsv, count, listQueued }
