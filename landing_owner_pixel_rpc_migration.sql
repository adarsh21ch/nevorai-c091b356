-- Resolves the account-level Meta Pixel ID for a landing-page owner.
-- Returns ONLY meta_pixel_id from profiles (no PII), so it is safe to expose to anon.
-- Used by src/pages/PublicLandingPage.tsx to fall back to the creator's account pixel
-- when a landing page does not override it.

create or replace function public.get_profile_meta_pixel_id(_owner_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select meta_pixel_id
  from public.profiles
  where id = _owner_id
  limit 1
$$;

revoke all on function public.get_profile_meta_pixel_id(uuid) from public;
grant execute on function public.get_profile_meta_pixel_id(uuid) to anon, authenticated, service_role;
