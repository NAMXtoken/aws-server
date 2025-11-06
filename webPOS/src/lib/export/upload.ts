'use client'

import { csvToBase64, exportAllCsvs } from '@/lib/export/csv'
import { clearAllLocalData } from '@/lib/db'

async function uploadOne(fileName: string, csv: string) {
    const contentBase64 = csvToBase64(csv)
    const res = await fetch('/api/gas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'uploadExport',
            fileName,
            contentBase64,
        }),
    })
    if (!res.ok) {
        const text = await res.text().catch(() => String(res.status))
        throw new Error(text || `Upload failed: ${fileName}`)
    }
    const data = await res.json().catch(() => ({}))
    if (!data?.ok)
        throw new Error(String(data?.error || `Upload failed: ${fileName}`))
}

export async function uploadDailyExport(): Promise<{ uploaded: string[] }> {
    const files = await exportAllCsvs()
    const names = Object.keys(files)
    for (const name of names) {
        await uploadOne(name, files[name]!)
    }
    await clearAllLocalData()
    return { uploaded: names }
}
