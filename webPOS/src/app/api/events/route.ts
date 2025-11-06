/* eslint-disable @typescript-eslint/ban-ts-comment */
export const runtime = 'nodejs'

function sseEvent(name: string, data?: string) {
    const lines = [
        name ? `event: ${name}` : undefined,
        `data: ${data ?? ''}`,
        '',
        '',
    ].filter(Boolean)
    return new TextEncoder().encode(lines.join('\n'))
}

async function hashText(text: string) {
    // Stable but cheap hash for change detection
    const enc = new TextEncoder().encode(text)
    const buf = await crypto.subtle.digest('SHA-1', enc)
    const bytes = Array.from(new Uint8Array(buf))
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function GET(req: Request) {
    const url = new URL(req.url)
    const { searchParams } = url
    const pollMs = Number(
        searchParams.get('intervalMs') || process.env.EVENTS_POLL_MS || 2000
    )
    const origin = url.origin
    const wantTickets = searchParams.get('tickets') !== '0'
    const wantShift = searchParams.get('shift') !== '0'
    const wantInventory = searchParams.get('inventory') !== '0'

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            // Announce connection
            controller.enqueue(sseEvent('open', JSON.stringify({ ok: true })))
            let timer: NodeJS.Timeout | null = null
            const abort = (reason?: unknown) => {
                if (timer) clearInterval(timer)
                try {
                    controller.close()
                } catch {}
            }

            // Poll a few lightweight resources via our Edge proxy
            let lastTickets = ''
            let lastShift = ''
            let lastInventory = ''

            const tick = async () => {
                try {
                    // Fetch only the subscribed topics
                    const reqs: Array<Promise<Response>> = []
                    if (wantTickets)
                        reqs.push(
                            fetch(`${origin}/api/gas?action=listOpenTickets`, {
                                cache: 'no-store',
                            })
                        )
                    if (wantShift)
                        reqs.push(
                            fetch(`${origin}/api/gas?action=shiftSummary`, {
                                cache: 'no-store',
                            })
                        )
                    if (wantInventory)
                        reqs.push(
                            fetch(
                                `${origin}/api/gas?action=inventorySnapshot`,
                                { cache: 'no-store' }
                            )
                        )

                    const resps = await Promise.all(reqs)
                    let idx = 0
                    if (wantTickets) {
                        const tTxt = await resps[idx++].text().catch(() => '')
                        const tHash = await hashText(tTxt)
                        if (tHash && tHash !== lastTickets) {
                            lastTickets = tHash
                            controller.enqueue(sseEvent('tickets', '1'))
                        }
                    }
                    if (wantShift) {
                        const sTxt = await resps[idx++].text().catch(() => '')
                        const sHash = await hashText(sTxt)
                        if (sHash && sHash !== lastShift) {
                            lastShift = sHash
                            controller.enqueue(sseEvent('shift', '1'))
                        }
                    }
                    if (wantInventory) {
                        const iTxt = await resps[idx++].text().catch(() => '')
                        const iHash = await hashText(iTxt)
                        if (iHash && iHash !== lastInventory) {
                            lastInventory = iHash
                            controller.enqueue(sseEvent('inventory', '1'))
                        }
                    }
                } catch {
                    // transient errors ignored; connection stays open
                }
            }

            timer = setInterval(tick, Math.max(1500, pollMs))
            // First tick immediately
            tick()

            // Abort handling
            // @ts-ignore - on Edge/Node, req.signal is AbortSignal
            const signal: AbortSignal | undefined = req.signal
            signal?.addEventListener('abort', () => abort('aborted'))
        },
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    })
}
