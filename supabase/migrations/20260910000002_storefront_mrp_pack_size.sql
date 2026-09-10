-- ============================================================================
-- Storefront catalogue gains mrp and pack_size — same treatment as
-- composition/generic_name/uses: free-standing fields, propagated from a
-- linked ERP Product Master product when the admin connects them, still
-- editable directly for a product with no ERP link.
--
-- Showing MRP publicly is a deliberate, explicit reversal of part of the
-- original B2B conversion's "no purchase signals" intent (20260905000006)
-- — this is informational (what a distributor/chemist/doctor should expect
-- to see printed on the pack), not a checkout price, and there is still no
-- cart or online order anywhere on the site.
-- ============================================================================

alter table public.products
  add column if not exists mrp        numeric(12,2) check (mrp is null or mrp >= 0),
  add column if not exists pack_size  text;
