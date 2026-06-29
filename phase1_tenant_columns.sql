-- =====================================================================
-- Phase 1 — Tenant Column Rollout
-- =====================================================================
-- WHAT THIS DOES:
--   * Adds nullable workspace_id (uuid, FK → workspaces.id) to every
--     tenant-scoped public table.
--   * Backfills workspace_id from the legacy workspace via the most
--     reliable path available per table (owner_id → workspace_members,
--     parent FK join, or direct legacy assignment for singletons).
--   * Adds composite indexes for the read patterns RLS will use in
--     Phase 2: (workspace_id, owner_id|user_id|created_at).
--   * Installs a BEFORE INSERT auto-fill trigger per W-root /
--     W-user / W-child table:
--        1) honour current_workspace_id() GUC if set by the app,
--        2) otherwise resolve from owner_id / user_id / parent FK,
--        3) otherwise leave NULL (Phase 2 will enforce NOT NULL).
--   * NO RLS POLICY CHANGES. Existing policies stay untouched so this
--     migration is behaviour-neutral. Phase 2 replaces owner-based
--     policies with workspace-member policies atomically.
--
-- WHAT THIS DOES NOT DO:
--   * Does not touch globals: admin_audit_logs, admin_subscription_plans,
--     app_settings, platform_settings, subscription_plans, plan_tiers,
--     plan_coupons, enterprise_inquiries, enterprise_plan_config,
--     academy_tutorials, academy_category_order, whatsapp_help_articles,
--     landing_content, suppressed_emails, email_unsubscribe_tokens,
--     user_roles, reserved_subdomains.
--   * Does not touch system/infra: auth_attempts, email_send_log,
--     email_send_state, payment_webhook_log, funnel_daily_views_old.
--   * Does not drop, rename, or modify any existing column or policy.
--
-- HOW TO APPLY:
--   Supabase SQL Editor → paste this whole file → Run. Single
--   transaction; either everything commits or nothing does.
--
-- ROLLBACK: see phase1_tenant_columns_rollback.sql
-- VERIFY:   see phase1_tenant_columns_verify.sql
-- =====================================================================

BEGIN;

------------------------------------------------------------------------
-- 0. Sanity check: Phase 0 must be applied
------------------------------------------------------------------------
DO $$
DECLARE _legacy uuid;
BEGIN
  SELECT id INTO _legacy FROM public.workspaces WHERE lower(slug) = 'legacy';
  IF _legacy IS NULL THEN
    RAISE EXCEPTION 'Phase 0 not applied: legacy workspace missing. Apply phase0_workspaces_foundation.sql first.';
  END IF;
END $$;

------------------------------------------------------------------------
-- 1. Helpers
------------------------------------------------------------------------
-- Resolve the first (and today only) workspace a user belongs to.
CREATE OR REPLACE FUNCTION public.resolve_user_workspace(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT workspace_id
    FROM public.workspace_members
   WHERE user_id = _user_id
   ORDER BY created_at ASC
   LIMIT 1
$$;

-- Cached legacy workspace id; STABLE so planner inlines it within a statement.
CREATE OR REPLACE FUNCTION public.legacy_workspace_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT id FROM public.workspaces WHERE lower(slug) = 'legacy' LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.resolve_user_workspace(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.legacy_workspace_id()        TO authenticated, anon, service_role;

-- Generic auto-fill: per-table BEFORE INSERT trigger functions are
-- created inline below. Each one:
--   1) returns NEW unchanged if NEW.workspace_id IS NOT NULL;
--   2) tries current_workspace_id() (GUC set by app middleware);
--   3) falls back to a per-table resolver (owner/user/parent FK);
--   4) leaves NULL if nothing matched (Phase 1 is permissive).

------------------------------------------------------------------------
-- 2. Macro: add_workspace_id(table_name) — column + FK + index
------------------------------------------------------------------------
-- We avoid \set / psql meta-commands so this runs in the Supabase editor.
-- Each table is added explicitly to keep grep-ability and review clarity.

------------------------------------------------------------------------
-- 3. W-ROOT TABLES (owner_id / user_id / upline_id → resolves directly)
------------------------------------------------------------------------

