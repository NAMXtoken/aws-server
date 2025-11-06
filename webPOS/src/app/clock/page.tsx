'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import Button from '@/components/ui/button/Button'

const CLOCK_BASE_URL = (process.env.NEXT_PUBLIC_CLOCK_BASE_URL || '').replace(
    /\/+$/,
    ''
)

export default function ClockKioskPage() {
    const [token, setToken] = useState<string>('')
    const [exp, setExp] = useState<number>(0)
    const [qrDataUrl, setQrDataUrl] = useState<string>('')
    const [now, setNow] = useState<number>(Date.now())
    const refreshTimerRef = useRef<number | null>(null)
    const heartbeatRef = useRef<number | null>(null)

    const link = useMemo(() => {
        if (!token) return ''
        try {
            const origin =
                CLOCK_BASE_URL && CLOCK_BASE_URL.length > 0
                    ? CLOCK_BASE_URL
                    : window.location.origin
            return `${origin}/clock/scan?token=${encodeURIComponent(token)}`
        } catch {
            return ''
        }
    }, [token])

    useEffect(() => {
        let mounted = true
        const scheduleRefresh = (delayMs: number) => {
            if (!mounted) return
            if (refreshTimerRef.current) {
                window.clearTimeout(refreshTimerRef.current)
            }
            refreshTimerRef.current = window.setTimeout(fetchToken, delayMs)
        }
        const fetchToken = async () => {
            try {
                const res = await fetch(`/api/clock/token`, {
                    cache: 'no-store',
                })
                const data = await res.json()
                if (!res.ok || !data?.ok)
                    throw new Error(data?.error || 'Failed to get token')
                if (!mounted) return
                setToken(data.token)
                const expiresAtMs = Number(data.exp || 0) * 1000
                setExp(expiresAtMs)
                const nowMs = Date.now()
                const refreshIn = Math.max(
                    1000,
                    expiresAtMs > nowMs ? expiresAtMs - nowMs - 1000 : 2000
                )
                scheduleRefresh(refreshIn)
            } catch {
                if (mounted) scheduleRefresh(5000)
            }
        }
        fetchToken()
        heartbeatRef.current = window.setInterval(() => setNow(Date.now()), 500)
        return () => {
            mounted = false
            if (refreshTimerRef.current)
                window.clearTimeout(refreshTimerRef.current)
            if (heartbeatRef.current) window.clearInterval(heartbeatRef.current)
        }
    }, [])

    useEffect(() => {
        if (!link) return
        QRCode.toDataURL(link, { width: 256, margin: 1 })
            .then(setQrDataUrl)
            .catch(() => setQrDataUrl(''))
    }, [link])

    const secondsLeft = useMemo(
        () => Math.max(0, Math.ceil((exp - now) / 1000)),
        [exp, now]
    )

    return (
        <div className="mx-auto max-w-xl px-4 py-6 sm:px-6">
            <h1 className="text-2xl font-semibold">Clock Kiosk</h1>
            <p className="text-sm text-gray-500">
                Scan with your phone (logged in) to clock in or out. Code
                refreshes every 5s.
            </p>
            <div className="mt-6 flex flex-col items-center gap-4 rounded-lg border p-6">
                {qrDataUrl ? (
                    <img
                        src={qrDataUrl}
                        alt="Clock-in QR"
                        className="h-64 w-64"
                    />
                ) : (
                    <div className="h-64 w-64 animate-pulse rounded bg-gray-200" />
                )}
                <div className="text-sm text-gray-600">
                    Expires in {secondsLeft}s
                </div>
                <Button
                    variant="outline"
                    onClick={() => {
                        try {
                            navigator.clipboard.writeText(link)
                        } catch {}
                    }}
                >
                    Copy link
                </Button>
            </div>
        </div>
    )
}
