# Supabase Integration

This project now targets Supabase as the primary source of truth for
authentication, tenant context, pager events, and historical POS data. Google
Sheets remains the lightweight, user-editable surface for menu items and select
tenant configuration; periodic ingestion jobs will hydrate Supabase tables from
those sheets.

## Environment variables

Configure the following variables (for local development add them to
`.env.local`). Never ship the service-role key to the browser. Pull the latest
values from secure storage with `vercel env pull` or set them manually:

```
NEXT_PUBLIC_SUPABASE_URL=<https://your-project-ref.supabase.co>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
SUPABASE_JWT_SECRET=<jwt secret>
SUPABASE_DB_PASSWORD=<postgres password>
SUPABASE_SSL_CERT_PATH=<optional cert path>
```

Additional secrets (Firebase, Google, etc.) continue to live alongside these in
`.env.local`/Vercel env variables. Public, read-only values (e.g. Supabase URL)
may also be stored in Edge Config for quicker edge access, but do not copy the
service-role key or other privileged credentials there.

## Local tooling

- Install the Supabase CLI (`pnpm dlx supabase@latest init`) if you plan to run
  the stack locally.
- Migrations live in `supabase/migrations`. Apply them via
  `pnpm supabase db push` (script TBD).

## Data model (high level)

- `tenants`, `tenant_members`, `auth.users`: core account structure.
- `pager_events`: real-time staff alerts synced with Firebase push.
- `shifts`, `tickets`, `ticket_items`, `inventory_events`: transactional POS
  data.
- `menu_items`, `categories`, `pos_settings`: hydrated from Sheets.

Each table enforces row-level security keyed by `tenant_id`, except public
reference data.
