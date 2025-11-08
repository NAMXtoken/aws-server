import { NextResponse } from 'next/server'

import { SUPABASE_SERVICE_AVAILABLE } from '@/lib/supabase/env'
import { getSupabaseServiceRoleClient } from '@/lib/supabase/server'
import {
    formatTenantDisplayName,
    isTenantUuid,
    tenantSlugToSupabaseId,
} from '@/lib/tenant-ids'

type OwnerPayload = {
    mode: 'owner'
    tenantSlug: string
    tenantId?: string
    ownerEmail: string
    ownerName?: string | null
}

type SubtenantPayload = {
    mode: 'subtenant'
    tenantSlug: string
    tenantId?: string
    subEmail: string
    subName?: string | null
    subRole: 'owner' | 'manager' | 'staff'
    pin: string
    inviteToken?: string | null
    ownerEmail?: string | null
}

type PersonaPayload = OwnerPayload | SubtenantPayload

const BAD_REQUEST = NextResponse.json(
    { error: 'invalid-persona-payload' },
    { status: 400 }
)

const SERVICE_UNAVAILABLE = NextResponse.json(
    { error: 'supabase-disabled' },
    { status: 503 }
)

const SUCCESS = NextResponse.json({ ok: true })

const normalizeEmail = (value: string | null | undefined): string | null => {
    if (!value) return null
    const trimmed = value.trim().toLowerCase()
    return trimmed.length ? trimmed : null
}

const normalizeSlug = (value: string | null | undefined): string | null => {
    if (!value) return null
    const trimmed = value.trim().toLowerCase()
    return trimmed.length ? trimmed : null
}

const normalizeName = (value: string | null | undefined): string | null => {
    if (!value) return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
}

const isOwnerPayload = (payload: PersonaPayload): payload is OwnerPayload =>
    payload.mode === 'owner'

const isSubtenantPayload = (
    payload: PersonaPayload
): payload is SubtenantPayload => payload.mode === 'subtenant'

async function resolveTenantId(
    slug: string,
    fallbackId?: string
): Promise<string> {
    if (fallbackId && isTenantUuid(fallbackId)) {
        return fallbackId
    }
    return await tenantSlugToSupabaseId(slug)
}

async function ensureTenantExists(
    payload: OwnerPayload | SubtenantPayload,
    displayName: string | null,
    metadata: Record<string, unknown>
) {
    const slug = normalizeSlug(payload.tenantSlug)
    if (!slug) {
        throw new Error('Tenant slug is required.')
    }
    const tenantId = await resolveTenantId(slug, payload.tenantId)

    const supabase = getSupabaseServiceRoleClient()

    const tenantPayload: {
        id: string
        slug: string
        display_name: string | null
        metadata: Record<string, unknown>
    } = {
        id: tenantId,
        slug,
        display_name:
            displayName ??
            formatTenantDisplayName(slug) ??
            slug.replace(/^tenant[-_]/, ''),
        metadata,
    }

    const { error } = await supabase
        .from('tenants')
        .upsert(tenantPayload, { onConflict: 'id' })

    if (error) {
        throw new Error(`Failed to store tenant (${error.message}).`)
    }

    return { tenantId, supabase }
}

async function persistOwner(payload: OwnerPayload) {
    const ownerEmail = normalizeEmail(payload.ownerEmail)
    if (!ownerEmail) {
        throw new Error('Owner email is required.')
    }

    const ownerName = normalizeName(payload.ownerName)
    const metadata = {
        source: 'tenant-wizard-owner',
        ownerEmail,
        slug: payload.tenantSlug,
    }

    await ensureTenantExists(payload, ownerName, metadata)
}

const ALLOWED_ROLES = new Set(['owner', 'manager', 'staff'])

async function persistSubtenant(payload: SubtenantPayload) {
    const email = normalizeEmail(payload.subEmail)
    if (!email) {
        throw new Error('Sub-tenant email is required.')
    }
    const pin = payload.pin?.trim()
    if (!pin || !/^\d{4}$/.test(pin)) {
        throw new Error('Sub-tenant PIN must be a 4-digit code.')
    }
    const role = ALLOWED_ROLES.has(payload.subRole)
        ? payload.subRole
        : 'staff'
    const displayName =
        normalizeName(payload.subName) ??
        email.split('@')[0]?.replace(/[^a-z0-9]+/gi, ' ') ??
        email

    const memberMetadata = {
        source: 'tenant-wizard-subtenant',
        email,
        inviteToken: payload.inviteToken ?? null,
        ownerEmail: payload.ownerEmail ?? null,
        role,
    }

    await ensureTenantExists(payload, null, {
        source: 'tenant-wizard-subtenant',
        slug: payload.tenantSlug,
    })
}

export async function POST(request: Request) {
    if (!SUPABASE_SERVICE_AVAILABLE) {
        return SERVICE_UNAVAILABLE
    }

    let payload: PersonaPayload | null = null
    try {
        payload = (await request.json()) as PersonaPayload
    } catch {
        return BAD_REQUEST
    }

    if (!payload || typeof payload !== 'object') {
        return BAD_REQUEST
    }

    try {
        if (isOwnerPayload(payload)) {
            await persistOwner(payload)
            return SUCCESS
        }
        if (isSubtenantPayload(payload)) {
            await persistSubtenant(payload)
            return SUCCESS
        }
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Failed to store persona.'
        return NextResponse.json({ error: message }, { status: 500 })
    }

    return BAD_REQUEST
}
