import { NextResponse } from 'next/server'
import { getScriptApi } from '@/lib/google/apps-script'

export const runtime = 'nodejs'

export async function GET(req: Request) {
    try {
        const url = new URL(req.url)
        const scriptId = url.searchParams.get('scriptId') || undefined
        if (!scriptId)
            return NextResponse.json(
                { ok: false, error: 'scriptId required' },
                { status: 400 }
            )
        const api = getScriptApi()
        const data = await api.projects.get({ scriptId })
        return NextResponse.json({ ok: true, data: data.data })
    } catch (e: unknown) {
        const err = e as Error
        return NextResponse.json(
            { ok: false, error: err?.message || String(e) },
            { status: 500 }
        )
    }
}
