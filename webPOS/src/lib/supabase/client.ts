import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from './types'
import {
    SUPABASE_ANON_KEY,
    SUPABASE_IS_CONFIGURED,
    SUPABASE_URL,
} from './env'

let browserClient: SupabaseClient<Database> | null = null

export function getSupabaseBrowserClient() {
    if (typeof window === 'undefined') {
        throw new Error('Browser client requested on the server')
    }
    if (!SUPABASE_IS_CONFIGURED) {
        throw new Error(
            'Supabase configuration missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
        )
    }
    if (!browserClient) {
        browserClient = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
            auth: {
                persistSession: true,
                storageKey: 'byndpos.supabase.auth',
            },
        })
    }
    return browserClient
}
