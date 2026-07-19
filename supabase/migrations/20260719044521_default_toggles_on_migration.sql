-- Make ON-by-default toggles actually default to TRUE on new rows.
-- Safe to run multiple times. Wrapped in DO blocks so missing columns don't fail.

DO $$
BEGIN
  -- funnels
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='funnels' AND column_name='show_contact_buttons') THEN
    EXECUTE 'ALTER TABLE public.funnels ALTER COLUMN show_contact_buttons SET DEFAULT true';
    EXECUTE 'UPDATE public.funnels SET show_contact_buttons = true WHERE show_contact_buttons IS NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='funnels' AND column_name='whatsapp_auto_message') THEN
    EXECUTE 'ALTER TABLE public.funnels ALTER COLUMN whatsapp_auto_message SET DEFAULT true';
    EXECUTE 'UPDATE public.funnels SET whatsapp_auto_message = true WHERE whatsapp_auto_message IS NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='funnels' AND column_name='video_topics_enabled') THEN
    EXECUTE 'ALTER TABLE public.funnels ALTER COLUMN video_topics_enabled SET DEFAULT true';
    EXECUTE 'UPDATE public.funnels SET video_topics_enabled = true WHERE video_topics_enabled IS NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='funnels' AND column_name='allow_speed_change') THEN
    EXECUTE 'ALTER TABLE public.funnels ALTER COLUMN allow_speed_change SET DEFAULT true';
    EXECUTE 'UPDATE public.funnels SET allow_speed_change = true WHERE allow_speed_change IS NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='funnels' AND column_name='cta_enabled') THEN
    EXECUTE 'ALTER TABLE public.funnels ALTER COLUMN cta_enabled SET DEFAULT true';
    EXECUTE 'UPDATE public.funnels SET cta_enabled = true WHERE cta_enabled IS NULL';
  END IF;
END $$;
