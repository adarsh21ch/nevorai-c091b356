-- Pixel fire telemetry — captures browser-side fbq events from public funnels/landing pages
-- so we can power: (a) Pixel Health Dashboard, (b) one-click Pixel Verifier.
-- Run in Supabase SQL editor. Idempotent.

create table if not exists public.pixel_fire_log (
  id uuid primary key default gen_random_uuid(),
  pixel_id text,                                   -- the actual pixel that fired (null = platform fallback)
  scope text not null check (scope in ('funnel','landing','platform')),
  resource_id uuid,                                -- funnels.id or landing_pages.id (null for platform)
  owner_id uuid references public.profiles(id) on delete set null,
  event_name text not null,
  success boolean not null default true,
  run_id text,                                     -- correlates a Verifier test (UUID from client)
  is_test boolean not null default false,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pfl_owner_time
  on public.pixel_fire_log(owner_id, created_at desc);
create index if not exists idx_pfl_resource_time
  on public.pixel_fire_log(scope, resource_id, created_at desc);
create index if not exists idx_pfl_run
  on public.pixel_fire_log(run_id) where run_id is not null;

grant select on public.pixel_fire_log to authenticated;
grant all on public.pixel_fire_log to service_role;

alter table public.pixel_fire_log enable row level security;

drop policy if exists "owners read own pixel fires" on public.pixel_fire_log;
create policy "owners read own pixel fires" on public.pixel_fire_log
  for select to authenticated
  using (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- inserts go through the public TanStack route using the service role; no anon policy needed.
