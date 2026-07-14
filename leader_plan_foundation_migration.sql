-- ============================================================================
-- Leader Plan / Subscription Rebuild — FOUNDATION migration
-- Run in Supabase SQL Editor. Idempotent (safe to re-run).
--
-- What this ships:
--   1. New columns on `subscription_plans` (admin-editable everything)
--   2. New `app_settings` keys for trial/grace/copy
--   3. New `team_members` table (Leader plan sub-accounts)
--   4. New `whatsapp_monthly_usage` table (per-user monthly counter)
--   5. `get_effective_access(uuid)` RPC — single source of truth for gating
--   6. Migrates all current 'free' users to a fresh 7-day trial
--   7. Renames plan display_name: basic → Starter, pro → Growth
--   8. Inserts the Leader plan row (₹1,499/mo, ₹14,990/yr, 5 members)
--
-- SAFE by design: DB slugs (plan_name) are NEVER changed — only display_name.
-- ============================================================================


-- ─── 1. Extend subscription_plans with new admin-editable fields ─────────────
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS badge_text                   text,
  ADD COLUMN IF NOT EXISTS accent_color                 text,
  ADD COLUMN IF NOT EXISTS description                  text,
  ADD COLUMN IF NOT EXISTS is_visible                   boolean DEFAULT true,   -- show on public pricing page
  ADD COLUMN IF NOT EXISTS is_purchasable               boolean DEFAULT true,   -- allow new signups to buy
  ADD COLUMN IF NOT EXISTS whatsapp_monthly_cap         integer DEFAULT 0,      -- -1 = unlimited, 0 = disabled
  ADD COLUMN IF NOT EXISTS whatsapp_templates_level     text    DEFAULT 'none', -- none|basic|full
  ADD COLUMN IF NOT EXISTS nev_ai_monthly_quota         integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS features_jsonb               jsonb   DEFAULT '[]',   -- ordered bullets for pricing card
  ADD COLUMN IF NOT EXISTS yearly_discount_label        text;

COMMENT ON COLUMN public.subscription_plans.whatsapp_monthly_cap IS
  'Monthly WhatsApp automation cap. -1 = unlimited, 0 = feature disabled, N = allow N/month.';
COMMENT ON COLUMN public.subscription_plans.is_visible IS
  'Show plan card on public pricing page. Admin can hide legacy plans without deleting.';


-- ─── 2. New app_settings keys (idempotent seed) ──────────────────────────────
INSERT INTO public.app_settings (key, value) VALUES
  ('trial_enabled',          'true'),
  ('trial_days',             '7'),
  ('trial_plan_slug',        'pro'),        -- trial mirrors this plan's features
  ('access_grace_days',      '3'),          -- days after paid plan lapses before block
  ('prospect_gate_title',    'Access limit reached'),
  ('prospect_gate_message',  'This content is temporarily paused because the creator''s current plan limit has ended. Please contact them and request an upgrade — access will be restored instantly once their plan is renewed.'),
  ('upgrade_banner_title',   'Your access has ended'),
  ('upgrade_banner_body',    'Upgrade now to reactivate your shared videos and continue serving your prospects.')
ON CONFLICT (key) DO NOTHING;


