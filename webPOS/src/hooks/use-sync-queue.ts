'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { flush, count } from '@/lib/sync-queue'

export function useSyncQueue(intervalMs = 20_000) {
    const [pending, setPending] = useState<number>(0)
    const [lastResult, setLastResult] = useState<{
        ok: boolean
        ts: number
        error?: string
    } | null>(null)
    const timer = useRef<number | null>(null)

    const refreshCount = useCallback(async () => {
        try {
            setPending(await count())
        } catch {
            // ignore
        }
    }, [])

    const doFlush = useCallback(async () => {
        const res = await flush()
        setLastResult({ ok: res.ok, ts: Date.now(), error: res.error })
        await refreshCount()
    }, [refreshCount])

    useEffect(() => {
        let cancelled = false
        const schedule =
            typeof queueMicrotask === 'function'
                ? queueMicrotask
                : (cb: () => void) => Promise.resolve().then(cb)
        schedule(() => {
            if (!cancelled) void refreshCount()
        })
        const onOnline = () => doFlush()
        const onVisible = () => {
            if (document.visibilityState === 'visible') doFlush()
        }
        window.addEventListener('online', onOnline)
        document.addEventListener('visibilitychange', onVisible)
        timer.current = window.setInterval(
            doFlush,
            intervalMs
        ) as unknown as number
        return () => {
            window.removeEventListener('online', onOnline)
            document.removeEventListener('visibilitychange', onVisible)
            if (timer.current) window.clearInterval(timer.current)
            cancelled = true
        }
    }, [doFlush, intervalMs, refreshCount])

    return { pending, lastResult, flush: doFlush, refreshCount }
}
