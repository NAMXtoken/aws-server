'use client'

import { db, uuid } from '@/lib/db'
import { readCookie } from '@/lib/session'
import type { NotificationRow } from '@/types/db'

async function safeOpen(): Promise<void> {
    try {
        if (!db.isOpen()) await db.open()
    } catch {}
}
async function hasStore(name: string): Promise<boolean> {
    try {
        if (!db.isOpen()) await db.open()
        // Rely on Dexie schema; if store was just added, version bump (db.ts) forces creation
        return (db as any)[name] != null
    } catch {
        return false
    }
}

export async function listMyNotifications(): Promise<NotificationRow[]> {
    const userId =
        readCookie('pin') ||
        readCookie('email') ||
        readCookie('name') ||
        'local-user'
    try {
        await safeOpen()
        if (!(await hasStore('notifications'))) return []
        const rows = await db.notifications
            .where('userId')
            .equals(String(userId))
            .reverse()
            .sortBy('createdAt')
        return rows
    } catch (e) {
        const msg = String((e as any)?.message || e)
        if (
            msg.includes('object stores') ||
            (e as any)?.name === 'NotFoundError'
        )
            return []
        throw e
    }
}

export async function addNotification(input: {
    userId: string
    title: string
    body: string
    meta?: Record<string, unknown>
}): Promise<NotificationRow> {
    const row: NotificationRow = {
        id: uuid(),
        userId: String(input.userId),
        title: input.title,
        body: input.body,
        createdAt: Date.now(),
        read: false,
        meta: input.meta,
    }
    try {
        await safeOpen()
        await db.notifications.add(row)
    } catch (e) {
        // Swallow if store not present yet; caller action can proceed without notifications
        const msg = String((e as any)?.message || e)
        if (
            !(
                msg.includes('object stores') ||
                (e as any)?.name === 'NotFoundError'
            )
        )
            throw e
    }
    return row
}

export async function markAllMyNotificationsRead(): Promise<number> {
    const userId =
        readCookie('pin') ||
        readCookie('email') ||
        readCookie('name') ||
        'local-user'
    try {
        await safeOpen()
        if (!(await hasStore('notifications'))) return 0
        const rows = await db.notifications
            .where('userId')
            .equals(String(userId))
            .toArray()
        await db.notifications.bulkPut(rows.map((r) => ({ ...r, read: true })))
        return rows.length
    } catch (e) {
        const msg = String((e as any)?.message || e)
        if (
            msg.includes('object stores') ||
            (e as any)?.name === 'NotFoundError'
        )
            return 0
        throw e
    }
}

export async function clearAllMyNotifications(): Promise<number> {
    const userId =
        readCookie('pin') ||
        readCookie('email') ||
        readCookie('name') ||
        'local-user'
    try {
        await safeOpen()
        if (!(await hasStore('notifications'))) return 0
        const rows = await db.notifications
            .where('userId')
            .equals(String(userId))
            .toArray()
        if (rows.length)
            await db.notifications.bulkDelete(rows.map((r) => r.id))
        return rows.length
    } catch (e) {
        const msg = String((e as any)?.message || e)
        if (
            msg.includes('object stores') ||
            (e as any)?.name === 'NotFoundError'
        )
            return 0
        throw e
    }
}

export async function clearAllNotificationsForAllUsers(): Promise<number> {
    try {
        await safeOpen()
        if (!(await hasStore('notifications'))) return 0
        const count = await db.notifications.count()
        if (count) await db.notifications.clear()
        return count
    } catch (e) {
        const msg = String((e as any)?.message || e)
        if (
            msg.includes('object stores') ||
            (e as any)?.name === 'NotFoundError'
        )
            return 0
        throw e
    }
}
