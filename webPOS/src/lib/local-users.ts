'use client'

import { db } from '@/lib/db'
import type { UserRow } from '@/types/db'

export type UserProfile = {
    id: string
    name: string
    role?: string | null
    email?: string | null
    phone?: string | null
    notes?: string | null
}

function emitUsersUpdated() {
    if (typeof window === 'undefined') return
    try {
        window.dispatchEvent(new CustomEvent('users:updated'))
    } catch {}
}

export async function listUsersLocal(): Promise<UserProfile[]> {
    const rows = await db.users.toArray()
    return rows.map((r) => ({
        id: r.pin,
        name: r.name || r.pin,
        role: r.role || null,
        email: r.email || null,
        phone: r.phone || null,
        notes: r.notes || null,
    }))
}

export async function upsertUserLocal(row: Partial<UserRow> & { pin: string }) {
    const now = Date.now()
    const existing = await db.users.get(row.pin)
    const merged: UserRow = {
        pin: row.pin,
        role: row.role ?? existing?.role ?? null,
        name: row.name ?? existing?.name ?? null,
        email: row.email ?? existing?.email ?? null,
        phone: row.phone ?? existing?.phone ?? null,
        notes: row.notes ?? existing?.notes ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    }
    await db.users.put(merged)
}

export async function fetchUserFromRemote(
    pin: string
): Promise<UserProfile | null> {
    try {
        const res = await fetch(
            `/api/gas?action=getUser&pin=${encodeURIComponent(pin)}`
        )
        const ct = res.headers.get('content-type') || ''
        if (!ct.includes('application/json')) return null
        const data = await res.json().catch(() => null)
        const u = data?.user
        if (!u) return null
        return {
            id: String(u.pin || pin),
            name: String(u.name || pin),
            role: (u.role as string) || null,
            email: (u.email as string) || null,
            phone: (u.phone as string) || null,
            notes: (u.notes as string) || null,
        }
    } catch {
        return null
    }
}

export async function fetchAllUsersFromRemote(): Promise<UserProfile[]> {
    try {
        const res = await fetch(`/api/gas?action=listUsers`, {
            cache: 'no-store',
        })
        const ct = res.headers.get('content-type') || ''
        if (!ct.includes('application/json')) return []
        const data = await res.json().catch(() => null as any)
        const list = Array.isArray(data?.users)
            ? data.users
            : Array.isArray(data)
              ? data
              : []
        return list
            .map((u: any) => ({
                id: String(u.pin || '').trim(),
                name: String(u.name || u.pin || '').trim(),
                role: (u.role as string) || null,
                email: (u.email as string) || null,
                phone: (u.phone as string) || null,
                notes: (u.notes as string) || null,
            }))
            .filter((u: UserProfile) => !!u.id)
    } catch {
        return []
    }
}

export async function syncAllUsersFromRemote(): Promise<UserProfile[]> {
    const users = await fetchAllUsersFromRemote()
    if (!users.length) return await listUsersLocal()
    for (const u of users) {
        await upsertUserLocal({
            pin: u.id,
            name: u.name,
            role: u.role ?? null,
            email: u.email ?? null,
            phone: u.phone ?? null,
            notes: u.notes ?? null,
        })
    }
    emitUsersUpdated()
    return await listUsersLocal()
}

export async function ensureUsersLocalFirst(
    pins: string[]
): Promise<UserProfile[]> {
    const resultMap = new Map<string, UserProfile>()

    try {
        const remoteResults = await Promise.all(
            pins.map(async (pin) => {
                const remote = await fetchUserFromRemote(pin)
                if (!remote) return null
                await upsertUserLocal({
                    pin: remote.id,
                    name: remote.name,
                    role: remote.role ?? null,
                    email: remote.email ?? null,
                    phone: remote.phone ?? null,
                    notes: remote.notes ?? null,
                })
                return remote
            })
        )
        const successful = remoteResults.filter((u): u is UserProfile => !!u)
        if (successful.length) {
            for (const profile of successful) {
                resultMap.set(profile.id, profile)
            }
            emitUsersUpdated()
        }
    } catch (error) {
        console.warn('ensureUsersLocalFirst remote fetch failed', error)
    }

    const local = await listUsersLocal()
    const localMap = new Map(local.map((u) => [u.id, u]))

    if (pins.length === 0) {
        if (resultMap.size > 0) return Array.from(resultMap.values())
        return local
    }

    for (const pin of pins) {
        const normalized = String(pin)
        if (resultMap.has(normalized)) continue
        const cached = localMap.get(normalized)
        if (cached) {
            resultMap.set(normalized, cached)
            continue
        }
        await upsertUserLocal({ pin: normalized, name: normalized })
        resultMap.set(normalized, {
            id: normalized,
            name: normalized,
            role: null,
            email: null,
            phone: null,
            notes: null,
        })
    }
    return pins
        .map((pin) => resultMap.get(pin))
        .filter((user): user is UserProfile => !!user)
}
