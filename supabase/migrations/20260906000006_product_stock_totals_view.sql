-- ============================================================================
-- LEOMED PHARMA ERP — total stock per product, aggregated across batches
--
-- Purchases already create a new batch with its own purchase_rate/mrp/
-- sale_rate/expiry_date (erp_save_purchase_invoice, spec §15) and sales
-- already deduct from a specific batch per line (erp_save_sales_invoice) —
-- both already existed before this migration. What was missing was a way
-- for an admin to see a product's TOTAL quantity on hand across every batch
-- at a glance, alongside the existing batch-level detail (spec §41 —
-- computed once here, not summed client-side over every batch row).
--
-- security_invoker = true is load-bearing: without it, a view defaults to
-- running with the view OWNER's privileges for RLS purposes, which would
-- leak every product's stock to any authenticated user regardless of their
-- own row-level access. With it, erp_product_batches' existing RLS
-- (erp_is_staff() — any active staff member) is enforced per caller, same
-- as querying the table directly.
-- ============================================================================

create or replace view public.erp_product_stock_totals
with (security_invoker = true)
as
select
  product_id,
  count(*) filter (where current_quantity > 0)      as batch_count,
  coalesce(sum(current_quantity), 0)                as total_quantity,
  coalesce(sum(current_quantity * purchase_rate), 0) as total_value,
  min(expiry_date) filter (where current_quantity > 0) as earliest_expiry
from public.erp_product_batches
group by product_id;

revoke all on public.erp_product_stock_totals from anon;
grant select on public.erp_product_stock_totals to authenticated;
