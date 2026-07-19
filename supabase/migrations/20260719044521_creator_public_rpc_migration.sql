-- Nevorai — Public creator accessor (run in Supabase SQL editor)
-- Idempotent. Creates a SECURITY DEFINER RPC that exposes only safe creator
-- fields to anon/authenticated. This is more reliable than a view because it
-- bypasses RLS on profiles in a controlled way and projects nothing sensitive.

-- Make sure base columns exist (no-op if previous migration already ran).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS username     text,
  ADD COLUMN IF NOT EXISTS cta_label    text,
  ADD COLUMN IF NOT EXISTS cta_url      text,
  ADD COLUMN IF NOT EXISTS is_verified  boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_creator_public(_user_id uuid)
RETURNS TABLE (
  id            uuid,
  display_name  text,
  avatar_url    text,
  is_verified   boolean,
  username      text,
  cta_label     text,
  cta_url       text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    COALESCE(
      NULLIF(p.display_name, ''),
      NULLIF(p.full_name, ''),
      NULLIF(split_part(p.email, '@', 1), ''),
      'Creator'
    ) AS display_name,
    p.avatar_url,
    COALESCE(p.is_verified, false) AS is_verified,
    p.username,
    p.cta_label,
    p.cta_url
  FROM public.profiles p
  WHERE p.id = _user_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_creator_public(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_creator_public(uuid) TO anon, authenticated;

-- Also re-publish the safe view so either accessor works.
CREATE OR REPLACE VIEW public.profiles_public AS
  SELECT
    id,
    COALESCE(
      NULLIF(display_name, ''),
      NULLIF(full_name, ''),
      NULLIF(split_part(email, '@', 1), ''),
      'Creator'
    ) AS display_name,
    avatar_url,
    COALESCE(is_verified, false) AS is_verified,
    username,
    cta_label,
    cta_url
  FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;
