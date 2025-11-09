import { createHmac, timingSafeEqual } from 'crypto'

const DEFAULT_SESSION_SECRET = 'change-me'

export interface SessionPayload {
    sub: string
    iat: number
    exp: number
}

const sessionSecret = process.env.SESSION_SECRET ?? DEFAULT_SESSION_SECRET
const SESSION_TTL_SECONDS = 60 * 60

export function signSessionToken(userId: string): string {
    const issuedAt = Math.floor(Date.now() / 1000)
    const header = Buffer.from(
        JSON.stringify({ alg: 'HS256', typ: 'JWT' })
    ).toString('base64url')

    const payload = Buffer.from(
        JSON.stringify({
            sub: userId,
            iat: issuedAt,
            exp: issuedAt + SESSION_TTL_SECONDS,
        })
    ).toString('base64url')

    const signature = createHmac('sha256', sessionSecret)
        .update(`${header}.${payload}`)
        .digest('base64url')

    return `${header}.${payload}.${signature}`
}

export function verifySessionToken(token: string): SessionPayload | null {
    const segments = token.split('.')
    if (segments.length !== 3) {
        return null
    }

    const [headerSegment, payloadSegment, signatureSegment] = segments

    const expectedSignature = createHmac('sha256', sessionSecret)
        .update(`${headerSegment}.${payloadSegment}`)
        .digest()

    const receivedSignature = safeFromBase64Url(signatureSegment)
    if (!receivedSignature) {
        return null
    }

    if (
        receivedSignature.length !== expectedSignature.length ||
        !timingSafeEqual(receivedSignature, expectedSignature)
    ) {
        return null
    }

    try {
        const decoded = JSON.parse(
            Buffer.from(payloadSegment, 'base64url').toString('utf8')
        ) as SessionPayload

        if (
            typeof decoded.sub !== 'string' ||
            typeof decoded.exp !== 'number' ||
            decoded.exp < Math.floor(Date.now() / 1000)
        ) {
            return null
        }

        return decoded
    } catch {
        return null
    }
}

function safeFromBase64Url(segment: string): Buffer | null {
    try {
        return Buffer.from(segment, 'base64url')
    } catch {
        return null
    }
}
