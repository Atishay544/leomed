-- ============================================================
-- Starter product categories for the catalogue, requested directly:
-- Pharmaceutical, Nutraceutical, Ayurvedic. taxonomy defaults to
-- 'product', so these show up in the homepage category sections and
-- /products category filter alongside anything already there.
-- Safe to re-run: slug has a unique constraint, so this is a no-op for
-- any of the three that already exist.
-- ============================================================

insert into public.categories (name, slug, sort_order)
values
  ('Pharmaceutical', 'pharmaceutical', 0),
  ('Nutraceutical',  'nutraceutical',  1),
  ('Ayurvedic',      'ayurvedic',      2)
on conflict (slug) do nothing;
