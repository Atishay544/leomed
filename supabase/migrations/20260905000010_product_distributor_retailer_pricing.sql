-- ============================================================
-- Distributor and retailer trade pricing on the ERP product master.
--
-- Both are meant to be set as a discount off MRP (computed client-side in
-- the form, not stored — mrp/distributor_price/retailer_price are the
-- source of truth, the percentages are just a data-entry convenience).
--
-- sale_rate (already used everywhere as the suggested rate on sales
-- invoice lines) is kept as a column so no existing invoice/lookup code
-- needs to change — the product form now derives it automatically as
-- equal to distributor_price on every save (see ErpProductSchema).
-- ============================================================

alter table public.erp_products
  add column if not exists distributor_price numeric(12,2) not null default 0 check (distributor_price >= 0),
  add column if not exists retailer_price     numeric(12,2) not null default 0 check (retailer_price >= 0);

-- Backfill from the existing sale_rate so nothing shows as zero after the
-- upgrade — sale_rate WAS the de facto distributor rate before this change.
update public.erp_products
set distributor_price = sale_rate
where distributor_price = 0 and sale_rate > 0;
