create table public.shifts (
  id uuid not null default gen_random_uuid (),
  tenant_id uuid not null,
  opened_at timestamp with time zone not null default timezone ('utc'::text, now()),
  closed_at timestamp with time zone null,
  opened_by_member_id uuid null,
  closed_by_member_id uuid null,
  summary jsonb null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint shifts_pkey primary key (id),
  constraint shifts_closed_by_member_id_fkey foreign KEY (closed_by_member_id) references tenant_members (id) on delete set null,
  constraint shifts_opened_by_member_id_fkey foreign KEY (opened_by_member_id) references tenant_members (id) on delete set null,
  constraint shifts_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists shifts_tenant_idx on public.shifts using btree (tenant_id, opened_at desc) TABLESPACE pg_default;