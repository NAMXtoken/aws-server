const toOptional = (value: string | undefined) => {
    if (!value) return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
}

export const SUPABASE_URL =
    toOptional(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
    toOptional(process.env.SUPABASE_URL)

export const SUPABASE_ANON_KEY =
    toOptional(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
    toOptional(process.env.SUPABASE_ANON_KEY)

export const SUPABASE_SERVICE_ROLE_KEY = toOptional(
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

export const SUPABASE_JWT_SECRET = toOptional(process.env.SUPABASE_JWT_SECRET)

export const SUPABASE_DB_PASSWORD = toOptional(process.env.SUPABASE_DB_PASSWORD)

export const SUPABASE_SSL_CERT_PATH = toOptional(
    process.env.SUPABASE_SSL_CERT_PATH
)

export const SUPABASE_IS_CONFIGURED = Boolean(
    SUPABASE_URL && SUPABASE_ANON_KEY
)

export const SUPABASE_SERVICE_AVAILABLE = Boolean(
    SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
)
