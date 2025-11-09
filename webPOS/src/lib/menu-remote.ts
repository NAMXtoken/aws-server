'use client'

import type { MenuRow } from '@/types/db'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { getActiveTenantSupabaseId } from '@/lib/tenant-supabase'

export type MenuMetadata = {
    image?: string
    purchasePrice?: number
    warehouseName?: string
    shelfLifeDays?: number
    purchasedUnit?: string
    consumeUnit?: string
    volume?: number
    lowStockQty?: number
    ingredients?: unknown
    options?: string
}

export type MenuUpsertInput = {
    id: string
    name: string
    price: number
    category?: string
    description?: string | null
    active?: boolean
    metadata?: MenuMetadata
}

export async function upsertMenuItemRemote(
    input: MenuUpsertInput
): Promise<void> {
    const supabaseId = await getActiveTenantSupabaseId()
    if (!supabaseId) {
        throw new Error('Unable to resolve tenant for Supabase sync')
    }
    const supabase = getSupabaseBrowserClient()
    const payload = {
        id: input.id,
        tenant_id: supabaseId,
        name: input.name,
        description: input.description ?? null,
        price: input.price,
        category: input.category || null,
        active: input.active ?? true,
        metadata: input.metadata ?? {},
    }
    const { error } = await supabase.from('menu_items').upsert(payload)
    if (error) {
        throw error
    }
}

export function buildMenuMetadataFromRow(row: Partial<MenuRow>): MenuMetadata {
    return {
        image: row.image ?? '',
        purchasePrice: row.purchasePrice ?? 0,
        warehouseName: row.warehouseName ?? '',
        shelfLifeDays: row.shelfLifeDays ?? 0,
        purchasedUnit: row.purchasedUnit ?? '',
        consumeUnit: row.consumeUnit ?? '',
        volume: row.volume ?? 0,
        lowStockQty: row.lowStockQty ?? 0,
        ingredients: row.ingredients ? safeJson(row.ingredients) : undefined,
        options: row.options ?? '',
    }
}

const safeJson = (value: unknown): unknown => {
    if (typeof value === 'string') {
        try {
            return JSON.parse(value)
        } catch {
            return value
        }
    }
    return value ?? undefined
}
