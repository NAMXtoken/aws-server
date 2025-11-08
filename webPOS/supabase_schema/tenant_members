create table public.tenant_members (
  id uuid not null default gen_random_uuid (),
  tenant_id uuid not null,
  user_id uuid not null,
  role public.tenant_role not null default 'staff'::tenant_role,
  display_name text null,
  pin text null,
  metadata jsonb null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint tenant_members_pkey primary key (id),
  constraint tenant_members_tenant_id_user_id_key unique (tenant_id, user_id),
  constraint tenant_members_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE,
  constraint tenant_members_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists tenant_members_tenant_id_idx on public.tenant_members using btree (tenant_id) TABLESPACE pg_default;

create index IF not exists tenant_members_user_id_idx on public.tenant_members using btree (user_id) TABLESPACE pg_default;