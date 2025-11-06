'use client'
import { useEffect, useRef } from 'react'

type Handlers = {
    onTickets?: () => void
    onShift?: () => void
    onInventory?: () => void
}

export function useRealtime(handlers: Handlers = {}) {
    const handlersRef = useRef(handlers)
    const esRef = useRef<EventSource | null>(null)
    const visTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        handlersRef.current = handlers
    }, [handlers])

    useEffect(() => {
        if (typeof window === 'undefined') return

        // Local tab fanout for immediate feedback only (no server SSE in local-first mode)
        const bc = new BroadcastChannel('pos')
        const onLocal = (ev: MessageEvent) => {
            const { type } = (ev?.data || {}) as { type?: string }
            if (type === 'tickets') handlersRef.current.onTickets?.()
            if (type === 'shift') handlersRef.current.onShift?.()
            if (type === 'inventory') handlersRef.current.onInventory?.()
        }
        bc.addEventListener('message', onLocal)

        return () => {
            try {
                bc.removeEventListener('message', onLocal)
                bc.close()
            } catch {}
            if (visTimerRef.current) clearTimeout(visTimerRef.current)
        }
    }, [])
}

// Helper to broadcast local UI actions instantly to other tabs
export function broadcastUpdate(type: 'tickets' | 'shift' | 'inventory') {
    if (typeof window === 'undefined') return
    try {
        const bc = new BroadcastChannel('pos')
        bc.postMessage({ type })
        bc.close()
    } catch {}
}
