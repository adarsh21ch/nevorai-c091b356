# Fix migration column name

The SQL error `column fs.video_id does not exist` comes from `unified_tracking_engine_migration.sql`. The actual column in `public.funnel_steps` is `video_asset_id` (verified in the original CREATE TABLE migration).

## Change

In `unified_tracking_engine_migration.sql`, replace `fs.video_id` / `video_id` references to `funnel_steps` at these 3 locations:

- Line 171: `join public.funnel_steps fs on fs.video_id = v.id` → `on fs.video_asset_id = v.id`
- Line 409: `select funnel_id, video_id from public.funnel_steps where video_id is not null` → `select funnel_id, video_asset_id as video_id from public.funnel_steps where video_asset_id is not null`
- Line 490: `select funnel_id from public.funnel_steps where video_id = p_video_id` → `where video_asset_id = p_video_id`

No other tables or app code change. Re-run the migration in the Supabase SQL Editor afterward.
