import { NextResponse } from 'next/server'
import { listProcesses } from '@/lib/google/apps-script'

export const runtime = 'nodejs'

export async function GET(req: Request) {
    try {
        const url = new URL(req.url)
        const scriptId = url.searchParams.get('scriptId') || undefined
        const functionName = url.searchParams.get('functionName') || undefined
        const statuses = url.searchParams.getAll('status')
        const types = url.searchParams.getAll('type')
        const pageSize = url.searchParams.get('pageSize')
            ? Number(url.searchParams.get('pageSize'))
            : undefined
        const pageToken = url.searchParams.get('pageToken') || undefined
        const startTime = url.searchParams.get('startTime') || undefined
        const endTime = url.searchParams.get('endTime') || undefined

        const data = await listProcesses({
            pageSize,
            pageToken,
            userProcessFilter: {
                scriptId,
                functionName,
                statuses: statuses.length ? statuses : undefined,
                types: types.length ? types : undefined,
                startTime,
                endTime,
            },
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
