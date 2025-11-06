import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from './types'
import {
    SUPABASE_ANON_KEY,
    SUPABASE_IS_CONFIGURED,
    SUPABASE_SERVICE_AVAILABLE,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_URL,
} from './env'

type PublicClient = SupabaseClient<Database, 'public', 'public'>

export function getSupabaseServerClient(): PublicClient {
    if (!SUPABASE_IS_CONFIGURED) {
        throw new Error(
            'Supabase server client requires SUPABASE_URL and SUPABASE_ANON_KEY environment variables.'
        )
    }
    return createClient<Database, 'public', 'public'>(
        SUPABASE_URL!,
        SUPABASE_ANON_KEY!,
        {
            auth: {
                persistSession: false,
                detectSessionInUrl: false,
            },
        }
    )
}

let serviceRoleClient: PublicClient | null = null

export function getSupabaseServiceRoleClient(): PublicClient {
    if (!SUPABASE_SERVICE_AVAILABLE) {
        throw new Error(
            'SUPABASE_SERVICE_ROLE_KEY is required for privileged operations'
        )
    }
    if (!serviceRoleClient) {
        serviceRoleClient = createClient<Database, 'public', 'public'>(
            SUPABASE_URL!,
            SUPABASE_SERVICE_ROLE_KEY!,
            {
                auth: {
                    persistSession: false,
                    detectSessionInUrl: false,
                },
            }
        )
    }
    return serviceRoleClient
}
