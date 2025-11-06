import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

import { getSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { SUPABASE_SERVICE_AVAILABLE } from '@/lib/supabase/env'
import type { Database } from '@/lib/supabase/types'
import {
    formatTenantDisplayName,
    isTenantUuid,
    tenantSlugToSupabaseId,
} from '@/lib/tenant-ids'

export const runtime = 'nodejs'

type PagerEventRow = Database['public']['Tables']['pager_events']['Row']

type PagerInsertPayload = {
    tenantId: string
    targetPin?: string | null
    targetRole?: string | null
    message: string
    origin?: string | null
    sender?: {
        memberId?: string | null
        displayName?: string | null
        pin?: string | null
    } | null
}

type PagerAckPayload = {
    id: string
    tenantId: string
    acknowledgedByMemberId?: string | null
    acknowledgedByDisplayName?: string | null
}

type PublicClient = SupabaseClient<Database, 'public', 'public'>

const BAD_REQUEST = NextResponse.json(
    { error: 'invalid-request' },
    { status: 400 }
)

const NO_MATCH = NextResponse.json({ ok: true }, { status: 200 })

async function resolveTenantId(
    rawTenantId: string,
    supabase: PublicClient
): Promise<string | null> {
    const trimmed = rawTenantId?.trim()
    if (!trimmed) return null

    if (isTenantUuid(trimmed)) {
        return trimmed
    }

    const slug = trimmed
    const { data: existing, error: existingError } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()

    if (existingError) {
        console.error('Supabase tenant lookup failed', existingError)
        return null
    }

    if (existing?.id && isTenantUuid(existing.id)) {
        return existing.id
    }

    const derivedId = await tenantSlugToSupabaseId(slug)
    const displayName = formatTenantDisplayName(slug)
    const { error: insertError } = await supabase.from('tenants').insert({
        id: derivedId,
        slug,
        display_name: displayName,
        metadata: {
            source: 'slug-bridge',
            slug,
        },
    })

    if (insertError) {
        if (insertError.code === '23505') {
            const { data: retry, error: retryError } = await supabase
                .from('tenants')
                .select('id')
                .eq('slug', slug)
                .maybeSingle()
            if (!retryError && retry?.id && isTenantUuid(retry.id)) {
                return retry.id
            }
        }
        console.error('Supabase tenant insert failed', insertError)
        return null
    }

    return derivedId
}

function isEventRelevant(
    row: PagerEventRow,
    pin?: string | null,
    role?: string | null
) {
    if (!row) return false
    if (row.target_pin) {
        if (!pin) return false
        return row.target_pin.replace(/\s+/g, '') === pin.replace(/\s+/g, '')
    }
    if (row.target_role) {
        if (!role) return false
        return row.target_role === role
    }
    return true
}

export async function GET(request: Request) {
    const url = new URL(request.url)
    const tenantIdParam = url.searchParams.get('tenantId')
    const pin = url.searchParams.get('pin')
    const role = url.searchParams.get('role')

    if (!tenantIdParam) {
        return BAD_REQUEST
    }

    if (!SUPABASE_SERVICE_AVAILABLE) {
        return NextResponse.json(
            { error: 'supabase-disabled' },
            { status: 503 }
        )
    }

    const supabase = getSupabaseServiceRoleClient()
    const tenantId = await resolveTenantId(tenantIdParam, supabase)

    if (!tenantId) {
        return NextResponse.json(
            { error: 'supabase-disabled' },
            { status: 503 }
        )
    }

    const { data, error } = await supabase
        .from('pager_events')
        .select('*')
        .eq('tenant_id', tenantId)
        .is('acknowledged_at', null)
        .order('created_at', { ascending: false })
        .limit(10)

    if (error) {
        console.error('Supabase pager GET error', error)
        return NextResponse.json(
            { error: 'supabase-error', details: error.message },
            { status: 500 }
        )
    }

    const rows = (data ?? []) as PagerEventRow[]

    if (!rows.length) {
        return NO_MATCH
    }

    const relevant = rows.find((row) => isEventRelevant(row, pin, role))

    if (!relevant) {
        return NO_MATCH
    }

    return NextResponse.json({
        ok: true,
        event: {
            id: relevant.id,
            tenantId: relevant.tenant_id,
            message: relevant.message,
            createdAt: relevant.created_at,
            targetPin: relevant.target_pin,
            targetRole: relevant.target_role,
            senderDisplayName: relevant.sender_display_name,
            origin: relevant.origin,
        },
    })
}

export async function POST(request: Request) {
    let body: PagerInsertPayload | null = null
    try {
        body = (await request.json()) as PagerInsertPayload
    } catch {
        return BAD_REQUEST
    }

    if (!body?.tenantId || !body.message?.trim()) {
        return BAD_REQUEST
    }

    if (!body.targetPin && !body.targetRole) {
        return BAD_REQUEST
    }

    if (!SUPABASE_SERVICE_AVAILABLE) {
        return NextResponse.json(
            { error: 'supabase-disabled' },
            { status: 503 }
        )
    }

    const supabase = getSupabaseServiceRoleClient()
    const tenantId = await resolveTenantId(body.tenantId, supabase)

    if (!tenantId) {
        return NextResponse.json(
            { error: 'supabase-disabled' },
            { status: 503 }
        )
    }

    const message = body.message.trim()
    const { data, error } = await supabase
        .from('pager_events')
        .insert({
            tenant_id: tenantId,
            target_pin: body.targetPin?.trim() || null,
            target_role: body.targetRole?.trim() || null,
            message,
            origin: body.origin?.trim() || null,
            sender_member_id: body.sender?.memberId || null,
            sender_display_name: body.sender?.displayName || null,
            metadata: {
                sender_pin: body.sender?.pin || null,
                source: 'web',
            },
        })
        .select('*')
        .single()

    if (error) {
        console.error('Supabase pager POST error', error)
        return NextResponse.json(
            { error: 'supabase-error', details: error.message },
            { status: 500 }
        )
    }

    const inserted = data as PagerEventRow

    return NextResponse.json(
        {
            ok: true,
            event: {
                id: inserted.id,
                tenantId: inserted.tenant_id,
                createdAt: inserted.created_at,
            },
        },
        { status: 201 }
    )
}

export async function PUT(request: Request) {
    let body: PagerAckPayload | null = null
    try {
        body = (await request.json()) as PagerAckPayload
    } catch {
        return BAD_REQUEST
    }

    if (!body?.tenantId || !body.id) {
        return BAD_REQUEST
    }

    if (!SUPABASE_SERVICE_AVAILABLE) {
        return NextResponse.json(
            { error: 'supabase-disabled' },
            { status: 503 }
        )
    }

    const supabase = getSupabaseServiceRoleClient()
    const tenantId = await resolveTenantId(body.tenantId, supabase)

    if (!tenantId) {
        return NextResponse.json(
            { error: 'supabase-disabled' },
            { status: 503 }
        )
    }

    const { data: existing, error: fetchError } = await supabase
        .from('pager_events')
        .select('*')
        .eq('id', body.id)
        .eq('tenant_id', tenantId)
        .maybeSingle()

    if (fetchError) {
        console.error('Supabase pager lookup error', fetchError)
        return NextResponse.json(
            { error: 'supabase-error', details: fetchError.message },
            { status: 500 }
        )
    }

    if (!existing) {
        return NextResponse.json({ error: 'not-found' }, { status: 404 })
    }

    const current = existing as PagerEventRow

    if (current.acknowledged_at) {
        return NextResponse.json({ ok: true }, { status: 200 })
    }

    const acknowledgedAt = new Date().toISOString()

    const { error: updateError } = await supabase
        .from('pager_events')
        .update({
            acknowledged_at: acknowledgedAt,
            acknowledged_by_member_id: body.acknowledgedByMemberId || null,
            metadata: {
                ...((current.metadata || {}) as Record<string, unknown>),
                acknowledged_by_display_name:
                    body.acknowledgedByDisplayName || null,
            },
        })
        .eq('id', body.id)
        .eq('tenant_id', tenantId)

    if (updateError) {
        console.error('Supabase pager ack error', updateError)
        return NextResponse.json(
            { error: 'supabase-error', details: updateError.message },
            { status: 500 }
        )
    }

    return NextResponse.json({ ok: true })
}
