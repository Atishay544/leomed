-- ============================================================================
-- Product composition — for MR medical detailing, distinct from
-- generic_name/strength. Free text (e.g. "Paracetamol 500mg + Caffeine
-- 30mg"), admin-editable on the Product Master form alongside the rest of
-- the product's identity. Same RLS as every other erp_products column —
-- masters.read.
-- ============================================================================

alter table public.erp_products add column if not exists composition text;

comment on column public.erp_products.composition is
  'Full formula/composition string for medical detailing — distinct from generic_name/strength. Shown on the MR price reference screen.';
