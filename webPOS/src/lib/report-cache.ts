'use client'
import { db } from '@/lib/db'
import type { ReportCacheEntry } from '@/types/db'

export async function loadReportCache(
    key: string
): Promise<ReportCacheEntry | null> {
    try {
        return (await db.reports_cache.get(key)) || null
    } catch {
        return null
    }
}

export async function saveReportCache(entry: ReportCacheEntry): Promise<void> {
    try {
        await db.reports_cache.put(entry)
    } catch {
        // ignore
    }
}

export function makeReportKey(
    range: string,
    start: string,
    end: string
): string {
    return `reports:${range}:${start}:${end}`
}
