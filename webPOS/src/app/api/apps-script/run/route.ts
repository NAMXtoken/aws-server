import { NextResponse } from 'next/server'
import { runScript } from '@/lib/google/apps-script'

export const runtime = 'nodejs'

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}))
        const { functionName, parameters, scriptId, devMode } = body || {}
        if (!functionName)
            return NextResponse.json(
                { ok: false, error: 'functionName required' },
                { status: 400 }
            )
        const data = await runScript({
            functionName,
            parameters,
            scriptId,
            devMode,
        })
        return NextResponse.json({ ok: true, data })
    } catch (e: unknown) {
        const err = e as Error
        return NextResponse.json(
            { ok: false, error: err?.message || String(e) },
            { status: 500 }
        )
    }
}
