create table public.menu_items (
  id uuid not null default gen_random_uuid (),
  tenant_id uuid not null,
  name text not null,
  description text null,
  price numeric(12, 2) not null,
  category text null,
  active boolean not null default true,
  sheet_row_id text null,
  updated_from_sheet_at timestamp with time zone null,
  metadata jsonb null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint menu_items_pkey primary key (id),
  constraint menu_items_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists menu_items_tenant_idx on public.menu_items using btree (tenant_id, active, name) TABLESPACE pg_default;