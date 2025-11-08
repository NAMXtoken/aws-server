-- Daily events fact table sourced from GAS payloads
create table public.daily_events (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants (id) on delete cascade,
    ticket_id text,
    event_action text not null,
    event_date date not null,
    occurred_at timestamptz,
    actor text,
    payment_method text,
    total_amount numeric(12, 2),
    subtotal_amount numeric(12, 2),
    tax_amount numeric(12, 2),
    tips_amount numeric(12, 2),
    surcharge_amount numeric(12, 2),
    refund_amount numeric(12, 2),
    void_amount numeric(12, 2),
    items_sold integer,
    tickets_delta integer,
    metadata jsonb,
    payload jsonb,
    created_at timestamptz not null default timezone('utc', now())
);

create index daily_events_tenant_idx on public.daily_events (tenant_id, event_date desc);

-- Shift summaries sourced from GAS payloads
create table public.shift_summaries (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants (id) on delete cascade,
    shift_id text not null,
    opened_at timestamptz,
    closed_at timestamptz,
    opened_by text,
    closed_by text,
    cash_sales numeric(12, 2),
    card_sales numeric(12, 2),
    promptpay_sales numeric(12, 2),
    tickets_count integer,
    items_count integer,
    notes text,
    items_sold jsonb,
    metadata jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint shift_summaries_tenant_shift_key unique (tenant_id, shift_id)
);

create index shift_summaries_tenant_idx on public.shift_summaries (tenant_id, created_at desc);
create index shift_summaries_shift_idx on public.shift_summaries (shift_id);

-- RLS
alter table public.daily_events enable row level security;
alter table public.shift_summaries enable row level security;

create policy "daily_events_crud" on public.daily_events
    for all using (public.is_tenant_member(tenant_id))
    with check (public.is_tenant_member(tenant_id));

create policy "shift_summaries_crud" on public.shift_summaries
    for all using (public.is_tenant_member(tenant_id))
    with check (public.is_tenant_member(tenant_id));
