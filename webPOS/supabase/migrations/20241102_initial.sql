-- Enable required extensions
create extension if not exists "pgcrypto";

-- Enums
create type public.tenant_role as enum ('owner', 'manager', 'staff');
create type public.ticket_status as enum ('open', 'closed', 'void');

-- Tenants and membership
create table public.tenants (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique,
    display_name text,
    owner_user_id uuid references auth.users (id),
    metadata jsonb,
    created_at timestamptz not null default timezone('utc', now())
);

create table public.tenant_members (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    role public.tenant_role not null default 'staff',
    display_name text,
    pin text,
    metadata jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (tenant_id, user_id)
);

create index tenant_members_tenant_id_idx on public.tenant_members (tenant_id);
create index tenant_members_user_id_idx on public.tenant_members (user_id);

-- Pager events
create table public.pager_events (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants (id) on delete cascade,
    target_pin text,
    target_role text,
    message text not null,
    origin text,
    sender_member_id uuid references public.tenant_members (id) on delete set null,
    sender_display_name text,
    created_at timestamptz not null default timezone('utc', now()),
    acknowledged_at timestamptz,
    acknowledged_by_member_id uuid references public.tenant_members (id) on delete set null,
    metadata jsonb
);

create index pager_events_tenant_idx on public.pager_events (tenant_id, created_at desc);
create index pager_events_target_pin_idx on public.pager_events (tenant_id, target_pin);

-- Shifts
create table public.shifts (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants (id) on delete cascade,
    opened_at timestamptz not null default timezone('utc', now()),
    closed_at timestamptz,
    opened_by_member_id uuid references public.tenant_members (id) on delete set null,
    closed_by_member_id uuid references public.tenant_members (id) on delete set null,
    summary jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index shifts_tenant_idx on public.shifts (tenant_id, opened_at desc);

-- Tickets
create table public.tickets (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants (id) on delete cascade,
    shift_id uuid references public.shifts (id) on delete set null,
    status public.ticket_status not null default 'open',
    opened_at timestamptz not null default timezone('utc', now()),
    closed_at timestamptz,
    total numeric(12, 2) not null default 0,
    metadata jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index tickets_tenant_idx on public.tickets (tenant_id, opened_at desc);
create index tickets_shift_idx on public.tickets (shift_id);

-- Ticket items
create table public.ticket_items (
    id uuid primary key default gen_random_uuid(),
    ticket_id uuid not null references public.tickets (id) on delete cascade,
    tenant_id uuid not null references public.tenants (id) on delete cascade,
    sku text,
    name text not null,
    price numeric(12, 2) not null default 0,
    quantity integer not null default 1,
    metadata jsonb,
    created_at timestamptz not null default timezone('utc', now())
);

create index ticket_items_ticket_idx on public.ticket_items (ticket_id);
create index ticket_items_tenant_idx on public.ticket_items (tenant_id);

-- Menu items sourced from Sheets
create table public.menu_items (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants (id) on delete cascade,
    name text not null,
    description text,
    price numeric(12, 2) not null,
    category text,
    active boolean not null default true,
    sheet_row_id text,
    updated_from_sheet_at timestamptz,
    metadata jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index menu_items_tenant_idx on public.menu_items (tenant_id, active, name);

-- POS settings hydrated from Sheets
create table public.pos_settings (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null unique references public.tenants (id) on delete cascade,
    settings jsonb not null default '{}'::jsonb,
    sheet_revision text,
    updated_from_sheet_at timestamptz,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

-- Row level security
-- Helper function to gate data by tenant membership (after tables exist)
create or replace function public.is_tenant_member(target_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select case
        when auth.role() = 'service_role' then true
        when auth.uid() is null then false
        else exists(
            select 1
            from public.tenant_members tm
            where tm.tenant_id = target_tenant
              and tm.user_id = auth.uid()
        )
    end;
$$;

alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.pager_events enable row level security;
alter table public.shifts enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_items enable row level security;
alter table public.menu_items enable row level security;
alter table public.pos_settings enable row level security;

create policy "tenants_read" on public.tenants
    for select using (public.is_tenant_member(id));

create policy "tenants_update" on public.tenants
    for update using (public.is_tenant_member(id))
    with check (public.is_tenant_member(id));

create policy "tenants_insert" on public.tenants
    for insert with check (auth.role() = 'service_role');

create policy "tenants_delete" on public.tenants
    for delete using (auth.role() = 'service_role');

create policy "tenant_members_crud" on public.tenant_members
    for all using (public.is_tenant_member(tenant_id))
    with check (public.is_tenant_member(tenant_id));

create policy "pager_events_crud" on public.pager_events
    for all using (public.is_tenant_member(tenant_id))
    with check (public.is_tenant_member(tenant_id));

create policy "shifts_crud" on public.shifts
    for all using (public.is_tenant_member(tenant_id))
    with check (public.is_tenant_member(tenant_id));

create policy "tickets_crud" on public.tickets
    for all using (public.is_tenant_member(tenant_id))
    with check (public.is_tenant_member(tenant_id));

create policy "ticket_items_crud" on public.ticket_items
    for all using (public.is_tenant_member(tenant_id))
    with check (public.is_tenant_member(tenant_id));

create policy "menu_items_read" on public.menu_items
    for select using (public.is_tenant_member(tenant_id));

create policy "menu_items_mutate" on public.menu_items
    for insert with check (public.is_tenant_member(tenant_id));

create policy "menu_items_update" on public.menu_items
    for update using (public.is_tenant_member(tenant_id))
    with check (public.is_tenant_member(tenant_id));

create policy "menu_items_delete" on public.menu_items
    for delete using (public.is_tenant_member(tenant_id));

create policy "pos_settings_crud" on public.pos_settings
    for all using (public.is_tenant_member(tenant_id))
    with check (public.is_tenant_member(tenant_id));
