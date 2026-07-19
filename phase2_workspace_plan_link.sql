-- Phase 2: Link workspaces to subscription_plans via EXISTING workspaces.plan column.
-- Do NOT add workspaces.plan_slug — reuse workspaces.plan (text).
-- Values: 'individual' (single-user, default) | 'leader' (team downlines).
-- Idempotent: safe to re-run.

BEGIN;

-- 1) Ensure plan column exists (defensive no-op if it already does).
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'individual';

-- 2) Backfill legacy 'free' → 'individual'.
UPDATE public.workspaces
   SET plan = 'individual'
 WHERE plan IS NULL OR plan = '' OR plan = 'free';

-- 3) Move the column default from 'free' to 'individual' for new rows.
ALTER TABLE public.workspaces ALTER COLUMN plan SET DEFAULT 'individual';

-- 4) Constrain to the two supported values (drop first for idempotency).
ALTER TABLE public.workspaces DROP CONSTRAINT IF EXISTS workspaces_plan_check;
ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_plan_check CHECK (plan IN ('individual','leader'));

-- 5) Add plan_seat_limit only if it doesn't already exist.
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS plan_seat_limit integer;

COMMENT ON COLUMN public.workspaces.plan IS
  'Workspace tier: individual (single-user) or leader (team downline hub). Set by razorpay-webhook on paid activation.';
COMMENT ON COLUMN public.workspaces.plan_seat_limit IS
  'Max member seats for leader plan. NULL = individual / unlimited-by-plan.';

-- 6) Verify
SELECT plan, COUNT(*) FROM public.workspaces GROUP BY plan ORDER BY plan;

COMMIT;
