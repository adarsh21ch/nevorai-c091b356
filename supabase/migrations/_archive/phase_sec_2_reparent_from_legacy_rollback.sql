-- Rollback for phase_sec_2 — restores workspace_id from the backup table.

BEGIN;

DO $$
DECLARE r record; v_updated bigint;
BEGIN
  FOR r IN SELECT DISTINCT table_name FROM public._reparent_20260718_backup LOOP
    EXECUTE format(
      'UPDATE public.%I t SET workspace_id = b.old_workspace_id
         FROM public._reparent_20260718_backup b
        WHERE b.table_name=%L AND t.id=b.row_id',
      r.table_name, r.table_name);
    GET DIAGNOSTICS v_updated=ROW_COUNT;
    RAISE NOTICE 'rolled back %: %', r.table_name, v_updated;
  END LOOP;
END $$;

-- Keep the backup table for audit. To drop later:
--   DROP TABLE public._reparent_20260718_backup;

COMMIT;
