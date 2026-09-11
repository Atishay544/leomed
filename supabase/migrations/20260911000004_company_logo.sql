-- ============================================================================
-- Company logo — shown on the printed sales invoice header, uploaded by
-- admin from Settings (same upload-then-store-a-public-URL pattern as
-- order-invoice photos and expense receipts).
-- ============================================================================

alter table public.erp_settings
  add column if not exists company_logo_url text;
