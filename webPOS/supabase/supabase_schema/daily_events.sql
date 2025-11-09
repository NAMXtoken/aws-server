create table public.daily_events (
  id uuid not null default gen_random_uuid (),
  tenant_id uuid not null,
  ticket_id text null,
  event_action text not null,
  event_date date not null,
  occurred_at timestamp with time zone null,
  actor text null,
  payment_method text null,
  total_amount numeric(12, 2) null,
  subtotal_amount numeric(12, 2) null,
  tax_amount numeric(12, 2) null,
  tips_amount numeric(12, 2) null,
  surcharge_amount numeric(12, 2) null,
  refund_amount numeric(12, 2) null,
  void_amount numeric(12, 2) null,
  items_sold integer null,
  tickets_delta integer null,
  metadata jsonb null,
  payload jsonb null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint daily_events_pkey primary key (id),
  constraint daily_events_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists daily_events_tenant_idx on public.daily_events using btree (tenant_id, event_date desc) TABLESPACE pg_default;
