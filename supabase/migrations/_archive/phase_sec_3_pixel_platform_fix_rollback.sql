-- Rollback for phase_sec_3 — restores strict trigger, removes admin policy.
-- Leaves the system workspace row (harmless; zero members).

BEGIN;

DROP POLICY IF EXISTS admin_view_system_pixel_fires ON public.pixel_fire_log;

CREATE OR REPLACE FUNCTION public.tg_autofill_workspace_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_payload jsonb := to_jsonb(NEW);
  v_ws uuid;
  v_owner uuid; v_user uuid;
  v_parent record; v_parent_id uuid;
BEGIN
  v_ws := (v_payload->>'workspace_id')::uuid;
  IF v_ws IS NOT NULL THEN RETURN NEW; END IF;
  v_ws := public.current_workspace_id();
  IF v_ws IS NOT NULL THEN NEW.workspace_id := v_ws; RETURN NEW; END IF;

  BEGIN v_owner := (v_payload->>'owner_id')::uuid; EXCEPTION WHEN OTHERS THEN v_owner := NULL; END;
  IF v_owner IS NOT NULL THEN
    v_ws := public.primary_workspace_of(v_owner);
    IF v_ws IS NOT NULL THEN NEW.workspace_id := v_ws; RETURN NEW; END IF;
  END IF;

  BEGIN v_user := (v_payload->>'user_id')::uuid; EXCEPTION WHEN OTHERS THEN v_user := NULL; END;
  IF v_user IS NOT NULL THEN
    v_ws := public.primary_workspace_of(v_user);
    IF v_ws IS NOT NULL THEN NEW.workspace_id := v_ws; RETURN NEW; END IF;
  END IF;

  SELECT parent_table, parent_fk_column INTO v_parent
    FROM public._workspace_parent_map WHERE table_name=TG_TABLE_NAME;
  IF FOUND THEN
    BEGIN v_parent_id := (v_payload->>v_parent.parent_fk_column)::uuid;
    EXCEPTION WHEN OTHERS THEN v_parent_id := NULL; END;
    IF v_parent_id IS NOT NULL THEN
      EXECUTE format('SELECT workspace_id FROM public.%I WHERE id=$1', v_parent.parent_table)
        INTO v_ws USING v_parent_id;
      IF v_ws IS NOT NULL THEN NEW.workspace_id := v_ws; RETURN NEW; END IF;
    END IF;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    v_ws := public.primary_workspace_of(auth.uid());
    IF v_ws IS NOT NULL THEN NEW.workspace_id := v_ws; RETURN NEW; END IF;
  END IF;

  RAISE EXCEPTION 'tg_autofill_workspace_id: cannot resolve workspace_id for table % (no owner/user/parent/session)', TG_TABLE_NAME;
END;
$$;

COMMIT;
