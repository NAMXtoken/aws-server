import { NextResponse } from 'next/server'
import {
    createDeployment,
    createVersion,
    deleteDeployment,
    listDeployments,
    updateDeployment,
} from '@/lib/google/apps-script'

export const runtime = 'nodejs'

export async function GET(req: Request) {
    try {
        const url = new URL(req.url)
        const scriptId = url.searchParams.get('scriptId') || undefined
        const data = await listDeployments({ scriptId })
        return NextResponse.json({ ok: true, data })
    } catch (e: unknown) {
        const err = e as Error
        return NextResponse.json(
            { ok: false, error: err?.message || String(e) },
            { status: 500 }
        )
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}))
        const { scriptId, description } = body || {}
        const version = await createVersion({
            scriptId,
            description: description || 'Automated version',
        })
        const versionNumber = (version as any)?.versionNumber as number
        if (!versionNumber) throw new Error('Failed to create version')
        const deployment = await createDeployment({
            scriptId,
            versionNumber,
            description: description || `v${versionNumber}`,
        })
        return NextResponse.json({ ok: true, data: { version, deployment } })
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
        const { scriptId, deploymentId, versionNumber, description } =
            body || {}
        if (!deploymentId || !versionNumber)
            return NextResponse.json(
                { ok: false, error: 'deploymentId and versionNumber required' },
                { status: 400 }
            )
        const data = await updateDeployment({
            scriptId,
            deploymentId,
            versionNumber,
            description,
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

export async function DELETE(req: Request) {
    try {
        const url = new URL(req.url)
        const scriptId = url.searchParams.get('scriptId') || undefined
        const deploymentId = url.searchParams.get('deploymentId')
        if (!deploymentId)
            return NextResponse.json(
                { ok: false, error: 'deploymentId required' },
                { status: 400 }
            )
        const data = await deleteDeployment({ scriptId, deploymentId })
        return NextResponse.json({ ok: true, data })
    } catch (e: unknown) {
        const err = e as Error
        return NextResponse.json(
            { ok: false, error: err?.message || String(e) },
            { status: 500 }
        )
    }
}
