create table public.tenants (
  id uuid not null default gen_random_uuid (),
  slug text not null,
  display_name text null,
  owner_user_id uuid null,
  metadata jsonb null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint tenants_pkey primary key (id),
  constraint tenants_slug_key unique (slug),
  constraint tenants_owner_user_id_fkey foreign KEY (owner_user_id) references auth.users (id)
) TABLESPACE pg_default;