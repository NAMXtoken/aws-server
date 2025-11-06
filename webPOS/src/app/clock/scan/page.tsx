'use client'
import Button from '@/components/ui/button/Button'
import { enqueue, flush } from '@/lib/sync-queue'
import { readCookie } from '@/lib/session'
import { useMemo, useState } from 'react'

export default function ClockScanPage() {
    const getInitialToken = () => {
        if (typeof window === 'undefined') return ''
        try {
            const url = new URL(window.location.href)
            return url.searchParams.get('token') ?? ''
        } catch {
            return ''
        }
    }
    const getInitialDeviceId = () => {
        if (typeof window === 'undefined') return ''
        try {
            let id = localStorage.getItem('deviceId')
            if (!id) {
                id = crypto.randomUUID()
                localStorage.setItem('deviceId', id)
            }
            return id
        } catch {
            return ''
        }
    }
    const getInitialActor = () => {
        if (typeof document === 'undefined') return ''
        try {
            const name = readCookie('name')
            const email = readCookie('email')
            const fallback = readCookie('pin')
            const resolved =
                (name && name.trim()) ||
                (email && email.trim()) ||
                (fallback ? fallback.trim() : '')
            return resolved || ''
        } catch {
            return ''
        }
    }

    const [token] = useState<string>(getInitialToken)
    const [status, setStatus] = useState<'idle' | 'posting' | 'done' | 'error'>(
        'idle'
    )
    const [message, setMessage] = useState<string>('')
    const [deviceId] = useState<string>(getInitialDeviceId)
    const [actor] = useState<string>(getInitialActor)
    const [lastPunch, setLastPunch] = useState<{
        action: 'clock.in' | 'clock.out'
        ts: string
        staffName: string
    } | null>(null)

    const disabled = useMemo(
        () => !token || status === 'posting',
        [token, status]
    )

    const submit = async (action: 'in' | 'out') => {
        if (!token) return
        setStatus('posting')
        setMessage('')
        try {
            const staffName = actor ? actor : 'Unknown staff'
            const staffPin = readCookie('pin') || undefined
            const queuedAt = Date.now()
            const payload = {
                token,
                actionType: action,
                deviceId,
                staffName,
                staffPin: staffPin || undefined,
                actor: staffName || undefined,
                userAgent:
                    typeof navigator !== 'undefined'
                        ? navigator.userAgent
                        : undefined,
                receivedAt: queuedAt,
                queuedAt,
                source: 'clock.scan',
            }
            await enqueue({ action: 'clockPunch', payload })
            setStatus('done')
            setLastPunch({
                action: action === 'out' ? 'clock.out' : 'clock.in',
                ts: new Date(queuedAt).toISOString(),
                staffName,
            })
            const formatted = new Date(queuedAt).toLocaleString()
            setMessage(
                action === 'in'
                    ? `Clocked in ${staffName} at ${formatted} (syncing…)`
                    : `Clocked out ${staffName} at ${formatted} (syncing…)`
            )
            void flush().catch(() => undefined)
        } catch (e: any) {
            setStatus('error')
            setMessage(e?.message || 'Failed to record')
        }
    }

    return (
        <div className="mx-auto max-w-md px-4 py-6 sm:px-6">
            <h1 className="text-xl font-semibold">Clock</h1>
            <p className="text-sm text-gray-500">Confirm your action below.</p>
            {actor && (
                <p className="mt-2 text-sm text-gray-500">
                    Signed in as{' '}
                    <span className="font-medium text-gray-700">{actor}</span>
                </p>
            )}
            {!token && (
                <p className="mt-4 text-sm text-red-600">
                    QR code missing or expired. Return to the kiosk to refresh.
                </p>
            )}
            {token && (
                <p className="mt-4 text-xs text-gray-400">
                    Token: <span className="break-all font-mono">{token}</span>
                </p>
            )}
            <div className="mt-6 grid gap-3">
                <Button
                    variant="primary"
                    disabled={disabled}
                    onClick={() => submit('in')}
                >
                    Clock In
                </Button>
                <Button
                    variant="outline"
                    disabled={disabled}
                    onClick={() => submit('out')}
                >
                    Clock Out
                </Button>
                {status !== 'idle' && (
                    <div
                        className={`text-sm ${
                            status === 'error'
                                ? 'text-red-600'
                                : 'text-green-600'
                        }`}
                    >
                        {message}
                    </div>
                )}
                {lastPunch && (
                    <div className="text-xs text-gray-500">
                        Last punch recorded:{' '}
                        {lastPunch.action === 'clock.in'
                            ? 'Clock In'
                            : 'Clock Out'}{' '}
                        for {lastPunch.staffName} ·{' '}
                        {new Date(lastPunch.ts).toLocaleString()}
                    </div>
                )}
            </div>
        </div>
    )
}
