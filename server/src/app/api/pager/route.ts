import { NextResponse } from 'next/server'

import { acknowledgePager, postPager } from '../ws/route'

export const runtime = 'edge'

type PagerPayload = {
    tenantId?: string | null
    targetPin?: string | null
    targetRole?: string | null
    message?: string | null
    sender?: string | null
    origin?: string | null
}

function normalize(value: string | null | undefined) {
    const trimmed = (value ?? '').trim()
    return trimmed.length > 0 ? trimmed : null
}

export async function POST(request: Request) {
    try {
        const contentType = request.headers.get('content-type') || ''
        if (!contentType.includes('application/json')) {
            return NextResponse.json(
                { ok: false, error: 'Expected JSON payload' },
                { status: 415 }
            )
        }

        const body = (await request.json().catch(() => ({}))) as PagerPayload
        const tenantId = normalize(body.tenantId)
        const targetPin = normalize(body.targetPin)
        const targetRole = normalize(body.targetRole)
        const message = normalize(body.message)
        const sender = normalize(body.sender)
        const origin = normalize(body.origin)

        if (!tenantId) {
            return NextResponse.json(
                { ok: false, error: 'tenantId required' },
                { status: 400 }
            )
        }
        if (!targetPin && !targetRole) {
            return NextResponse.json(
                { ok: false, error: 'targetPin or targetRole required' },
                { status: 400 }
            )
        }
        if (!message) {
            return NextResponse.json(
                { ok: false, error: 'message required' },
                { status: 400 }
            )
        }

        const event = {
            id: crypto.randomUUID(),
            tenantId,
            targetPin: targetPin,
            targetRole: targetRole,
            message,
            createdAt: Date.now(),
            sender,
            origin,
        }

        postPager(event)

        return NextResponse.json({ ok: true, event })
    } catch (error) {
        return NextResponse.json(
            { ok: false, error: String((error as Error)?.message || error) },
            { status: 500 }
        )
    }
}

export async function PUT(request: Request) {
    try {
        const contentType = request.headers.get('content-type') || ''
        if (!contentType.includes('application/json')) {
            return NextResponse.json(
                { ok: false, error: 'Expected JSON payload' },
                { status: 415 }
            )
        }
        const body = (await request.json().catch(() => ({}))) as {
            id?: string
            tenantId?: string
            pin?: string
            role?: string
        }
        const id = normalize(body.id)
        if (!id) {
            return NextResponse.json(
                { ok: false, error: 'id required' },
                { status: 400 }
            )
        }
        const tenantId = normalize(body.tenantId) || ''
        acknowledgePager(id, {
            tenantId,
            pin: normalize(body.pin),
            role: normalize(body.role),
        })
        return NextResponse.json({ ok: true })
    } catch (error) {
        return NextResponse.json(
            { ok: false, error: String((error as Error)?.message || error) },
            { status: 500 }
        )
    }
}
