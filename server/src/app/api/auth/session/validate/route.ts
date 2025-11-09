import { NextRequest, NextResponse } from 'next/server'

import { verifySessionToken } from '@/lib/session'

export const runtime = 'nodejs'

type SessionValidateRequest = {
    sessionToken?: string
}

export async function POST(request: NextRequest) {
    let body: SessionValidateRequest
    try {
        body = (await request.json()) as SessionValidateRequest
    } catch {
        return NextResponse.json(
            {
                error: 'invalid_json',
                message: 'Request body must be valid JSON.',
            },
            { status: 400 }
        )
    }

    const { sessionToken } = body ?? {}
    if (!sessionToken) {
        return NextResponse.json(
            {
                error: 'missing_session_token',
                message: 'Provide a sessionToken to validate.',
            },
            { status: 400 }
        )
    }

    const session = verifySessionToken(sessionToken)
    if (!session) {
        return NextResponse.json(
            {
                error: 'invalid_session',
                message: 'Session token is invalid or expired.',
            },
            { status: 401 }
        )
    }

    return NextResponse.json({ session })
}
