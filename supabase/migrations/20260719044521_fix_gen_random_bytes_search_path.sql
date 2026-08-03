-- Fix: SECURITY DEFINER functions with set search_path = public can't see
-- extensions.gen_random_bytes(). Patch the four broken functions in place by
-- replacing the broken call with a core-Postgres equivalent (gen_random_uuid
-- is built-in, no extension needed).
--
-- Safe to re-run.

DO $$
DECLARE
  func_oid oid;
  func_def text;
  fixed_def text;
BEGIN
  FOR func_oid IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'ensure_universal_share_link',
        'profiles_set_connect_token',
        'gen_share_token',
        'ensure_owner_share_link'
      )
  LOOP
    func_def := pg_get_functiondef(func_oid);
    fixed_def := replace(
      func_def,
      'encode(gen_random_bytes(12), ''hex'')',
      'substr(replace(gen_random_uuid()::text, ''-'', ''''), 1, 24)'
    );
    -- also patch the 6-byte variant used by profiles_set_connect_token
    fixed_def := replace(
      fixed_def,
      'encode(gen_random_bytes(6), ''base64'')',
      'substr(replace(gen_random_uuid()::text, ''-'', ''''), 1, 8)'
    );
    EXECUTE fixed_def;
    RAISE NOTICE 'Fixed: %', func_oid;
  END LOOP;
END;
$$;

-- Verify
-- SELECT public.gen_share_token();