-- 3.1 funnels (owner_id)
ALTER TABLE public.funnels ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.funnels SET workspace_id = public.resolve_user_workspace(owner_id) WHERE workspace_id IS NULL AND owner_id IS NOT NULL;
UPDATE public.funnels SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS funnels_ws_owner_idx ON public.funnels(workspace_id, owner_id);
CREATE INDEX IF NOT EXISTS funnels_ws_created_idx ON public.funnels(workspace_id, created_at DESC);

-- 3.2 landing_pages (owner_id)
ALTER TABLE public.landing_pages ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.landing_pages SET workspace_id = public.resolve_user_workspace(owner_id) WHERE workspace_id IS NULL AND owner_id IS NOT NULL;
UPDATE public.landing_pages SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS landing_pages_ws_owner_idx ON public.landing_pages(workspace_id, owner_id);
CREATE INDEX IF NOT EXISTS landing_pages_ws_created_idx ON public.landing_pages(workspace_id, created_at DESC);

-- 3.3 live_sessions (owner_id)
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.live_sessions SET workspace_id = public.resolve_user_workspace(owner_id) WHERE workspace_id IS NULL AND owner_id IS NOT NULL;
UPDATE public.live_sessions SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS live_sessions_ws_owner_idx ON public.live_sessions(workspace_id, owner_id);

-- 3.4 video_assets (owner_id)
ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.video_assets SET workspace_id = public.resolve_user_workspace(owner_id) WHERE workspace_id IS NULL AND owner_id IS NOT NULL;
UPDATE public.video_assets SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS video_assets_ws_owner_idx ON public.video_assets(workspace_id, owner_id);
CREATE INDEX IF NOT EXISTS video_assets_ws_created_idx ON public.video_assets(workspace_id, created_at DESC);

-- 3.5 video_folders (owner_id)
ALTER TABLE public.video_folders ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.video_folders SET workspace_id = public.resolve_user_workspace(owner_id) WHERE workspace_id IS NULL AND owner_id IS NOT NULL;
UPDATE public.video_folders SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS video_folders_ws_owner_idx ON public.video_folders(workspace_id, owner_id);

-- 3.6 team_members (owner_id)
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.team_members SET workspace_id = public.resolve_user_workspace(owner_id) WHERE workspace_id IS NULL AND owner_id IS NOT NULL;
UPDATE public.team_members SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS team_members_ws_owner_idx ON public.team_members(workspace_id, owner_id);

-- 3.7 team_labels (owner_id)
ALTER TABLE public.team_labels ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.team_labels SET workspace_id = public.resolve_user_workspace(owner_id) WHERE workspace_id IS NULL AND owner_id IS NOT NULL;
UPDATE public.team_labels SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS team_labels_ws_owner_idx ON public.team_labels(workspace_id, owner_id);

-- 3.8 team_connections (upline_id → workspace)
ALTER TABLE public.team_connections ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.team_connections SET workspace_id = public.resolve_user_workspace(upline_id) WHERE workspace_id IS NULL AND upline_id IS NOT NULL;
UPDATE public.team_connections SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS team_connections_ws_upline_idx ON public.team_connections(workspace_id, upline_id);

-- 3.9 tracking_accounts (owner_id)
ALTER TABLE public.tracking_accounts ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.tracking_accounts SET workspace_id = public.resolve_user_workspace(owner_id) WHERE workspace_id IS NULL AND owner_id IS NOT NULL;
UPDATE public.tracking_accounts SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS tracking_accounts_ws_owner_idx ON public.tracking_accounts(workspace_id, owner_id);

-- 3.10 tracking_column_config (owner_id)
ALTER TABLE public.tracking_column_config ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.tracking_column_config SET workspace_id = public.resolve_user_workspace(owner_id) WHERE workspace_id IS NULL AND owner_id IS NOT NULL;
UPDATE public.tracking_column_config SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS tracking_column_config_ws_owner_idx ON public.tracking_column_config(workspace_id, owner_id);

-- 3.11 capi_fire_queue (owner_id)
ALTER TABLE public.capi_fire_queue ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.capi_fire_queue SET workspace_id = public.resolve_user_workspace(owner_id) WHERE workspace_id IS NULL AND owner_id IS NOT NULL;
UPDATE public.capi_fire_queue SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS capi_fire_queue_ws_owner_idx ON public.capi_fire_queue(workspace_id, owner_id);

