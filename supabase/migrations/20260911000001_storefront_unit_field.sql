-- ============================================================================
-- Storefront catalogue gains `unit` — same treatment as composition/
-- generic_name/uses/mrp/pack_size: free-standing field, propagated from a
-- linked ERP Product Master product (erp_products.unit, e.g. BOX/STRIP/
-- BOTTLE) when the admin connects them, still directly editable for a
-- product with no ERP link.
-- ============================================================================

alter table public.products
  add column if not exists unit text;
