const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const formatUuidFromBytes = (bytes: Uint8Array): string => {
    const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
        12,
        16
    )}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

const computeSha1Bytes = async (input: string): Promise<Uint8Array> => {
    const cryptoObj = globalThis.crypto
    if (!cryptoObj?.subtle) {
        throw new Error('Unable to compute SHA-1: Web Crypto API unavailable')
    }
    const encoder = new TextEncoder()
    const data = encoder.encode(input)
    const hashBuffer = await cryptoObj.subtle.digest('SHA-1', data)
    return new Uint8Array(hashBuffer)
}

export const isTenantUuid = (value: string | null | undefined): boolean => {
    if (!value) return false
    return UUID_PATTERN.test(value.trim())
}

export const tenantSlugToSupabaseId = async (slug: string): Promise<string> => {
    const normalized = slug.trim().toLowerCase()
    if (!normalized) {
        throw new Error('Tenant slug is required')
    }
    const digest = await computeSha1Bytes(`tenant:${normalized}`)
    const bytes = new Uint8Array(digest.slice(0, 16))
    // UUID v5 layout
    bytes[6] = (bytes[6] & 0x0f) | 0x50
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    return formatUuidFromBytes(bytes)
}

export const ensureTenantIdentifiers = async (
    identifier: string | null | undefined
): Promise<{ supabaseId: string | null; slug: string | null }> => {
    if (!identifier) return { supabaseId: null, slug: null }
    const trimmed = identifier.trim()
    if (!trimmed) return { supabaseId: null, slug: null }
    if (isTenantUuid(trimmed)) {
        return { supabaseId: trimmed, slug: null }
    }
    const supabaseId = await tenantSlugToSupabaseId(trimmed)
    return { supabaseId, slug: trimmed }
}

export const formatTenantDisplayName = (slug: string): string | null => {
    const cleaned = slug
        .replace(/^tenant[-_]/, '')
        .replace(/[-_]+/g, ' ')
        .trim()
    if (!cleaned) return null
    return cleaned.replace(/\b\w/g, (char) => char.toUpperCase())
}

export const TENANT_UUID_PATTERN = UUID_PATTERN
