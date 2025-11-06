'use client'
import { db } from '@/lib/db'
import type { DailyReportCacheEntry } from '@/types/db'

export async function loadDailyReportCache(
    key: string
): Promise<DailyReportCacheEntry | null> {
    try {
        return (await db.daily_reports_cache.get(key)) || null
    } catch {
        return null
    }
}

export async function saveDailyReportCache(
    entry: DailyReportCacheEntry
): Promise<void> {
    try {
        await db.daily_reports_cache.put(entry)
    } catch {
        // ignore local persistence errors
    }
}

export function makeDailyReportKey(year: number, month: number): string {
    const normalizedMonth = String(month).padStart(2, '0')
    return `daily:${year}:${normalizedMonth}`
}
