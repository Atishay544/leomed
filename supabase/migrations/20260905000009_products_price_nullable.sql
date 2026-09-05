-- ============================================================
-- The admin product form and the /api/admin/products insert no longer
-- collect or set price (it's not shown on the public catalogue any more —
-- see the B2B conversion migration). The column still had its original
-- D2C-era NOT NULL constraint, so every product creation was failing with
-- "null value in column "price" of relation "products" violates not-null
-- constraint". Dropping NOT NULL — the price >= 0 check constraint still
-- applies to any non-null value, it just no longer blocks NULL.
-- ============================================================

alter table public.products
  alter column price drop not null;
