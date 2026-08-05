-- Migration: Add per-step assets (PDFs, Images, Media)
-- Allows creators to attach downloadable/viewable materials to any funnel step.

CREATE TABLE public.funnel_step_assets (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    funnel_id uuid NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
    funnel_step_id uuid NOT NULL REFERENCES public.funnel_steps(id) ON DELETE CASCADE,
    title text NOT NULL DEFAULT '',
    file_url text NOT NULL,
    file_type text NOT NULL, -- 'pdf', 'image', 'video', 'other'
    file_size_bytes bigint,
    display_order integer DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_funnel_step_assets_step ON public.funnel_step_assets(funnel_step_id);
CREATE INDEX idx_funnel_step_assets_funnel ON public.funnel_step_assets(funnel_id);

-- Enable RLS
ALTER TABLE public.funnel_step_assets ENABLE ROW LEVEL SECURITY;

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funnel_step_assets TO authenticated;
GRANT ALL ON public.funnel_step_assets TO service_role;
GRANT SELECT ON public.funnel_step_assets TO anon;

-- Policies
CREATE POLICY "Owners can manage step assets"
ON public.funnel_step_assets FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM funnels WHERE funnels.id = funnel_step_assets.funnel_id AND funnels.owner_id = auth.uid()));

CREATE POLICY "Anyone can view assets of published funnels"
ON public.funnel_step_assets FOR SELECT
TO anon, authenticated
USING (EXISTS (SELECT 1 FROM funnels WHERE funnels.id = funnel_step_assets.funnel_id AND funnels.is_published = true));

-- Trigger for updated_at
CREATE TRIGGER update_funnel_step_assets_updated_at
BEFORE UPDATE ON public.funnel_step_assets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
