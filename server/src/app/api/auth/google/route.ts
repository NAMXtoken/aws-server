import { OAuth2Client } from 'google-auth-library'
import { NextRequest, NextResponse } from 'next/server'

import { signSessionToken } from '@/lib/session'

export const runtime = 'nodejs'

const googleClientId = process.env.GOOGLE_CLIENT_ID

if (!googleClientId) {
    console.warn(
        '[auth-backend] GOOGLE_CLIENT_ID not set. Requests to /api/auth/google will fail token verification.'
    )
}

const oauthClient = googleClientId
    ? new OAuth2Client(googleClientId)
    : undefined

type GoogleAuthRequest = {
    idToken?: string
}

export async function POST(request: NextRequest) {
    if (!oauthClient || !googleClientId) {
        return NextResponse.json(
            {
                error: 'server_not_configured',
                message:
                    'Server missing GOOGLE_CLIENT_ID. Set it and redeploy.',
            },
            { status: 500 }
        )
    }

    let body: GoogleAuthRequest
    try {
        body = (await request.json()) as GoogleAuthRequest
    } catch {
        return NextResponse.json(
            {
                error: 'invalid_json',
                message: 'Request body must be valid JSON.',
            },
            { status: 400 }
        )
    }

    const { idToken } = body ?? {}
    if (!idToken) {
        return NextResponse.json(
            {
                error: 'missing_id_token',
                message: 'Provide an idToken from Google Sign-In.',
            },
            { status: 400 }
        )
    }

    try {
        const ticket = await oauthClient.verifyIdToken({
            idToken,
            audience: googleClientId,
        })

        const payload = ticket.getPayload()
        if (!payload?.sub) {
            return NextResponse.json(
                {
                    error: 'invalid_token',
                    message: 'Token missing subject (sub) claim.',
                },
                { status: 422 }
            )
        }

        const sessionToken = signSessionToken(payload.sub)
        return NextResponse.json({
            sessionToken,
            user: {
                id: payload.sub,
                email: payload.email,
                name: payload.name,
                picture: payload.picture,
                emailVerified: payload.email_verified ?? false,
            },
            tokenInfo: {
                audience: payload.aud,
                expiresAt: payload.exp,
                issuedAt: payload.iat,
            },
        })
    } catch (error) {
        console.error('[auth-backend] Failed to verify Google ID token', error)
        return NextResponse.json(
            {
                error: 'token_verification_failed',
                message:
                    'Unable to verify Google ID token. Check client ID and token source.',
            },
            { status: 401 }
        )
    }
}
