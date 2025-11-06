export type ClockTokenPayload = {
    iat: number
    exp: number
    nonce: string
    kioskSession?: string
    tenantId?: string
    accountEmail?: string
}

export function b64url(input: string | Uint8Array): string {
    let bytes: Uint8Array
    if (typeof input === 'string') bytes = new TextEncoder().encode(input)
    else bytes = input
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    const b64 =
        typeof btoa === 'function'
            ? btoa(bin)
            : Buffer.from(bytes).toString('base64')
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export async function hmacSha256(
    input: string,
    secret: string
): Promise<string> {
    if (!(typeof crypto !== 'undefined' && (crypto as any).subtle)) {
        throw new Error('Web Crypto API is not available in this environment')
    }
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    )
    const sig = await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(input)
    )
    return b64url(new Uint8Array(sig))
}

function b64urlToBase64(input: string): string {
    const padded =
        input.length % 4 === 0
            ? input
            : input + '='.repeat(4 - (input.length % 4))
    return padded.replace(/-/g, '+').replace(/_/g, '/')
}

export function b64urlDecode(input: string): Uint8Array {
    const base64 = b64urlToBase64(String(input || ''))
    if (typeof atob === 'function') {
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i)
        }
        return bytes
    }
    if (typeof Buffer !== 'undefined') {
        return new Uint8Array(Buffer.from(base64, 'base64'))
    }
    throw new Error('Base64 decoding is not supported in this environment')
}

function decodeText(bytes: Uint8Array): string {
    if (typeof TextDecoder !== 'undefined') {
        return new TextDecoder().decode(bytes)
    }
    let result = ''
    for (let i = 0; i < bytes.length; i += 1) {
        result += String.fromCharCode(bytes[i])
    }
    return result
}

export function decodeClockTokenPayload(token: string): {
    payloadJson: string
    payload: ClockTokenPayload
    signature: string
} {
    const parts = String(token || '').split('.')
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new Error('Invalid clock token structure')
    }
    const [payloadB64, signature] = parts
    const payloadBytes = b64urlDecode(payloadB64)
    const payloadJson = decodeText(payloadBytes)
    let payload: ClockTokenPayload
    try {
        payload = JSON.parse(payloadJson) as ClockTokenPayload
    } catch (error) {
        throw new Error('Invalid clock token payload')
    }
    if (
        typeof payload.iat !== 'number' ||
        typeof payload.exp !== 'number' ||
        !payload.nonce
    ) {
        throw new Error('Clock token payload missing required fields')
    }
    return { payloadJson, payload, signature }
}

function timingSafeEqual(a: string, b: string): boolean {
    const len = Math.max(a.length, b.length)
    let diff = a.length ^ b.length
    for (let i = 0; i < len; i += 1) {
        const charA = i < a.length ? a.charCodeAt(i) : 0
        const charB = i < b.length ? b.charCodeAt(i) : 0
        diff |= charA ^ charB
    }
    return diff === 0
}

export async function verifyClockToken(
    token: string,
    secret: string
): Promise<ClockTokenPayload> {
    const { payloadJson, payload, signature } = decodeClockTokenPayload(token)
    const expectedSignature = await hmacSha256(payloadJson, secret)
    if (!timingSafeEqual(signature, expectedSignature)) {
        throw new Error('Invalid clock token signature')
    }
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp <= now) {
        throw new Error('Clock token has expired')
    }
    if (payload.iat > now + 60) {
        throw new Error('Clock token issued in the future')
    }
    return payload
}

export async function mintClockToken(
    secret: string,
    kioskSession?: string,
    ttlSeconds = 5,
    context?: { tenantId?: string; accountEmail?: string }
): Promise<{
    token: string
    iat: number
    exp: number
    payload: ClockTokenPayload
}> {
    const now = Math.floor(Date.now() / 1000)
    const iat = now
    const exp = now + Math.max(3, ttlSeconds)
    const nonce = cryptoRandom()
    const payload: ClockTokenPayload = {
        iat,
        exp,
        nonce,
        kioskSession,
        tenantId: context?.tenantId,
        accountEmail: context?.accountEmail,
    }
    const payloadJson = JSON.stringify(payload)
    const sig = await hmacSha256(payloadJson, secret)
    const token = `${b64url(payloadJson)}.${sig}`
    return { token, iat, exp, payload }
}

export function cryptoRandom(): string {
    if (!(typeof crypto !== 'undefined' && (crypto as any).getRandomValues)) {
        throw new Error('Web Crypto API getRandomValues is not available')
    }
    const arr = new Uint8Array(16)
    crypto.getRandomValues(arr)
    return Array.from(arr)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
}
