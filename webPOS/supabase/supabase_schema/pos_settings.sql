create table public.pos_settings (
  id uuid not null default gen_random_uuid (),
  tenant_id uuid not null,
  settings jsonb not null default '{}'::jsonb,
  sheet_revision text null,
  updated_from_sheet_at timestamp with time zone null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint pos_settings_pkey primary key (id),
  constraint pos_settings_tenant_id_key unique (tenant_id),
  constraint pos_settings_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;