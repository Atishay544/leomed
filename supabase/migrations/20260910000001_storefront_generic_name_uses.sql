-- ============================================================================
-- Storefront catalogue gains generic_name and uses — same treatment as
-- composition (20260905000006_b2b_catalogue_conversion.sql), so a storefront
-- product linked to an ERP Product Master entry has somewhere to receive
-- that product's generic_name/uses/composition when the admin connects them
-- (see the new "Link to Product Master" control on the product form).
-- ============================================================================

alter table public.products
  add column if not exists generic_name text,
  add column if not exists uses text;
