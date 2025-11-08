'use client'

type OwnerPersonaPayload = {
    mode: 'owner'
    tenantSlug: string
    tenantId: string
    ownerEmail: string
    ownerName?: string | null
}

type SubPersonaPayload = {
    mode: 'subtenant'
    tenantSlug: string
    tenantId: string
    subEmail: string
    subName?: string | null
    subRole: 'owner' | 'manager' | 'staff'
    pin: string
    inviteToken?: string | null
    ownerEmail?: string | null
}

export type PersonaPersistencePayload =
    | OwnerPersonaPayload
    | SubPersonaPayload

const API_ENDPOINT = '/api/onboarding/persona'

export async function persistTenantPersona(
    payload: PersonaPersistencePayload
): Promise<void> {
    const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })

    if (response.ok) {
        return
    }

    let message = 'Failed to persist tenant data.'
    try {
        const body = (await response.json()) as { error?: string }
        if (body?.error) {
            message = body.error
        }
    } catch {
        /* ignore body parse errors */
    }
    throw new Error(message)
}
