create table public.pager_events (
  id uuid not null default gen_random_uuid (),
  tenant_id uuid not null,
  target_pin text null,
  target_role text null,
  message text not null,
  origin text null,
  sender_member_id uuid null,
  sender_display_name text null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  acknowledged_at timestamp with time zone null,
  acknowledged_by_member_id uuid null,
  metadata jsonb null,
  constraint pager_events_pkey primary key (id),
  constraint pager_events_acknowledged_by_member_id_fkey foreign KEY (acknowledged_by_member_id) references tenant_members (id) on delete set null,
  constraint pager_events_sender_member_id_fkey foreign KEY (sender_member_id) references tenant_members (id) on delete set null,
  constraint pager_events_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists pager_events_tenant_idx on public.pager_events using btree (tenant_id, created_at desc) TABLESPACE pg_default;

create index IF not exists pager_events_target_pin_idx on public.pager_events using btree (tenant_id, target_pin) TABLESPACE pg_default;