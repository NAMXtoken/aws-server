create table public.shift_summaries (
  id uuid not null default gen_random_uuid (),
  tenant_id uuid not null,
  shift_id text not null,
  opened_at timestamp with time zone null,
  closed_at timestamp with time zone null,
  opened_by text null,
  closed_by text null,
  cash_sales numeric(12, 2) null,
  card_sales numeric(12, 2) null,
  promptpay_sales numeric(12, 2) null,
  tickets_count integer null,
  items_count integer null,
  notes text null,
  items_sold jsonb null,
  metadata jsonb null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint shift_summaries_pkey primary key (id),
  constraint shift_summaries_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE,
  constraint shift_summaries_tenant_shift_key unique (tenant_id, shift_id)
) TABLESPACE pg_default;

create index IF not exists shift_summaries_tenant_idx on public.shift_summaries using btree (tenant_id, created_at desc) TABLESPACE pg_default;

create index IF not exists shift_summaries_shift_idx on public.shift_summaries using btree (shift_id) TABLESPACE pg_default;
