import { getActiveTenantId } from '@/lib/tenant-config'
import { ensureTenantIdentifiers } from '@/lib/tenant-ids'

/**
 * Resolve the deterministic Supabase UUID for the currently active tenant.
 * Returns null when no tenant is selected (e.g., before login).
 */
export async function getActiveTenantSupabaseId(): Promise<string | null> {
    const tenantIdentifier = getActiveTenantId()
    if (!tenantIdentifier) return null
    try {
        const { supabaseId } =
            await ensureTenantIdentifiers(tenantIdentifier)
        return supabaseId
    } catch (error) {
        console.warn('Unable to resolve Supabase tenant ID', error)
        return null
    }
}