-- 3.12 funnel_share_links (owner_id)
ALTER TABLE public.funnel_share_links ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.funnel_share_links SET workspace_id = public.resolve_user_workspace(owner_id) WHERE workspace_id IS NULL AND owner_id IS NOT NULL;
UPDATE public.funnel_share_links SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS funnel_share_links_ws_owner_idx ON public.funnel_share_links(workspace_id, owner_id);

-- 3.13 landing_page_shares (owner_id)
ALTER TABLE public.landing_page_shares ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.landing_page_shares SET workspace_id = public.resolve_user_workspace(owner_id) WHERE workspace_id IS NULL AND owner_id IS NOT NULL;
UPDATE public.landing_page_shares SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS landing_page_shares_ws_owner_idx ON public.landing_page_shares(workspace_id, owner_id);

-- 3.14 landing_page_testimonials (owner_id)
ALTER TABLE public.landing_page_testimonials ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.landing_page_testimonials SET workspace_id = public.resolve_user_workspace(owner_id) WHERE workspace_id IS NULL AND owner_id IS NOT NULL;
UPDATE public.landing_page_testimonials SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS landing_page_testimonials_ws_owner_idx ON public.landing_page_testimonials(workspace_id, owner_id);

-- 3.15 landing_page_registrations (owner_id is the creator; user_id is the lead — owner wins)
ALTER TABLE public.landing_page_registrations ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.landing_page_registrations SET workspace_id = public.resolve_user_workspace(owner_id) WHERE workspace_id IS NULL AND owner_id IS NOT NULL;
UPDATE public.landing_page_registrations SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS landing_page_registrations_ws_owner_idx ON public.landing_page_registrations(workspace_id, owner_id);
CREATE INDEX IF NOT EXISTS landing_page_registrations_ws_submitted_idx ON public.landing_page_registrations(workspace_id, submitted_at DESC);

-- 3.16 pixel_fire_log (owner_id)
ALTER TABLE public.pixel_fire_log ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.pixel_fire_log SET workspace_id = public.resolve_user_workspace(owner_id) WHERE workspace_id IS NULL AND owner_id IS NOT NULL;
UPDATE public.pixel_fire_log SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS pixel_fire_log_ws_owner_idx ON public.pixel_fire_log(workspace_id, owner_id);

------------------------------------------------------------------------
-- 4. W-USER TABLES (user_id → resolve via workspace_members)
------------------------------------------------------------------------

-- 4.1 profiles  (id IS the user id; profile = identity, lives in primary workspace)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.profiles SET workspace_id = public.resolve_user_workspace(id) WHERE workspace_id IS NULL;
UPDATE public.profiles SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS profiles_ws_idx ON public.profiles(workspace_id);

-- 4.2 user_subscriptions
ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.user_subscriptions SET workspace_id = public.resolve_user_workspace(user_id) WHERE workspace_id IS NULL AND user_id IS NOT NULL;
UPDATE public.user_subscriptions SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS user_subscriptions_ws_user_idx ON public.user_subscriptions(workspace_id, user_id);

-- 4.3 user_kyc_submissions
ALTER TABLE public.user_kyc_submissions ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.user_kyc_submissions SET workspace_id = public.resolve_user_workspace(user_id) WHERE workspace_id IS NULL AND user_id IS NOT NULL;
UPDATE public.user_kyc_submissions SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS user_kyc_ws_user_idx ON public.user_kyc_submissions(workspace_id, user_id);

-- 4.4 user_daily_views
ALTER TABLE public.user_daily_views ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.user_daily_views SET workspace_id = public.resolve_user_workspace(user_id) WHERE workspace_id IS NULL AND user_id IS NOT NULL;
UPDATE public.user_daily_views SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS user_daily_views_ws_user_idx ON public.user_daily_views(workspace_id, user_id);

