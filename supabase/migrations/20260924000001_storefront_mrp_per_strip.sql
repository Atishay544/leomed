-- ============================================================================
-- Storefront catalogue gains `mrp_per_strip` — same treatment as unit/
-- pack_size/mrp: a free-standing, directly-editable field, left blank by
-- default. Unlike those, there is nothing to propagate from a linked ERP
-- Product Master product (erp_products has no equivalent column — trade
-- pricing there is per full pack, never per strip), so this is always a
-- manual admin entry, filled in only for tablets/capsules where a strip-level
-- MRP is meaningful; left null for syrups, injections, ointments etc.
-- ============================================================================

alter table public.products
  add column if not exists mrp_per_strip numeric(12,2) check (mrp_per_strip is null or mrp_per_strip >= 0);
