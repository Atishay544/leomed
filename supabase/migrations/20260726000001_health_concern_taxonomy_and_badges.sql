-- Phase 1 of the medical-platform plan (docs/plans/2026-07-26-medical-platform-plan.md):
-- add a second category taxonomy ("health concern" browsing, alongside the existing
-- product-type categories) plus a merchandising ribbon tag on products.

alter table public.categories
  add column taxonomy text not null default 'product' check (taxonomy in ('product', 'health_concern'));

alter table public.categories
  add column accent_color text;

alter table public.products
  add column merchandising_tag text check (merchandising_tag in ('best_seller', 'new', 'trending', 'must_have'));

-- A product's single category_id covers product-TYPE browsing (Vitamins, Personal Care, ...).
-- Health-concern browsing (Diabetes, Skin Care, ...) is a separate, non-exclusive tagging —
-- e.g. a glucometer is both "Monitoring Devices" (category_id) AND "Diabetes" (health concern).
create table public.product_health_concerns (
  product_id  uuid references public.products(id)   on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  primary key (product_id, category_id)
);

alter table public.product_health_concerns enable row level security;

create policy "Public read product health concerns" on public.product_health_concerns
  for select using (true);

create policy "Admins manage product health concerns" on public.product_health_concerns
  for all using (public.is_admin());

grant select on public.product_health_concerns to anon, authenticated;
grant insert, update, delete on public.product_health_concerns to authenticated;
