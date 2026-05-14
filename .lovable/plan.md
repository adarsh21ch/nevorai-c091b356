# Storage Enforcement (Section 4 — minimal scope)

Skipping pricing UI / admin / Razorpay / watermark / plan limit counts (already built or out of scope).

## Schema (read-only)

- `plan_config.max_storage_mb` — already exists. Hook reads this; no migrations.
- `video_assets.file_size_bytes` — already exists. Hook sums this.

Storage limit is in **MB** (not GB) in the DB. The hook converts MB → GB for display while keeping bytes for arithmetic.

## 1. New hook — `src/hooks/useStorageUsage.ts`

- `useQuery` (staleTime 30s) keyed `["storage-usage", userId, planName]`.
- Query A: `select file_size_bytes from video_assets where owner_id = user.id` → sum.
- Query B: read `max_storage_mb` from `plan_config` for the active plan name (resolved via existing `usePlan` → `plan.tier`/`planKey`; map "trial"/"pro"/"basic"/"free" to `plan_name`).
- Returns:
  ```
  { usedBytes, usedGB, limitGB, limitBytes, percent, isOverLimit, planName, isLoading }
  ```
- Helper exported: `wouldExceed(fileSizeBytes)` → boolean.

## 2. Upload blocking

New shared component `src/components/StorageLimitModal.tsx`:
- Title "Storage limit reached"
- Body "You've used X.X of Y.Y GB. Upgrade to keep uploading."
- Buttons: **See Plans** → `navigate("/pricing")`, **Cancel**.

Wire pre-upload check (using `useStorageUsage` + `wouldExceed(file.size)`) into:
- `src/components/VideoUploadModal.tsx` (primary upload path — covers `VideosPage`, `MobileCreateAction`, `PublicVideoPage`)
- `src/pages/UploadFirstOnboarding.tsx` (onboarding flow)
- `src/routes/onboarding-upload.lazy.tsx` (if it does its own upload; otherwise delegates to modal — verify on edit)

Block runs immediately on file selection, before any R2 / network call. R2 upload logic untouched.

## 3. Storage indicator

New presentational component `src/components/StorageUsageCard.tsx` (full card with progress bar + upgrade CTA when free/over) and `StorageUsageInline.tsx` (compact "0.4 / 1.0 GB used" text).

Mounts:
- `src/pages/ProfilePage.tsx` — full card
- `src/pages/BillingPage.tsx` — full card at top
- `src/pages/VideosPage.tsx` — inline indicator in header

All consume `useStorageUsage` (single source of truth).

## Out of scope (per user)

Pricing UI, admin Pricing tab, plan_config schema changes, Razorpay, watermark, funnel/landing/live count gates.

## Reporting

After implementation: list of created/modified files + confirmation that storage column = `plan_config.max_storage_mb` (set per-plan in admin panel; e.g. 1024 for free = 1 GB, 10240 for basic, 51200 for pro).
