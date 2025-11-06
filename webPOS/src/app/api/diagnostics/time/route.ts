import { NextResponse } from 'next/server'

export function GET() {
    const now = Date.now()
    const iso = new Date(now).toISOString()
    return NextResponse.json({
        serverTimestamp: now,
        serverIso: iso,
    })
}
