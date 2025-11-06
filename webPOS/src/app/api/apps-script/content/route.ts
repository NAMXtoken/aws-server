import { NextResponse } from 'next/server'
import {
    AppsScriptFile,
    getProjectContent,
    updateProjectContent,
} from '@/lib/google/apps-script'

export const runtime = 'nodejs'

export async function GET(req: Request) {
    try {
        const url = new URL(req.url)
        const scriptId = url.searchParams.get('scriptId') || undefined
        const data = await getProjectContent({ scriptId })
        return NextResponse.json({ ok: true, data })
    } catch (e: unknown) {
        const err = e as Error
        return NextResponse.json(
            { ok: false, error: err?.message || String(e) },
            { status: 500 }
        )
    }
}

export async function PUT(req: Request) {
    try {
        const body = await req.json().catch(() => ({}))
        const { scriptId, files } =
            body || ({} as { scriptId?: string; files: AppsScriptFile[] })
        if (!files || !Array.isArray(files) || files.length === 0)
            return NextResponse.json(
                { ok: false, error: 'files[] required' },
                { status: 400 }
            )
        const data = await updateProjectContent({ scriptId, files })
        return NextResponse.json({ ok: true, data })
    } catch (e: unknown) {
        const err = e as Error
        return NextResponse.json(
            { ok: false, error: err?.message || String(e) },
            { status: 500 }
        )
    }
}