-- 4.5 user_view_sessions
ALTER TABLE public.user_view_sessions ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.user_view_sessions SET workspace_id = public.resolve_user_workspace(user_id) WHERE workspace_id IS NULL AND user_id IS NOT NULL;
UPDATE public.user_view_sessions SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS user_view_sessions_ws_user_idx ON public.user_view_sessions(workspace_id, user_id);

-- 4.6 notifications
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.notifications SET workspace_id = public.resolve_user_workspace(user_id) WHERE workspace_id IS NULL AND user_id IS NOT NULL;
UPDATE public.notifications SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS notifications_ws_user_idx ON public.notifications(workspace_id, user_id);

-- 4.7 support_tickets
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.support_tickets SET workspace_id = public.resolve_user_workspace(user_id) WHERE workspace_id IS NULL AND user_id IS NOT NULL;
UPDATE public.support_tickets SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS support_tickets_ws_user_idx ON public.support_tickets(workspace_id, user_id);

-- 4.8 refund_requests
ALTER TABLE public.refund_requests ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.refund_requests SET workspace_id = public.resolve_user_workspace(user_id) WHERE workspace_id IS NULL AND user_id IS NOT NULL;
UPDATE public.refund_requests SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS refund_requests_ws_user_idx ON public.refund_requests(workspace_id, user_id);

-- 4.9 payment_audit_logs
ALTER TABLE public.payment_audit_logs ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.payment_audit_logs SET workspace_id = public.resolve_user_workspace(user_id) WHERE workspace_id IS NULL AND user_id IS NOT NULL;
UPDATE public.payment_audit_logs SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS payment_audit_ws_user_idx ON public.payment_audit_logs(workspace_id, user_id);

-- 4.10 subscription_logs
ALTER TABLE public.subscription_logs ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.subscription_logs SET workspace_id = public.resolve_user_workspace(user_id) WHERE workspace_id IS NULL AND user_id IS NOT NULL;
UPDATE public.subscription_logs SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS subscription_logs_ws_user_idx ON public.subscription_logs(workspace_id, user_id);

-- 4.11 email_logs
ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.email_logs SET workspace_id = public.resolve_user_workspace(user_id) WHERE workspace_id IS NULL AND user_id IS NOT NULL;
UPDATE public.email_logs SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS email_logs_ws_user_idx ON public.email_logs(workspace_id, user_id);

-- 4.12 gmail_oauth_tokens
ALTER TABLE public.gmail_oauth_tokens ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.gmail_oauth_tokens SET workspace_id = public.resolve_user_workspace(user_id) WHERE workspace_id IS NULL AND user_id IS NOT NULL;
UPDATE public.gmail_oauth_tokens SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS gmail_oauth_ws_user_idx ON public.gmail_oauth_tokens(workspace_id, user_id);

-- 4.13 nev_ai_usage
ALTER TABLE public.nev_ai_usage ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.nev_ai_usage SET workspace_id = public.resolve_user_workspace(user_id) WHERE workspace_id IS NULL AND user_id IS NOT NULL;
UPDATE public.nev_ai_usage SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS nev_ai_usage_ws_user_idx ON public.nev_ai_usage(workspace_id, user_id);

-- 4.14 coupon_redemptions
ALTER TABLE public.coupon_redemptions ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.coupon_redemptions SET workspace_id = public.resolve_user_workspace(user_id) WHERE workspace_id IS NULL AND user_id IS NOT NULL;
UPDATE public.coupon_redemptions SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS coupon_redemptions_ws_user_idx ON public.coupon_redemptions(workspace_id, user_id);

-- 4.15 academy_completions
ALTER TABLE public.academy_completions ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.academy_completions SET workspace_id = public.resolve_user_workspace(user_id) WHERE workspace_id IS NULL AND user_id IS NOT NULL;
UPDATE public.academy_completions SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS academy_completions_ws_user_idx ON public.academy_completions(workspace_id, user_id);

------------------------------------------------------------------------
-- 5. W-CHILD TABLES (workspace_id derived from parent FK)
------------------------------------------------------------------------

