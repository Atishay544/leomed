-- ============================================================================
-- Product "uses" — what the product is indicated for (e.g. "Fever, body
-- pain, inflammation"), for an MR to reference when detailing to a doctor
-- or explaining to a chemist. Same treatment as composition
-- (20260908000003): free text, admin-editable on the Product Master form,
-- same RLS as every other erp_products column (masters.read).
-- ============================================================================

alter table public.erp_products add column if not exists uses text;

comment on column public.erp_products.uses is
  'What the product is used for/indicated for — free text, for MR detailing. Shown alongside composition on the Product Master list and the MR price reference screen.';
