import { NextResponse } from 'next/server'
import { verifyClockToken } from '@/lib/clock'
import type { ClockTokenPayload } from '@/lib/clock'
import { isTenantUuid } from '@/lib/tenant-ids'

export const runtime = 'edge'

const CLOCK_SECRET =
    process.env.CLOCK_SECRET ||
    process.env.NEXT_PUBLIC_CLOCK_SECRET ||
    'dev-secret'

const parseCookies = (header: string | null) => {
    if (!header) return new Map<string, string>()
    const map = new Map<string, string>()
    header
        .split(';')
        .map((p) => p.trim())
        .forEach((pair) => {
            if (!pair) return
            const idx = pair.indexOf('=')
            if (idx === -1) return
            const key = pair.slice(0, idx)
            const value = pair.slice(idx + 1)
            if (!key) return
            try {
                map.set(key, decodeURIComponent(value))
            } catch {
                map.set(key, value)
            }
        })
    return map
}

function getActorFromCookies(c: Headers): string | null {
    try {
        const cookie = c.get('cookie') || ''
        const map = Object.fromEntries(
            cookie
                .split(';')
                .map((p) => p.trim().split('=').map(decodeURIComponent))
                .filter((kv) => kv.length === 2)
        ) as Record<string, string>
        return (
            map['email'] ||
            map['name'] ||
            (map['pin'] ? `pin:${map['pin']}` : null) ||
            null
        )
    } catch {
        return null
    }
}

export async function POST(req: Request) {
    try {
        const body = (await req.json().catch(() => ({}))) as {
            token?: string
            action?: 'in' | 'out'
            deviceId?: string
        }
        if (!body || !body.token || !body.action) {
            return NextResponse.json(
                { ok: false, error: 'token and action required' },
                { status: 400 }
            )
        }
        const action = body.action === 'out' ? 'out' : 'in'
        let payload: ClockTokenPayload
        try {
            payload = await verifyClockToken(body.token, CLOCK_SECRET)
        } catch (err) {
            return NextResponse.json(
                {
                    ok: false,
                    error: (err as Error)?.message || 'Invalid token',
                },
                { status: 400 }
            )
        }
        const nowSeconds = Math.floor(Date.now() / 1000)
        if (payload.exp <= nowSeconds) {
            return NextResponse.json(
                { ok: false, error: 'Clock token expired. Refresh the kiosk.' },
                { status: 400 }
            )
        }
        const actor = getActorFromCookies(req.headers) || undefined
        const origin = new URL(req.url).origin
        const sanitizedDeviceId =
            typeof body.deviceId === 'string'
                ? body.deviceId.slice(0, 128)
                : undefined
        const cookieMap = parseCookies(req.headers.get('cookie'))
        const payloadTenant =
            payload.tenantId && !isTenantUuid(payload.tenantId)
                ? payload.tenantId.trim()
                : ''
        const cookieTenantSlug = (() => {
            const cookieSlug = cookieMap.get('tenantSlug')
            if (cookieSlug) return cookieSlug
            const legacy = cookieMap.get('tenantId')
            if (legacy && !isTenantUuid(legacy)) return legacy
            return ''
        })()
        const tenantId =
            payloadTenant ||
            (cookieTenantSlug && cookieTenantSlug.trim().length
                ? cookieTenantSlug.trim()
                : undefined)
        const accountEmail =
            (payload.accountEmail && payload.accountEmail.trim()) ||
            cookieMap.get('accountEmail') ||
            undefined
        if (!tenantId && !accountEmail) {
            return NextResponse.json(
                {
                    ok: false,
                    error: 'Tenant context missing. Sign in on this device before clocking in.',
                },
                { status: 400 }
            )
        }
        const res = await fetch(`${origin}/api/gas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'clockPunch',
                token: body.token,
                actionType: action,
                actor,
                deviceId: sanitizedDeviceId,
                tokenPayload: payload,
                userAgent: req.headers.get('user-agent') || undefined,
                receivedAt: Date.now(),
                tenantId,
                accountEmail,
            }),
            cache: 'no-store',
        })
        const raw = await res.text()
        try {
            const data = raw ? JSON.parse(raw) : null
            return NextResponse.json(data, {
                status: res.ok ? 200 : res.status,
            })
        } catch {
            return NextResponse.json(
                { ok: false, error: 'bad upstream', body: raw.slice(0, 200) },
                { status: 502 }
            )
        }
    } catch (e: any) {
        return NextResponse.json(
            { ok: false, error: e?.message || String(e) },
            { status: 500 }
        )
    }
}
