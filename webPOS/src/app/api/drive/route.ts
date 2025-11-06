export const runtime = 'edge'

function extractId(urlOrId: string): string | null {
    try {
        if (!urlOrId) return null
        // If it's already an ID-like token
        if (!/^https?:\/\//i.test(urlOrId)) return urlOrId
        const u = new URL(urlOrId)
        const idParam = u.searchParams.get('id')
        if (idParam) return idParam
        // Try /file/d/{id}/
        const m = u.pathname.match(/\/file\/d\/([^/]+)\//)
        if (m && m[1]) return m[1]
        return null
    } catch {
        return null
    }
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const raw = searchParams.get('id') || ''
    const id = extractId(raw)
    if (!id) {
        return new Response(
            JSON.stringify({ ok: false, error: 'id required' }),
            {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    }
    const driveUrl = `https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}`
    try {
        const res = await fetch(driveUrl, {
            cache: 'no-store',
            redirect: 'follow',
        })
        if (!res.ok) {
            return new Response(
                JSON.stringify({ ok: false, error: `Upstream ${res.status}` }),
                {
                    status: 502,
                    headers: { 'Content-Type': 'application/json' },
                }
            )
        }
        const ct = res.headers.get('content-type') || ''
        // If Drive served image bytes directly, stream them through
        if (ct.startsWith('image/')) {
            return new Response(res.body, {
                status: 200,
                headers: new Headers({
                    'Content-Type': ct,
                    'Cache-Control': 'public, max-age=3600, s-maxage=3600',
                }),
            })
        }
        // Otherwise, Drive likely returned an HTML preview page. Extract the actual image URL.
        const html = await res.text()
        const m = html.match(/https:\/\/[^"']*googleusercontent\.com[^"']*/)
        if (m && m[0]) {
            const imgUrl = m[0]
            const imgRes = await fetch(imgUrl, {
                cache: 'no-store',
                redirect: 'follow',
            })
            if (!imgRes.ok) {
                return new Response(
                    JSON.stringify({
                        ok: false,
                        error: `Upstream image ${imgRes.status}`,
                    }),
                    {
                        status: 502,
                        headers: { 'Content-Type': 'application/json' },
                    }
                )
            }
            const imgCt = imgRes.headers.get('content-type') || 'image/jpeg'
            return new Response(imgRes.body, {
                status: 200,
                headers: new Headers({
                    'Content-Type': imgCt,
                    'Cache-Control': 'public, max-age=3600, s-maxage=3600',
                }),
            })
        }
        return new Response(
            JSON.stringify({
                ok: false,
                error: 'Image URL not found in preview',
            }),
            {
                status: 502,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        })
    }
}
