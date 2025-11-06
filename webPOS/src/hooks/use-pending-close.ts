'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { listQueued } from '@/lib/sync-queue'

const STORAGE_KEY = 'pos:pendingCloseTicketIds'

function readSet(): Set<string> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return new Set()
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) return new Set(arr.map(String))
        return new Set()
    } catch {
        return new Set()
    }
}

function writeSet(ids: Set<string>) {
    try {
        const arr = Array.from(ids)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
        // broadcast to other tabs/hooks
        window.dispatchEvent(new CustomEvent('pendingClose:changed'))
    } catch {}
}

export function usePendingClose() {
    const [setState, setSetState] = useState<Set<string>>(() => readSet())

    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY) setSetState(readSet())
        }
        const onCustom = () => setSetState(readSet())
        window.addEventListener('storage', onStorage)
        window.addEventListener('pendingClose:changed', onCustom as any)
        // Periodically sync from queue content so callers don't need to wire writes
        const t = window.setInterval(async () => {
            try {
                const queued = await listQueued(500)
                const ids = new Set<string>()
                for (const q of queued) {
                    if (
                        q &&
                        q.action === 'closeTicket' &&
                        q.payload &&
                        (q.payload as any).ticketId
                    ) {
                        ids.add(String((q.payload as any).ticketId))
                    }
                }
                const merged = readSet()
                ids.forEach((id) => merged.add(id))
                writeSet(merged)
                setSetState(merged)
            } catch {}
        }, 1500)
        return () => {
            window.removeEventListener('storage', onStorage)
            window.removeEventListener('pendingClose:changed', onCustom as any)
            window.clearInterval(t)
        }
    }, [])

    const add = useCallback((id: string) => {
        const next = new Set(readSet())
        next.add(String(id))
        writeSet(next)
        setSetState(next)
    }, [])

    const remove = useCallback((id: string) => {
        const next = new Set(readSet())
        next.delete(String(id))
        writeSet(next)
        setSetState(next)
    }, [])

    const has = useCallback(
        (id: string) => setState.has(String(id)),
        [setState]
    )

    const values = useMemo(() => Array.from(setState), [setState])

    return { ids: values, has, add, remove }
}