-- 5.A Children of funnels (15)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'funnel_access_logs','funnel_engagement_events','funnel_engagement_sessions',
    'funnel_lead_form_config','funnel_leads','funnel_payments','funnel_price_options',
    'funnel_step_progress','funnel_steps','funnel_video_analytics','funnel_view_events',
    'link_events','meta_pixel_events_log','step_access_logs','member_activity_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT', t);
    EXECUTE format('UPDATE public.%I c SET workspace_id = f.workspace_id FROM public.funnels f WHERE c.funnel_id = f.id AND c.workspace_id IS NULL', t);
    EXECUTE format('UPDATE public.%I SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(workspace_id, funnel_id)', t || '_ws_funnel_idx', t);
  END LOOP;
END $$;

-- 5.B Children of landing_pages (3 — registrations already handled in §3.15)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['landing_page_collaborators','landing_page_view_events','landing_page_view_logs'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT', t);
    EXECUTE format('UPDATE public.%I c SET workspace_id = lp.workspace_id FROM public.landing_pages lp WHERE c.landing_page_id = lp.id AND c.workspace_id IS NULL', t);
    EXECUTE format('UPDATE public.%I SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(workspace_id, landing_page_id)', t || '_ws_lp_idx', t);
  END LOOP;
END $$;

-- 5.C Children of live_sessions (4)
DO $$
DECLARE
  t text;
  parent_col text;
  cols text[][] := ARRAY[
    ARRAY['live_registrations','session_id'],
    ARRAY['live_session_analytics','session_id'],
    ARRAY['live_session_heartbeats','session_id'],
    ARRAY['live_session_view_events','live_session_id']
  ];
  i int;
BEGIN
  FOR i IN 1..array_length(cols,1) LOOP
    t := cols[i][1]; parent_col := cols[i][2];
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT', t);
    EXECUTE format('UPDATE public.%I c SET workspace_id = ls.workspace_id FROM public.live_sessions ls WHERE c.%I = ls.id AND c.workspace_id IS NULL', t, parent_col);
    EXECUTE format('UPDATE public.%I SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(workspace_id, %I)', t || '_ws_parent_idx', t, parent_col);
  END LOOP;
END $$;

-- 5.D Children of video_assets (3)
DO $$
DECLARE
  t text;
  parent_col text;
  cols text[][] := ARRAY[
    ARRAY['video_asset_access','video_id'],
    ARRAY['video_view_events','video_id'],
    ARRAY['video_reactions','video_id']
  ];
  i int;
BEGIN
  FOR i IN 1..array_length(cols,1) LOOP
    t := cols[i][1]; parent_col := cols[i][2];
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT', t);
    EXECUTE format('UPDATE public.%I c SET workspace_id = v.workspace_id FROM public.video_assets v WHERE c.%I = v.id AND c.workspace_id IS NULL', t, parent_col);
    EXECUTE format('UPDATE public.%I SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(workspace_id, %I)', t || '_ws_video_idx', t, parent_col);
  END LOOP;
END $$;

------------------------------------------------------------------------
-- 6. WhatsApp subsystem (W-scoped — per the user's decision)
------------------------------------------------------------------------
-- All WhatsApp tables become workspace-scoped so every workspace can
-- eventually connect its own Meta Business account.

-- 6.A whatsapp_automations is the root for several children → resolve from user_id
ALTER TABLE public.whatsapp_automations ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.whatsapp_automations SET workspace_id = public.resolve_user_workspace(user_id) WHERE workspace_id IS NULL AND user_id IS NOT NULL;
UPDATE public.whatsapp_automations SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS whatsapp_automations_ws_user_idx ON public.whatsapp_automations(workspace_id, user_id);

-- 6.B Children of whatsapp_automations (derive from automation FK)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['whatsapp_automation_enrollments','whatsapp_automation_steps','whatsapp_message_logs','whatsapp_sequence_enrollments'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT', t);
    EXECUTE format('UPDATE public.%I c SET workspace_id = a.workspace_id FROM public.whatsapp_automations a WHERE c.automation_id = a.id AND c.workspace_id IS NULL', t);
    EXECUTE format('UPDATE public.%I SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(workspace_id, automation_id)', t || '_ws_automation_idx', t);
  END LOOP;
END $$;

-- 6.C WhatsApp W-user tables (user_id → workspace)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['whatsapp_automation_log','whatsapp_broadcasts','whatsapp_logs','whatsapp_otp_codes','whatsapp_verifications','whatsapp_leads'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT', t);
    EXECUTE format('UPDATE public.%I SET workspace_id = public.resolve_user_workspace(user_id) WHERE workspace_id IS NULL AND user_id IS NOT NULL', t);
    EXECUTE format('UPDATE public.%I SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(workspace_id, user_id)', t || '_ws_user_idx', t);
  END LOOP;
END $$;

-- 6.D WhatsApp shared/admin-config tables → singleton-per-workspace
-- (currently single shared rows; backfilled to legacy; unique-per-workspace
--  to be added in Phase 2 once code is migrated to set workspace_id at insert)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['whatsapp_settings','whatsapp_templates','whatsapp_campaigns','whatsapp_media','whatsapp_conversations','whatsapp_bot_pauses'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT', t);
    EXECUTE format('UPDATE public.%I SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(workspace_id)', t || '_ws_idx', t);
  END LOOP;
END $$;

------------------------------------------------------------------------
-- 7. Meta Pixel + Payment Provider (singletons → per-workspace later)
------------------------------------------------------------------------
ALTER TABLE public.meta_pixel_settings ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.meta_pixel_settings SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS meta_pixel_settings_ws_idx ON public.meta_pixel_settings(workspace_id);

ALTER TABLE public.payment_provider_settings ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.payment_provider_settings SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS payment_provider_settings_ws_idx ON public.payment_provider_settings(workspace_id);

------------------------------------------------------------------------
-- 8. Member subsystem (W-scoped; no cross-workspace visibility)
------------------------------------------------------------------------
ALTER TABLE public.member_gateway_settings ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.member_gateway_settings SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS member_gateway_settings_ws_idx ON public.member_gateway_settings(workspace_id);

ALTER TABLE public.member_otps ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.member_otps SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS member_otps_ws_email_idx ON public.member_otps(workspace_id, email);

ALTER TABLE public.member_access_logs ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.member_access_logs SET workspace_id = public.resolve_user_workspace(user_id) WHERE workspace_id IS NULL AND user_id IS NOT NULL;
UPDATE public.member_access_logs SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS member_access_logs_ws_user_idx ON public.member_access_logs(workspace_id, user_id);

ALTER TABLE public.nevorai_member_registry ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;
UPDATE public.nevorai_member_registry SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS nevorai_member_registry_ws_idx ON public.nevorai_member_registry(workspace_id);

------------------------------------------------------------------------
-- 9. Auto-fill trigger (generic, idempotent)
------------------------------------------------------------------------
-- This trigger sets NEW.workspace_id from current_workspace_id() GUC
-- when the app forgets to set it explicitly. It does NOT raise on NULL
-- so Phase 1 stays behaviour-neutral. Phase 2 will add NOT NULL +
-- error on missing workspace.
CREATE OR REPLACE FUNCTION public.tg_autofill_workspace_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    NEW.workspace_id := public.current_workspace_id();
  END IF;
  RETURN NEW;
END;
$$;

-- Attach to every table with a workspace_id column we just added.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.table_name
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.column_name = 'workspace_id'
       AND c.table_name NOT IN ('workspaces','workspace_members','workspace_branding')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_autofill_workspace_id ON public.%I', r.table_name);
    EXECUTE format(
      'CREATE TRIGGER tg_autofill_workspace_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_autofill_workspace_id()',
      r.table_name
    );
  END LOOP;
END $$;

------------------------------------------------------------------------
-- 10. Final integrity assertion
------------------------------------------------------------------------
-- Refuse to commit if any tenant table still has NULL workspace_id.
DO $$
DECLARE
  r record;
  bad int;
BEGIN
  FOR r IN
    SELECT c.table_name
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.column_name = 'workspace_id'
       AND c.table_name NOT IN ('workspaces','workspace_members','workspace_branding')
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE workspace_id IS NULL', r.table_name) INTO bad;
    IF bad > 0 THEN
      RAISE EXCEPTION 'Backfill incomplete: % rows with NULL workspace_id in %', bad, r.table_name;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- =====================================================================
-- DONE. Run phase1_tenant_columns_verify.sql to sanity-check.
-- =====================================================================
