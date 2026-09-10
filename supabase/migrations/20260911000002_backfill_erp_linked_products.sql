-- ============================================================================
-- Backfill: products already linked to a Product Master product (i.e.
-- erp_products.storefront_product_id already points at them) never had
-- generic_name/uses/composition/mrp/pack_size/unit propagated, because the
-- propagation added in 20260910000001 / 20260910000002 / 20260911000001
-- only runs client-side when an admin picks a product from the "Link to
-- Product Master" dropdown — it never ran for links that already existed.
--
-- One-time backfill for every already-linked storefront product: fill in
-- any of these fields that are still empty on the storefront row from the
-- linked ERP product, without overwriting a value an admin may have
-- deliberately typed in directly. mrp is only backfilled when the ERP
-- product has a real (>0) MRP — erp_products.mrp defaults to 0, and a
-- default of 0 is not a real price worth propagating.
-- ============================================================================

update public.products p
set
  generic_name = coalesce(p.generic_name, e.generic_name),
  uses         = coalesce(p.uses, e.uses),
  composition  = coalesce(p.composition, e.composition),
  pack_size    = coalesce(p.pack_size, e.pack_size),
  unit         = coalesce(p.unit, e.unit),
  mrp          = case when p.mrp is null and e.mrp > 0 then e.mrp else p.mrp end
from public.erp_products e
where e.storefront_product_id = p.id;
