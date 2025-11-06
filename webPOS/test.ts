export const runtime = 'edge'

type EdgeWebSocket = WebSocket & { accept(): void }

type EdgeWebSocketPair = {
    0: EdgeWebSocket
    1: EdgeWebSocket
}

declare const WebSocketPair: {
    new (): EdgeWebSocketPair
}

type ConnectionKey = string

type PagerEvent = {
    id: string
    tenantId: string
    targetPin: string | null
    targetRole: string | null
    message: string
    createdAt: number
    sender?: string | null
    origin?: string | null
}

type PagerState = {
    connections: Map<ConnectionKey, Set<WebSocket>>
    socketMeta: WeakMap<WebSocket, {
        tenantId: string
        pin: string | null
        role: string | null
    }>
    queues: Map<ConnectionKey, PagerEvent[]>
}

const globalSymbol = Symbol.for('__BYND_PAGER_STATE__')

const state: PagerState = ((): PagerState => {
    const globalScope = globalThis as typeof globalThis & {
        [globalSymbol]?: PagerState
    }
    if (globalScope[globalSymbol]) return globalScope[globalSymbol] as PagerState
    const initial: PagerState = {
        connections: new Map(),
        socketMeta: new WeakMap(),
        queues: new Map(),
    }
    globalScope[globalSymbol] = initial
    return initial
})()

function makeKey(kind: 'pin' | 'role', tenantId: string, value: string | null | undefined) {
    if (!tenantId || !value) return null
    return `${tenantId}::${kind}::${value}`
}

function registerConnection(socket: WebSocket, tenantId: string, pin: string | null, role: string | null) {
    state.socketMeta.set(socket, { tenantId, pin, role })
    const pinKey = makeKey('pin', tenantId, pin)
    const roleKey = makeKey('role', tenantId, role)
    if (pinKey) addSocketToKey(pinKey, socket)
    if (roleKey) addSocketToKey(roleKey, socket)
}

function addSocketToKey(key: ConnectionKey, socket: WebSocket) {
    let set = state.connections.get(key)
    if (!set) {
        set = new Set()
        state.connections.set(key, set)
    }
    set.add(socket)
    const queue = state.queues.get(key)
    if (queue && queue.length) {
        queue.forEach((event) => sendEvent(socket, event))
    }
}

function removeConnection(socket: WebSocket) {
    const meta = state.socketMeta.get(socket)
    if (!meta) return
    const pinKey = makeKey('pin', meta.tenantId, meta.pin)
    const roleKey = makeKey('role', meta.tenantId, meta.role)
    if (pinKey) removeSocketFromKey(pinKey, socket)
    if (roleKey) removeSocketFromKey(roleKey, socket)
    state.socketMeta.delete(socket)
}

function removeSocketFromKey(key: ConnectionKey, socket: WebSocket) {
    const set = state.connections.get(key)
    if (!set) return
    set.delete(socket)
    if (set.size === 0) state.connections.delete(key)
}

function storeEvent(keys: Array<ConnectionKey | null>, event: PagerEvent) {
    keys.forEach((key) => {
        if (!key) return
        const queue = state.queues.get(key) ?? []
        queue.push(event)
        state.queues.set(key, queue.slice(-10))
    })
}

function removeEvent(keys: Array<ConnectionKey | null>, id: string) {
    keys.forEach((key) => {
        if (!key) return
        const queue = state.queues.get(key)
        if (!queue) return
        state.queues.set(
            key,
            queue.filter((evt) => evt.id !== id)
        )
    })
}

function broadcast(keys: Array<ConnectionKey | null>, payload: unknown) {
    const data = JSON.stringify(payload)
    keys.forEach((key) => {
        if (!key) return
        const sockets = state.connections.get(key)
        if (!sockets) return
        sockets.forEach((socket) => {
            try {
                socket.send(data)
            } catch {}
        })
    })
}

function sendEvent(socket: WebSocket, event: PagerEvent) {
    try {
        socket.send(
            JSON.stringify({
                type: 'pager',
                event,
            })
        )
    } catch {}
}

function createEvent(input: {
    tenantId: string
    targetPin: string | null
    targetRole: string | null
    message: string
    sender?: string | null
    origin?: string | null
}): PagerEvent {
    return {
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        targetPin: input.targetPin,
        targetRole: input.targetRole,
        message: input.message,
        createdAt: Date.now(),
        sender: input.sender ?? null,
        origin: input.origin ?? null,
    }
}

export async function GET(request: Request) {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Expected websocket upgrade', { status: 426 })
    }

    const { searchParams } = new URL(request.url)
    const tenantId = (searchParams.get('tenantId') || '').trim()
    const pin = (searchParams.get('pin') || '').trim() || null
    const role = (searchParams.get('role') || '').trim() || null

    if (!tenantId) {
        return new Response('Missing tenantId', { status: 400 })
    }

    const { 0: client, 1: server } = new WebSocketPair()
    server.accept()

    registerConnection(server, tenantId, pin, role)

    server.addEventListener('message', (event: MessageEvent) => {
        try {
            const data = JSON.parse(String(event.data || '{}'))
            if (data && data.type === 'ack' && data.id) {
                const meta = state.socketMeta.get(server)
                const keys = meta
                    ? [
                          makeKey('pin', meta.tenantId, meta.pin),
                          makeKey('role', meta.tenantId, meta.role),
                      ]
                    : []
                removeEvent(keys, String(data.id))
            }
        } catch {}
    })

    server.addEventListener('close', () => {
        removeConnection(server)
    })

    server.addEventListener('error', () => {
        removeConnection(server)
    })

    return new Response(null, {
        status: 101,
        // @ts-expect-error - webSocket property is available in Edge runtime
        webSocket: client,
    })
}

export function postPager(event: PagerEvent) {
    const pinKey = makeKey('pin', event.tenantId, event.targetPin)
    const roleKey = makeKey('role', event.tenantId, event.targetRole)
    const keys = [pinKey, roleKey]
    storeEvent(keys, event)
    broadcast(keys, { type: 'pager', event })
}

export function acknowledgePager(id: string, meta: { tenantId: string; pin: string | null; role: string | null }) {
    const keys = [
        makeKey('pin', meta.tenantId, meta.pin),
        makeKey('role', meta.tenantId, meta.role),
    ]
    removeEvent(keys, id)
}
