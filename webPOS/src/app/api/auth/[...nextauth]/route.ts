import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth/options'

const handler = NextAuth(authOptions)

type RouteContext = {
    params: Promise<{
        nextauth: string[]
    }>
}

type HandlerContext = Parameters<typeof handler>[1]

const MOBILE_DEEP_LINK_ENABLED = process.env.ENABLE_MOBILE_DEEP_LINK === 'true'

function parseCookies(header: string | null): Record<string, string> {
    if (!header) {
        return {}
    }
    return header
        .split(';')
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .reduce<Record<string, string>>((acc, pair) => {
            const eqIndex = pair.indexOf('=')
            if (eqIndex === -1) {
                return acc
            }
            const key = pair.slice(0, eqIndex).trim()
            const rawValue = pair.slice(eqIndex + 1)
            if (!key) {
                return acc
            }
            try {
                acc[key] = decodeURIComponent(rawValue)
            } catch {
                acc[key] = rawValue
            }
            return acc
        }, {})
}

function extractCallbackMetadata(raw: string | undefined | null) {
    if (!raw) {
        return null
    }
    let decoded = raw
    try {
        decoded = decodeURIComponent(raw)
    } catch {
        decoded = raw
    }
    try {
        const parsed = new URL(decoded)
        return {
            href: parsed.toString(),
            returnTo: parsed.searchParams.get('returnTo') || undefined,
            callbackUrl: parsed.searchParams.get('callbackUrl') || undefined,
            flow: parsed.searchParams.get('flow') || undefined,
        }
    } catch {
        return {
            href: decoded,
            returnTo: undefined,
            callbackUrl: undefined,
            flow: undefined,
        }
    }
}

function buildMobileBridgeHtml(params: URLSearchParams) {
    const query = params.toString()
    const intentParts = [
        'intent://auth',
        query ? `?${query}` : '',
        '#Intent;scheme=byndpos;package=app.vercel.byndpos;end',
    ]
    const intentUrl = intentParts.join('')
    const fallbackUrl =
        params.get('callbackUrl') || params.get('returnTo') || '/'
    const intentLiteral = JSON.stringify(intentUrl)
    const fallbackLiteral = JSON.stringify(fallbackUrl)
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Completing sign-in…</title><style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}main{max-width:28rem;padding:2rem;text-align:center}p{margin:0.5rem 0;font-size:0.95rem;opacity:0.85}</style></head><body><main><p>Returning to the app…</p><p>If nothing happens, tap the back button after a moment.</p></main><script>const intent=${intentLiteral};const fallback=${fallbackLiteral};let redirected=false;function launch(){if(redirected)return;redirected=true;try{window.location.replace(intent);}catch{window.location.href=intent;}}window.addEventListener('pagehide',()=>{redirected=true;});setTimeout(launch,30);setTimeout(()=>{if(!redirected){window.location.href=fallback;}},1500);</script></body></html>`
}

export async function GET(request: Request, context: RouteContext) {
    const url = new URL(request.url)
    const isGoogleCallback =
        url.pathname.endsWith('/api/auth/callback/google') ||
        url.pathname.endsWith('/api/auth/callback/google/')

    if (isGoogleCallback) {
        const cookies = parseCookies(request.headers.get('cookie'))
        const callbackCookie = cookies['__Secure-next-auth.callback-url']
        const callbackMeta = extractCallbackMetadata(callbackCookie)
        const deepLinkEligible =
            callbackMeta?.href?.includes('/oauth/google-mobile/') ?? false
        const hasCode = url.searchParams.has('code')
        const hasState = url.searchParams.has('state')
        const mobileAck = url.searchParams.get('mobile')

        if (
            MOBILE_DEEP_LINK_ENABLED &&
            deepLinkEligible &&
            hasCode &&
            hasState &&
            mobileAck !== '1'
        ) {
            const handoffParams = new URLSearchParams()
            url.searchParams.forEach((value, key) => {
                handoffParams.append(key, value)
            })
            if (callbackMeta?.returnTo) {
                handoffParams.set('returnTo', callbackMeta.returnTo)
            }
            if (callbackMeta?.callbackUrl) {
                handoffParams.set('callbackUrl', callbackMeta.callbackUrl)
            }
            if (callbackMeta?.flow) {
                handoffParams.set('flow', callbackMeta.flow)
            }
            const html = buildMobileBridgeHtml(handoffParams)
            const headers = new Headers({
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store',
            })
            return new Response(html, { status: 200, headers })
        }
    }

    const resolvedContext: HandlerContext = {
        ...context,
        params: await context.params,
    }

    const response = await handler(request, resolvedContext)

    return response
}

export const POST = handler
