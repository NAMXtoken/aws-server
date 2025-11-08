create table public.tickets (
  id uuid not null default gen_random_uuid (),
  tenant_id uuid not null,
  shift_id uuid null,
  status public.ticket_status not null default 'open'::ticket_status,
  opened_at timestamp with time zone not null default timezone ('utc'::text, now()),
  closed_at timestamp with time zone null,
  total numeric(12, 2) not null default 0,
  metadata jsonb null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint tickets_pkey primary key (id),
  constraint tickets_shift_id_fkey foreign KEY (shift_id) references shifts (id) on delete set null,
  constraint tickets_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists tickets_tenant_idx on public.tickets using btree (tenant_id, opened_at desc) TABLESPACE pg_default;

create index IF not exists tickets_shift_idx on public.tickets using btree (shift_id) TABLESPACE pg_default;