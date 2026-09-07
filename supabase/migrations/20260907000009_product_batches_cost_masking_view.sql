-- ============================================================================
-- LEOMED PHARMA ERP — FIX: erp_product_batches.purchase_rate (landing cost)
-- was reachable by ANY staff role via direct query, not just through the
-- app's own choice not to ask for that column.
--
-- erp_product_batches' SELECT policy is erp_is_staff() — correct for the
-- table's other columns (quantities, MRP, sale rate), which every role
-- already legitimately needs for day-to-day billing — but purchase_rate is
-- landing cost, which spec §30/§45 and this project's own established
-- precedent (masters/batches/page.tsx, listBatches()'s includeCost param)
-- say must be ADMIN-only (inventory.valuation), enforced at the data layer,
-- not just left out of the app's own query. RLS is row-level only; Postgres
-- has no column-level RLS, so the base table's blanket SELECT grant was the
-- actual gap — confirmed via a direct query as an MR
-- (supabase/tests/erp_role_capability_matrix.sql "Finding (b)").
--
-- Fix: revoke SELECT on the base table from authenticated; add a masking
-- view that every app read goes through instead, exposing purchase_rate
-- only to erp_is_admin() (the same boundary already established for
-- inventory.valuation) and null otherwise. INSERT/UPDATE stay on the base
-- table, unchanged — those are already RLS-gated to erp_can_write_billing()
-- (ADMIN/ACCOUNTANT), and recording a purchase's cost is the whole point of
-- that action; this fix is about READING cost outside that flow.
-- security_invoker = true so the view still enforces the base table's own
-- row-level RLS as the querying user, not the view owner.
-- ============================================================================

revoke select on public.erp_product_batches from authenticated;

create or replace view public.erp_product_batches_secure
with (security_invoker = true) as
select
  id, product_id, batch_number, manufacturing_date, expiry_date, mrp,
  case when public.erp_is_admin() then purchase_rate else null end as purchase_rate,
  sale_rate, opening_quantity, current_quantity, created_by, created_at, updated_at
from public.erp_product_batches;

revoke all on public.erp_product_batches_secure from anon;
grant select on public.erp_product_batches_secure to authenticated;

-- ============================================================================
-- Collateral fix: erp_product_stock_totals (view) and
-- erp_stock_valuation_summary() (function) both read erp_product_batches
-- directly as SECURITY INVOKER — meaning the revoke above would otherwise
-- break both of them for every caller, admins included, since a
-- security-invoker object's own query needs the QUERYING role to hold the
-- underlying privilege, and everyone here connects as the same Postgres
-- role `authenticated` regardless of their app-level ADMIN/MR/etc role.
--
-- Switching both to SECURITY DEFINER fixes that. While already touching
-- them: their cost-derived output gets the same admin-only masking as
-- erp_product_batches_secure, since both were previously granted broadly
-- to `authenticated` with no distinction — total_value/total_mrp_value on
-- the view, and the whole result of the summary function, which was never
-- actually admin-gated at the database at all (its "admin-only" behavior
-- was pure coincidence: SECURITY INVOKER happened to still work because
-- erp_product_batches' RLS lets every staff member read every row, and the
-- only app caller already gates on inventory.valuation — neither of which
-- is a real database-level check).
-- ============================================================================

create or replace view public.erp_product_stock_totals
as
select
  product_id,
  count(*) filter (where current_quantity > 0)         as batch_count,
  coalesce(sum(current_quantity), 0)                   as total_quantity,
  case when public.erp_is_admin() then coalesce(sum(current_quantity * purchase_rate), 0) else null end as total_value,
  min(expiry_date) filter (where current_quantity > 0)  as earliest_expiry,
  case when public.erp_is_admin() then coalesce(sum(current_quantity * mrp), 0) else null end as total_mrp_value
from public.erp_product_batches
group by product_id;

revoke all on public.erp_product_stock_totals from anon;
grant select on public.erp_product_stock_totals to authenticated;

create or replace function public.erp_stock_valuation_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may view company-wide stock valuation'
      using errcode = 'insufficient_privilege';
  end if;

  return (
    select jsonb_build_object(
      'product_count',       count(distinct product_id) filter (where current_quantity > 0),
      'total_landing_value', coalesce(sum(current_quantity * purchase_rate), 0),
      'total_mrp_value',     coalesce(sum(current_quantity * mrp), 0)
    )
    from public.erp_product_batches
    where current_quantity > 0
  );
end;
$$;

revoke all on function public.erp_stock_valuation_summary() from public;
grant execute on function public.erp_stock_valuation_summary() to authenticated;
