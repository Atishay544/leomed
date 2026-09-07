-- ============================================================================
-- LEOMED PHARMA ERP — stock valuation (landing cost + MRP), admin-only
--
-- erp_product_stock_totals (20260906000006) already carries total_value
-- (quantity × purchase_rate — landing/cost value). This adds the MRP-side
-- figure (quantity × mrp — retail ceiling value) to the same view, so both
-- valuations come from one place, never computed twice.
-- ============================================================================

-- CREATE OR REPLACE VIEW may only APPEND output columns, never insert one
-- ahead of an existing column — Postgres matches the old and new column
-- lists positionally and errors ("cannot change name of view column") if a
-- name shifts. total_mrp_value must therefore come after earliest_expiry
-- (the last column in the 20260906000006 version), not before it.
create or replace view public.erp_product_stock_totals
with (security_invoker = true)
as
select
  product_id,
  count(*) filter (where current_quantity > 0)         as batch_count,
  coalesce(sum(current_quantity), 0)                   as total_quantity,
  coalesce(sum(current_quantity * purchase_rate), 0)    as total_value,
  min(expiry_date) filter (where current_quantity > 0)  as earliest_expiry,
  coalesce(sum(current_quantity * mrp), 0)              as total_mrp_value
from public.erp_product_batches
group by product_id;

revoke all on public.erp_product_stock_totals from anon;
grant select on public.erp_product_stock_totals to authenticated;

-- Company-wide totals for the admin stock-valuation screen — one query,
-- not a sum over every product's row in application code (spec §41).
-- security invoker: RLS on the underlying batches table still applies.
create or replace function public.erp_stock_valuation_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'product_count',      count(distinct product_id) filter (where current_quantity > 0),
    'total_landing_value', coalesce(sum(current_quantity * purchase_rate), 0),
    'total_mrp_value',     coalesce(sum(current_quantity * mrp), 0)
  )
  from public.erp_product_batches
  where current_quantity > 0;
$$;

revoke all on function public.erp_stock_valuation_summary() from public;
grant execute on function public.erp_stock_valuation_summary() to authenticated;
