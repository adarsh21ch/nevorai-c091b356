-- =========================================================================
-- Content Materials (downloadable resources) for funnels, videos,
-- landing pages, and live sessions.
-- Run this in the Supabase SQL editor. Storage bucket must be created via
-- the Storage UI (or `supabase storage`) — see instructions at bottom.
-- =========================================================================

create table if not exists public.content_materials (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  entity_type  text not null check (entity_type in
                ('funnel','funnel_step','landing_page','live_session','video')),
  entity_id    uuid not null,
  title        text not null,
  file_url     text not null,
  file_name    text,
  file_size    bigint,
  mime_type    text,
  position     int  not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists content_materials_entity_idx
  on public.content_materials (entity_type, entity_id, position);
create index if not exists content_materials_owner_idx
  on public.content_materials (owner_id);

grant select on public.content_materials to anon, authenticated;
grant insert, update, delete on public.content_materials to authenticated;
grant all on public.content_materials to service_role;

alter table public.content_materials enable row level security;

-- Public read: leads/visitors viewing public funnels & landing pages need
-- to see the materials list. Files themselves live in a public bucket.
drop policy if exists "Materials are viewable by everyone" on public.content_materials;
create policy "Materials are viewable by everyone"
  on public.content_materials for select
  using (true);

-- Owner-only write
drop policy if exists "Owners can insert their materials" on public.content_materials;
create policy "Owners can insert their materials"
  on public.content_materials for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "Owners can update their materials" on public.content_materials;
create policy "Owners can update their materials"
  on public.content_materials for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "Owners can delete their materials" on public.content_materials;
create policy "Owners can delete their materials"
  on public.content_materials for delete
  to authenticated
  using (auth.uid() = owner_id);

-- =========================================================================
-- Storage bucket: create a PUBLIC bucket named `content-materials`
-- (Storage UI → New bucket → public).
-- Then apply these policies on storage.objects for that bucket:
-- =========================================================================

-- Anyone can read files (public bucket).
drop policy if exists "Public read content-materials" on storage.objects;
create policy "Public read content-materials"
  on storage.objects for select
  using (bucket_id = 'content-materials');

-- Authenticated users can upload into their own folder (first path segment
-- must equal their auth.uid()).
drop policy if exists "Auth upload to own folder content-materials" on storage.objects;
create policy "Auth upload to own folder content-materials"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'content-materials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Auth update own files content-materials" on storage.objects;
create policy "Auth update own files content-materials"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'content-materials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Auth delete own files content-materials" on storage.objects;
create policy "Auth delete own files content-materials"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'content-materials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
