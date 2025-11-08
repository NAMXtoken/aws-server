create table public.ticket_items (
  id uuid not null default gen_random_uuid (),
  ticket_id uuid not null,
  tenant_id uuid not null,
  sku text null,
  name text not null,
  price numeric(12, 2) not null default 0,
  quantity integer not null default 1,
  metadata jsonb null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint ticket_items_pkey primary key (id),
  constraint ticket_items_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE,
  constraint ticket_items_ticket_id_fkey foreign KEY (ticket_id) references tickets (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists ticket_items_ticket_idx on public.ticket_items using btree (ticket_id) TABLESPACE pg_default;

create index IF not exists ticket_items_tenant_idx on public.ticket_items using btree (tenant_id) TABLESPACE pg_default;