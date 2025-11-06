export const USE_APPS_SCRIPT_API =
    (process.env.USE_APPS_SCRIPT_API || 'false').toLowerCase() === 'true'

export const GOOGLE_SCRIPT_ID = process.env.GOOGLE_SCRIPT_ID || ''

// OAuth2 (server-owned user) credentials
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
export const GOOGLE_OAUTH_REFRESH_TOKEN =
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN || ''
export const GOOGLE_REDIRECT_URI =
    process.env.GOOGLE_REDIRECT_URI || 'https://bynd-pos.vercel.app'

// Service Account (optional) with domain-wide delegation
export const GOOGLE_SERVICE_ACCOUNT_JSON =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '' // stringified JSON
export const GOOGLE_IMPERSONATE_SUBJECT =
    process.env.GOOGLE_IMPERSONATE_SUBJECT || '' // user to impersonate

export const isServiceAccountConfigured = () =>
    Boolean(GOOGLE_SERVICE_ACCOUNT_JSON)
export const isOAuthConfigured = () =>
    Boolean(
        GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_OAUTH_REFRESH_TOKEN
    )
