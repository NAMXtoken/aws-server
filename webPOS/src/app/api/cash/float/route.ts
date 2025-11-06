import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// In-memory store as fallback while upstream GAS lacks actions.
type Adj = {
    id: string
    description: string
    amount: number
    type: 'topup' | 'withdrawal' | 'adjustment'
    timestamp: string
}
const floats = new Map<
    string,
    { value: number; setAt: number; setBy?: string }
>()
const adjustments = new Map<string, Adj[]>()

function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
    })
}

async function getCurrentShift(origin: string) {
    const res = await fetch(`${origin}/api/gas?action=getCurrentShift`, {
        cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}) as any)
    const shiftId: string | null = data?.shift?.shiftId ?? null
    const openedAt = data?.shift?.openedAt ?? null
    return { shiftId, openedAt }
}

async function getShiftCashSales(origin: string): Promise<number> {
    const res = await fetch(`${origin}/api/gas?action=shiftSummary`, {
        cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}) as any)
    // shiftSummary returns { ok, open: { cashSales, ... } } when a shift is open
    const total: number = Number(data?.open?.cashSales ?? 0) || 0
    return total
}

// GET: fetch current shift cash float summary and transactions
export async function GET(req: Request) {
    try {
        const url = new URL(req.url)
        const origin = url.origin
        const { shiftId } = await getCurrentShift(origin)
        if (!shiftId) {
            return NextResponse.json(
                { ok: false, error: 'No open shift' },
                { status: 400 }
            )
        }

        const startingFloat = floats.get(shiftId)?.value ?? 0
        const totalSales = await getShiftCashSales(origin)
        const adj = adjustments.get(shiftId) ?? []
        const netAdjustments = adj.reduce(
            (s, a) => s + (Number(a.amount) || 0),
            0
        )
        const currentBalance = startingFloat + totalSales + netAdjustments

        return NextResponse.json({
            ok: true,
            shiftId,
            startingFloat,
            totalSales,
            netAdjustments,
            currentBalance,
            transactions: adj,
        })
    } catch (e: unknown) {
        const err = e as Error
        return NextResponse.json(
            { ok: false, error: String((err && err.message) || e) },
            { status: 500 }
        )
    }
}

// POST: record adjustment or set starting float
// Body for adjustment: { type: 'topup'|'withdrawal'|'adjustment', amount: number, description?: string }
// Body for starting float: { startingFloat: number }
export async function POST(req: Request) {
    try {
        const url = new URL(req.url)
        const origin = url.origin
        const body = (await req.json().catch(() => ({}))) as any
        const { shiftId } = await getCurrentShift(origin)
        if (!shiftId) {
            return NextResponse.json(
                { ok: false, error: 'No open shift' },
                { status: 400 }
            )
        }

        // set starting float (local fallback)
        if (body && typeof body === 'object' && body.startingFloat != null) {
            const val = Number(body.startingFloat)
            const now = Date.now()
            floats.set(shiftId, { value: isFinite(val) ? val : 0, setAt: now })
            return NextResponse.json({
                ok: true,
                shiftId,
                startingFloat: floats.get(shiftId)?.value ?? 0,
            })
        }

        // record adjustment (local fallback)
        const { type, amount, description } = body || {}
        if (!type || typeof amount !== 'number') {
            return NextResponse.json(
                { ok: false, error: 'type and amount required' },
                { status: 400 }
            )
        }
        const list = adjustments.get(shiftId) ?? []
        const entry: Adj = {
            id: uuid(),
            description: String(description || ''),
            amount: Number(amount) || 0,
            type: String(type) as any,
            timestamp: new Date().toISOString(),
        }
        list.push(entry)
        adjustments.set(shiftId, list)
        return NextResponse.json({ ok: true, id: entry.id })
    } catch (e: unknown) {
        try {
            // best-effort parse errors
            return NextResponse.json(
                { ok: false, error: String((e as Error)?.message || e) },
                { status: 500 }
            )
        } catch {
            return new Response('Internal Server Error', { status: 500 })
        }
    }
}
