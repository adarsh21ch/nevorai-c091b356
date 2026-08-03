-- Nevorai Academy: category ordering
-- Copy-paste this whole block into the Supabase SQL Editor and click Run.

create table if not exists public.academy_category_order (
  category text primary key,
  order_index int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.academy_category_order enable row level security;

drop policy if exists "Anyone read category order" on public.academy_category_order;
create policy "Anyone read category order"
  on public.academy_category_order for select using (true);

drop policy if exists "Admins manage category order" on public.academy_category_order;
create policy "Admins manage category order"
  on public.academy_category_order for all
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Seed sensible defaults (Getting started first, then Videos, then Funnels...)
insert into public.academy_category_order (category, order_index) values
  ('getting-started', 1),
  ('videos',          2),
  ('funnels',         3),
  ('landing-pages',   4),
  ('live',            5),
  ('sharing',         6),
  ('billing',         7),
  ('advanced',        8)
on conflict (category) do update set order_index = excluded.order_index;
