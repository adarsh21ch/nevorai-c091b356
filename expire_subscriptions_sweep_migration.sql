-- ============================================================================
-- Expire subscriptions sweep — permanent fix
-- Any user_subscriptions row whose expires_at has passed is flipped from
-- status='active' to status='expired'. Runs once now, then hourly via pg_cron.
-- Safe to re-run.
-- ============================================================================

-- 1) Sweep existing rows now
UPDATE public.user_subscriptions
SET status = 'expired'
WHERE status = 'active'
  AND expires_at IS NOT NULL
  AND expires_at <= now();

-- 2) Function used by cron (and callable manually)
CREATE OR REPLACE FUNCTION public.sweep_expired_subscriptions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.user_subscriptions
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_expired_subscriptions() FROM public;
GRANT EXECUTE ON FUNCTION public.sweep_expired_subscriptions() TO service_role;

-- 3) Schedule hourly via pg_cron if available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('sweep_expired_subscriptions_hourly')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'sweep_expired_subscriptions_hourly'
    );
    PERFORM cron.schedule(
      'sweep_expired_subscriptions_hourly',
      '0 * * * *',
      $cron$SELECT public.sweep_expired_subscriptions();$cron$
    );
  END IF;
END $$;
