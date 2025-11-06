'use client'

import { db, uuid } from '@/lib/db'
import type { IngredientRow } from '@/types/db'

const toIngredientRow = (input: any): IngredientRow | null => {
    const idSource =
        input?.id ?? input?.ingredientId ?? input?.slug ?? input?.name ?? null
    const id = String(idSource ?? '').trim() || uuid()
    const name = String(input?.name ?? '').trim()
    if (!id || !name) return null
    return {
        id,
        name,
        packageUnits: String(input?.packageUnits ?? '').trim(),
        totalVolume: Number(input?.totalVolume ?? input?.volume ?? 0) || 0,
        updatedAt: Number(input?.updatedAt ?? Date.now()) || Date.now(),
    }
}

export async function listCachedIngredients(): Promise<IngredientRow[]> {
    try {
        return await db.ingredients.orderBy('name').toArray()
    } catch (error) {
        console.warn('Failed to read cached ingredients', error)
        return []
    }
}

export async function saveIngredients(rows: IngredientRow[]): Promise<number> {
    const entries = Array.isArray(rows) ? rows : []
    await db.transaction('readwrite', db.ingredients, async () => {
        await db.ingredients.clear()
        if (entries.length) {
            await db.ingredients.bulkPut(entries)
        }
    })
    return entries.length
}

export async function refreshIngredientsFromRemote(): Promise<
    IngredientRow[] | null
> {
    if (typeof fetch === 'undefined') return []
    try {
        const res = await fetch('/api/gas?action=ingredients', {
            cache: 'no-store',
        })
        if (!res.ok) throw new Error(`ingredients fetch failed: ${res.status}`)
        const data = await res.json().catch(() => ({}))
        const items = Array.isArray(data?.items)
            ? data.items
            : Array.isArray(data)
              ? data
              : []
        const normalized = items
            .map((item: any) => toIngredientRow(item))
            .filter((row: IngredientRow | null): row is IngredientRow =>
                Boolean(row)
            )
        if (normalized.length) await saveIngredients(normalized)
        return normalized
    } catch (error) {
        console.warn('Failed to refresh ingredients', error)
        return null
    }
}

export async function upsertIngredientLocal(
    entry: Partial<IngredientRow> & { name: string }
): Promise<IngredientRow> {
    const normalized = toIngredientRow(entry)
    if (!normalized) {
        throw new Error('Ingredient requires a name')
    }
    await db.ingredients.put(normalized)
    return normalized
}
