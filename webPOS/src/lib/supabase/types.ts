export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Database = {
    public: {
        Tables: {
            tenants: {
                Row: {
                    id: string
                    slug: string
                    display_name: string | null
                    created_at: string
                    owner_user_id: string | null
                    metadata: Json | null
                }
                Insert: {
                    id?: string
                    slug: string
                    display_name?: string | null
                    created_at?: string
                    owner_user_id?: string | null
                    metadata?: Json | null
                }
                Update: Partial<Database['public']['Tables']['tenants']['Insert']>
                Relationships: []
            }
            tenant_members: {
                Row: {
                    id: string
                    tenant_id: string
                    user_id: string
                    role: 'owner' | 'manager' | 'staff'
                    display_name: string | null
                    pin: string | null
                    created_at: string
                    updated_at: string
                    metadata: Json | null
                }
                Insert: {
                    id?: string
                    tenant_id: string
                    user_id: string
                    role?: 'owner' | 'manager' | 'staff'
                    display_name?: string | null
                    pin?: string | null
                    created_at?: string
                    updated_at?: string
                    metadata?: Json | null
                }
                Update: Partial<
                    Database['public']['Tables']['tenant_members']['Insert']
                >
                Relationships: [
                    {
                        foreignKeyName: 'tenant_members_tenant_id_fkey'
                        columns: ['tenant_id']
                        referencedRelation: 'tenants'
                        referencedColumns: ['id']
                    }
                ]
            }
            pager_events: {
                Row: {
                    id: string
                    tenant_id: string
                    target_pin: string | null
                    target_role: string | null
                    message: string
                    origin: string | null
                    sender_user_id: string | null
                    sender_display_name: string | null
                    created_at: string
                    acknowledged_at: string | null
                    acknowledged_by: string | null
                    metadata: Json | null
                }
                Insert: {
                    id?: string
                    tenant_id: string
                    target_pin?: string | null
                    target_role?: string | null
                    message: string
                    origin?: string | null
                    sender_user_id?: string | null
                    sender_display_name?: string | null
                    created_at?: string
                    acknowledged_at?: string | null
                    acknowledged_by?: string | null
                    metadata?: Json | null
                }
                Update: Partial<
                    Database['public']['Tables']['pager_events']['Insert']
                >
                Relationships: [
                    {
                        foreignKeyName: 'pager_events_tenant_id_fkey'
                        columns: ['tenant_id']
                        referencedRelation: 'tenants'
                        referencedColumns: ['id']
                    }
                ]
            }
            shifts: {
                Row: {
                    id: string
                    tenant_id: string
                    opened_at: string
                    closed_at: string | null
                    opened_by_member_id: string | null
                    closed_by_member_id: string | null
                    summary: Json | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    tenant_id: string
                    opened_at?: string
                    closed_at?: string | null
                    opened_by_member_id?: string | null
                    closed_by_member_id?: string | null
                    summary?: Json | null
                    created_at?: string
                    updated_at?: string
                }
                Update: Partial<Database['public']['Tables']['shifts']['Insert']>
                Relationships: [
                    {
                        foreignKeyName: 'shifts_tenant_id_fkey'
                        columns: ['tenant_id']
                        referencedRelation: 'tenants'
                        referencedColumns: ['id']
                    }
                ]
            }
            tickets: {
                Row: {
                    id: string
                    tenant_id: string
                    shift_id: string | null
                    status: 'open' | 'closed' | 'void'
                    opened_at: string
                    closed_at: string | null
                    total: number
                    metadata: Json | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    tenant_id: string
                    shift_id?: string | null
                    status?: 'open' | 'closed' | 'void'
                    opened_at?: string
                    closed_at?: string | null
                    total?: number
                    metadata?: Json | null
                    created_at?: string
                    updated_at?: string
                }
                Update: Partial<
                    Database['public']['Tables']['tickets']['Insert']
                >
                Relationships: [
                    {
                        foreignKeyName: 'tickets_shift_id_fkey'
                        columns: ['shift_id']
                        referencedRelation: 'shifts'
                        referencedColumns: ['id']
                    },
                    {
                        foreignKeyName: 'tickets_tenant_id_fkey'
                        columns: ['tenant_id']
                        referencedRelation: 'tenants'
                        referencedColumns: ['id']
                    }
                ]
            }
            ticket_items: {
                Row: {
                    id: string
                    ticket_id: string
                    tenant_id: string
                    sku: string | null
                    name: string
                    price: number
                    quantity: number
                    metadata: Json | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    ticket_id: string
                    tenant_id: string
                    sku?: string | null
                    name: string
                    price: number
                    quantity?: number
                    metadata?: Json | null
                    created_at?: string
                }
                Update: Partial<
                    Database['public']['Tables']['ticket_items']['Insert']
                >
                Relationships: [
                    {
                        foreignKeyName: 'ticket_items_ticket_id_fkey'
                        columns: ['ticket_id']
                        referencedRelation: 'tickets'
                        referencedColumns: ['id']
                    },
                    {
                        foreignKeyName: 'ticket_items_tenant_id_fkey'
                        columns: ['tenant_id']
                        referencedRelation: 'tenants'
                        referencedColumns: ['id']
                    }
                ]
            }
            daily_events: {
                Row: {
                    id: string
                    tenant_id: string
                    ticket_id: string | null
                    event_action: string
                    event_date: string
                    occurred_at: string | null
                    actor: string | null
                    payment_method: string | null
                    total_amount: number | null
                    subtotal_amount: number | null
                    tax_amount: number | null
                    tips_amount: number | null
                    surcharge_amount: number | null
                    refund_amount: number | null
                    void_amount: number | null
                    items_sold: number | null
                    tickets_delta: number | null
                    metadata: Json | null
                    payload: Json | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    tenant_id: string
                    ticket_id?: string | null
                    event_action: string
                    event_date: string
                    occurred_at?: string | null
                    actor?: string | null
                    payment_method?: string | null
                    total_amount?: number | null
                    subtotal_amount?: number | null
                    tax_amount?: number | null
                    tips_amount?: number | null
                    surcharge_amount?: number | null
                    refund_amount?: number | null
                    void_amount?: number | null
                    items_sold?: number | null
                    tickets_delta?: number | null
                    metadata?: Json | null
                    payload?: Json | null
                    created_at?: string
                }
                Update: Partial<
                    Database['public']['Tables']['daily_events']['Insert']
                >
                Relationships: [
                    {
                        foreignKeyName: 'daily_events_tenant_id_fkey'
                        columns: ['tenant_id']
                        referencedRelation: 'tenants'
                        referencedColumns: ['id']
                    }
                ]
            }
            shift_summaries: {
                Row: {
                    id: string
                    tenant_id: string
                    shift_id: string
                    opened_at: string | null
                    closed_at: string | null
                    opened_by: string | null
                    closed_by: string | null
                    cash_sales: number | null
                    card_sales: number | null
                    promptpay_sales: number | null
                    tickets_count: number | null
                    items_count: number | null
                    notes: string | null
                    items_sold: Json | null
                    metadata: Json | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    tenant_id: string
                    shift_id: string
                    opened_at?: string | null
                    closed_at?: string | null
                    opened_by?: string | null
                    closed_by?: string | null
                    cash_sales?: number | null
                    card_sales?: number | null
                    promptpay_sales?: number | null
                    tickets_count?: number | null
                    items_count?: number | null
                    notes?: string | null
                    items_sold?: Json | null
                    metadata?: Json | null
                    created_at?: string
                    updated_at?: string
                }
                Update: Partial<
                    Database['public']['Tables']['shift_summaries']['Insert']
                >
                Relationships: [
                    {
                        foreignKeyName: 'shift_summaries_tenant_id_fkey'
                        columns: ['tenant_id']
                        referencedRelation: 'tenants'
                        referencedColumns: ['id']
                    }
                ]
            }
            menu_items: {
                Row: {
                    id: string
                    tenant_id: string
                    name: string
                    description: string | null
                    price: number
                    category: string | null
                    active: boolean
                    sheet_row_id: string | null
                    updated_from_sheet_at: string | null
                    created_at: string
                    updated_at: string
                    metadata: Json | null
                }
                Insert: {
                    id?: string
                    tenant_id: string
                    name: string
                    description?: string | null
                    price: number
                    category?: string | null
                    active?: boolean
                    sheet_row_id?: string | null
                    updated_from_sheet_at?: string | null
                    created_at?: string
                    updated_at?: string
                    metadata?: Json | null
                }
                Update: Partial<
                    Database['public']['Tables']['menu_items']['Insert']
                >
                Relationships: [
                    {
                        foreignKeyName: 'menu_items_tenant_id_fkey'
                        columns: ['tenant_id']
                        referencedRelation: 'tenants'
                        referencedColumns: ['id']
                    }
                ]
            }
            pos_settings: {
                Row: {
                    id: string
                    tenant_id: string
                    settings: Json
                    sheet_revision: string | null
                    updated_from_sheet_at: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    tenant_id: string
                    settings?: Json
                    sheet_revision?: string | null
                    updated_from_sheet_at?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: Partial<
                    Database['public']['Tables']['pos_settings']['Insert']
                >
                Relationships: [
                    {
                        foreignKeyName: 'pos_settings_tenant_id_fkey'
                        columns: ['tenant_id']
                        referencedRelation: 'tenants'
                        referencedColumns: ['id']
                    }
                ]
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            [_ in never]: never
        }
        Enums: {
            [_ in never]: never
        }
    }
}