-- ─── 3. Team/Leader members table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_at   timestamptz DEFAULT now(),
  accepted_at  timestamptz,
  status       text DEFAULT 'pending' CHECK (status IN ('pending','active','removed')),
  invite_email text,
  UNIQUE (leader_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_leader ON public.team_members(leader_id);
CREATE INDEX IF NOT EXISTS idx_team_members_member ON public.team_members(member_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leader sees own team" ON public.team_members;
CREATE POLICY "Leader sees own team"
  ON public.team_members FOR SELECT TO authenticated
  USING (leader_id = auth.uid() OR member_id = auth.uid());

DROP POLICY IF EXISTS "Leader manages own team" ON public.team_members;
CREATE POLICY "Leader manages own team"
  ON public.team_members FOR INSERT TO authenticated
  WITH CHECK (leader_id = auth.uid());

DROP POLICY IF EXISTS "Leader updates own team" ON public.team_members;
CREATE POLICY "Leader updates own team"
  ON public.team_members FOR UPDATE TO authenticated
  USING (leader_id = auth.uid() OR member_id = auth.uid())
  WITH CHECK (leader_id = auth.uid() OR member_id = auth.uid());

DROP POLICY IF EXISTS "Leader removes own team" ON public.team_members;
CREATE POLICY "Leader removes own team"
  ON public.team_members FOR DELETE TO authenticated
  USING (leader_id = auth.uid());


-- ─── 4. WhatsApp monthly usage counter ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_monthly_usage (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_ym   text NOT NULL,  -- 'YYYY-MM'
  sent_count  integer NOT NULL DEFAULT 0,
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, period_ym)
);

CREATE INDEX IF NOT EXISTS idx_wa_usage_user_period ON public.whatsapp_monthly_usage(user_id, period_ym);

GRANT SELECT ON public.whatsapp_monthly_usage TO authenticated;
GRANT ALL    ON public.whatsapp_monthly_usage TO service_role;

ALTER TABLE public.whatsapp_monthly_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User reads own wa usage" ON public.whatsapp_monthly_usage;
CREATE POLICY "User reads own wa usage"
  ON public.whatsapp_monthly_usage FOR SELECT TO authenticated
  USING (user_id = auth.uid());


-- ─── 5. get_effective_access RPC — single source of truth ────────────────────
-- Returns a JSON blob describing the user's effective plan + gating state.
-- Called by app code, edge functions, and prospect-side gates.
CREATE OR REPLACE FUNCTION public.get_effective_access(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub            record;
  v_leader_sub     record;
  v_leader_id      uuid;
  v_profile        record;
  v_trial_enabled  boolean;
  v_trial_days     int;
  v_trial_plan     text;
  v_grace_days     int;
  v_now            timestamptz := now();
  v_trial_ends     timestamptz;
  v_grace_ends     timestamptz;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('state','blocked','source','none','plan_slug',null);
  END IF;

  -- Load settings (with sensible defaults)
  SELECT COALESCE((SELECT value FROM app_settings WHERE key='trial_enabled'), 'true')  = 'true' INTO v_trial_enabled;
  SELECT COALESCE(NULLIF((SELECT value FROM app_settings WHERE key='trial_days'),'')::int, 7)     INTO v_trial_days;
  SELECT COALESCE(NULLIF((SELECT value FROM app_settings WHERE key='trial_plan_slug'),''), 'pro') INTO v_trial_plan;
  SELECT COALESCE(NULLIF((SELECT value FROM app_settings WHERE key='access_grace_days'),'')::int, 3) INTO v_grace_days;

  -- 1. Does user have their OWN active paid subscription?
  SELECT tier, status, billing_type, expires_at
    INTO v_sub
    FROM user_subscriptions
   WHERE user_id = _user_id
     AND status IN ('active','payment_failed')
     AND tier IN ('basic','pro','starter','growth','leader')
   ORDER BY created_at DESC
   LIMIT 1;

  IF FOUND AND v_sub.status = 'active'
     AND (v_sub.expires_at IS NULL OR v_sub.expires_at > v_now)
  THEN
    RETURN jsonb_build_object(
      'state', 'active',
      'source', 'self',
      'plan_slug', v_sub.tier,
      'expires_at', v_sub.expires_at,
      'leader_id', NULL
    );
  END IF;

  -- 1b. Own paid sub in grace (expired < grace window ago)
  IF FOUND AND v_sub.expires_at IS NOT NULL
     AND v_sub.expires_at <= v_now
     AND v_sub.expires_at + (v_grace_days || ' days')::interval > v_now
  THEN
    RETURN jsonb_build_object(
      'state', 'grace',
      'source', 'self',
      'plan_slug', v_sub.tier,
      'expires_at', v_sub.expires_at,
      'grace_ends_at', v_sub.expires_at + (v_grace_days || ' days')::interval,
      'leader_id', NULL
    );
  END IF;

  -- 2. Is user a Leader-plan sub-member? Inherit leader's state (capped at starter features)
  SELECT leader_id INTO v_leader_id
    FROM team_members
   WHERE member_id = _user_id
     AND status = 'active'
   LIMIT 1;

  IF v_leader_id IS NOT NULL THEN
    SELECT tier, status, expires_at
      INTO v_leader_sub
      FROM user_subscriptions
     WHERE user_id = v_leader_id
       AND status = 'active'
       AND tier = 'leader'
       AND (expires_at IS NULL OR expires_at > v_now)
     ORDER BY created_at DESC
     LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'state', 'active',
        'source', 'team',
        'plan_slug', 'starter',        -- members always resolve to Starter feature level
        'leader_id', v_leader_id,
        'leader_plan', 'leader',
        'expires_at', v_leader_sub.expires_at
      );
    END IF;
    -- Leader lapsed → member goes straight to blocked (no separate grace)
    RETURN jsonb_build_object(
      'state','blocked','source','team','plan_slug','starter','leader_id',v_leader_id
    );
  END IF;

  -- 3. Trial path — check profile.trial_start_date
  SELECT trial_start_date, subscription_status
    INTO v_profile
    FROM profiles
   WHERE id = _user_id;

  IF v_trial_enabled AND v_profile.trial_start_date IS NOT NULL THEN
    v_trial_ends := v_profile.trial_start_date + (v_trial_days || ' days')::interval;
    IF v_trial_ends > v_now THEN
      RETURN jsonb_build_object(
        'state', 'trial',
        'source', 'self',
        'plan_slug', v_trial_plan,
        'expires_at', v_trial_ends,
        'trial_ends_at', v_trial_ends,
        'leader_id', NULL
      );
    END IF;
  END IF;

  -- 4. Nothing else applies → blocked
  RETURN jsonb_build_object(
    'state', 'blocked',
    'source', 'self',
    'plan_slug', NULL,
    'leader_id', NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_effective_access(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_effective_access(uuid) TO authenticated, service_role;


-- ─── 6. Rebuild the public-side "is owner active" RPC on top of the new one ──
CREATE OR REPLACE FUNCTION public.is_owner_plan_active(_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (public.get_effective_access(_owner) ->> 'state') IN ('active','trial','grace');
$$;

REVOKE ALL ON FUNCTION public.is_owner_plan_active(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_owner_plan_active(uuid) TO anon, authenticated, service_role;


-- ─── 7. Rename display names (DB slugs unchanged) ────────────────────────────
UPDATE public.subscription_plans SET display_name = 'Starter', badge_text = NULL             WHERE plan_name = 'basic';
UPDATE public.subscription_plans SET display_name = 'Growth',  badge_text = 'Most Popular'   WHERE plan_name = 'pro';

-- Hide 'free' plan from public pricing (do NOT delete — keeps FK integrity for legacy rows)
UPDATE public.subscription_plans
   SET is_visible = false,
       is_purchasable = false,
       is_enabled = false
 WHERE plan_name = 'free';


-- ─── 8. Insert the Leader plan (₹1,499/mo, ₹14,990/yr, 5 sub-members) ────────
INSERT INTO public.subscription_plans (
  plan_name, display_name, description, badge_text, display_order,
  is_enabled, is_visible, is_purchasable,
  max_funnels, max_landing_pages, max_live_sessions, max_team_members, max_storage_mb,
  view_limit_mode, monthly_views, daily_view_limit,
  feature_funnel_creation, feature_lead_capture, feature_video_upload, feature_video_sharing,
  feature_landing_pages, feature_go_live, feature_whatsapp_automation, feature_smart_reminders,
  feature_analytics, feature_advanced_analytics, feature_prospect_analytics, feature_insights,
  multilevel_funnel_enabled, feature_team_analytics, feature_custom_branding, feature_priority_support,
  feature_youtube_import,
  whatsapp_monthly_cap, whatsapp_templates_level, nev_ai_monthly_quota,
  yearly_validity_days
) VALUES (
  'leader', 'Leader', 'For leaders building their downline', 'Best for Teams', 40,
  true, true, true,
  -1, -1, -1, 5, 25600,        -- unlimited funnels/landing/live, 5 members, 25 GB
  'monthly', -1, -1,           -- no view limits
  true, true, true, true,
  true, true, true, true,
  true, true, true, true,
  true, true, true, true,
  true,
  -1, 'full', 500,             -- unlimited WA, full templates, generous Nev AI
  365
)
ON CONFLICT (plan_name) DO UPDATE SET
  display_name           = EXCLUDED.display_name,
  description            = EXCLUDED.description,
  badge_text             = EXCLUDED.badge_text,
  is_visible             = EXCLUDED.is_visible,
  is_purchasable         = EXCLUDED.is_purchasable,
  max_team_members       = EXCLUDED.max_team_members,
  whatsapp_monthly_cap   = EXCLUDED.whatsapp_monthly_cap,
  whatsapp_templates_level = EXCLUDED.whatsapp_templates_level;


-- ─── 9. Configure Starter (basic) and Growth (pro) caps per new plan matrix ──
-- Starter: 5 funnels, 1 landing, no live, no WhatsApp automation, 2 GB
UPDATE public.subscription_plans SET
  max_funnels = 5,
  max_landing_pages = 1,
  max_live_sessions = 0,
  max_storage_mb = 2048,
  view_limit_mode = 'monthly',
  monthly_views = -1,
  daily_view_limit = -1,
  feature_go_live = false,
  feature_whatsapp_automation = false,
  whatsapp_monthly_cap = 0,
  whatsapp_templates_level = 'none'
WHERE plan_name = 'basic';

-- Growth: unlimited everything, WhatsApp automation w/ 500/mo cap, basic templates, 10 GB
UPDATE public.subscription_plans SET
  max_funnels = -1,
  max_landing_pages = -1,
  max_live_sessions = -1,
  max_storage_mb = 10240,
  view_limit_mode = 'monthly',
  monthly_views = -1,
  daily_view_limit = -1,
  feature_go_live = true,
  feature_whatsapp_automation = true,
  whatsapp_monthly_cap = 500,
  whatsapp_templates_level = 'basic'
WHERE plan_name = 'pro';


-- ─── 10. Ship-day migration: current 'free' users → fresh 7-day trial ────────
UPDATE public.profiles
   SET subscription_status = 'trial',
       trial_start_date    = now()
 WHERE (subscription_status IS NULL OR subscription_status IN ('free',''))
   AND NOT EXISTS (
     SELECT 1 FROM public.user_subscriptions us
      WHERE us.user_id = profiles.id
        AND us.status = 'active'
        AND us.tier IN ('basic','pro','starter','growth','leader')
   );


-- ─── 11. Kill the old free-access admin toggle (obsolete) ────────────────────
DELETE FROM public.app_settings
 WHERE key IN ('free_access_enabled','free_access_grace_days','free_access_disabled_at');


-- ─── Done. Verify with:
--   SELECT plan_name, display_name, is_visible, is_purchasable, max_funnels,
--          max_landing_pages, max_live_sessions, max_storage_mb, whatsapp_monthly_cap,
--          whatsapp_templates_level, max_team_members
--     FROM subscription_plans ORDER BY display_order;
--   SELECT get_effective_access(auth.uid());
-- ============================================================================
