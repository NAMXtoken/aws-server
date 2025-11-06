import { NextResponse } from 'next/server'
import { mintClockToken } from '@/lib/clock'
import { isTenantUuid } from '@/lib/tenant-ids'

export const runtime = 'edge'

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

export async function GET(req: Request) {
    try {
        const url = new URL(req.url)
        const kioskSession = url.searchParams.get('kiosk') || undefined
        const secret =
            process.env.CLOCK_SECRET ||
            process.env.NEXT_PUBLIC_CLOCK_SECRET ||
            'dev-secret'
        const ttlRaw = process.env.CLOCK_TOKEN_TTL
        const ttl = Number.isFinite(Number(ttlRaw)) ? Number(ttlRaw) : 30
        const cookies = parseCookies(req.headers.get('cookie'))
        const rawTenant =
            cookies.get('tenantSlug') || cookies.get('tenantId') || ''
        const tenantId =
            rawTenant && !isTenantUuid(rawTenant) ? rawTenant : undefined
        const accountEmail = cookies.get('accountEmail')
        const { token, iat, exp } = await mintClockToken(
            secret,
            kioskSession,
            ttl,
            {
                tenantId,
                accountEmail,
            }
        )
        return NextResponse.json({ ok: true, token, iat, exp }, { status: 200 })
    } catch (e: any) {
        return NextResponse.json(
            { ok: false, error: e?.message || String(e) },
            { status: 500 }
        )
    }
}
