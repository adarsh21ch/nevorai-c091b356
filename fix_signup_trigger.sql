-- =====================================================================
-- P0 FIX: "Database error saving new user" on every signup
-- =====================================================================
-- Root cause: after Phase 3 tightened tg_autofill_workspace_id() to
-- RAISE EXCEPTION when it can't resolve a workspace, signup broke.
--
-- Trigger firing order on auth.users (alphabetical):
--   1. on_auth_user_created         -> handle_new_user()
--        INSERTs into public.profiles  (NO workspace_id supplied)
--        BEFORE INSERT autofill on profiles fires. profiles has no
--        owner_id / user_id column, no parent map, and auth.uid() is
--        NULL during signup -> RAISE EXCEPTION -> whole tx rolls back.
--   2. tg_create_personal_workspace -> never runs.
--
-- Fix: consolidate both triggers into ONE handle_new_user() that
--      (a) creates the personal workspace + owner membership, then
--      (b) inserts the profile with workspace_id explicitly set.
--      user_subscriptions insert (via on_profile_created) then finds
--      the workspace via primary_workspace_of(user_id). No silent
--      exception swallowing -- if anything throws, we know about it.
--
-- Idempotent. Safe to re-run.
-- =====================================================================

BEGIN;

-- Retire the separate workspace-creation trigger; handle_new_user owns it now.
DROP TRIGGER IF EXISTS tg_create_personal_workspace ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base text;
  v_slug text;
  v_name text;
  v_full text;
  v_n    int := 1;
  v_ws   uuid;
BEGIN
  -- ---- 1. Ensure the user has a personal workspace ------------------
  SELECT wm.workspace_id INTO v_ws
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
   WHERE wm.user_id = NEW.id
     AND wm.role IN ('owner','admin')
     AND w.slug <> 'legacy'
   ORDER BY wm.created_at NULLS LAST
   LIMIT 1;

  IF v_ws IS NULL THEN
    v_full := COALESCE(NEW.raw_user_meta_data ->> 'full_name', '');

    -- Slug: email local-part -> user-<short>
    v_base := public.slugify(split_part(COALESCE(NEW.email, ''), '@', 1));
    IF v_base IS NULL OR length(v_base) < 2 THEN
      v_base := 'user-' || substr(NEW.id::text, 1, 8);
    END IF;

    v_name := COALESCE(NULLIF(v_full, ''), v_base);

    v_slug := v_base;
    WHILE EXISTS (SELECT 1 FROM public.workspaces WHERE slug = v_slug) LOOP
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n;
    END LOOP;

    INSERT INTO public.workspaces(slug, name, status, plan)
    VALUES (v_slug, v_name, 'active', 'free')
    RETURNING id INTO v_ws;

    INSERT INTO public.workspace_members(workspace_id, user_id, role)
    VALUES (v_ws, NEW.id, 'owner')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ---- 2. Insert profile with explicit workspace_id -----------------
  INSERT INTO public.profiles (
    id, full_name, email, phone,
    trial_start_date, subscription_status, workspace_id
  ) VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'phone', NEW.phone),
    now(),
    'trial',
    v_ws
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Make sure the trigger is bound (recreate cleanly).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMIT;

-- Force PostgREST to reload.
NOTIFY pgrst, 'reload schema';
