-- ============================================================================
-- FIX: erp_product_batches_secure was unreadable by anyone, admin included.
--
-- 20260907000009_product_batches_cost_masking_view.sql revoked SELECT on
-- erp_product_batches from `authenticated`, then created
-- erp_product_batches_secure `with (security_invoker = true)` for every app
-- read to go through instead. That combination is self-defeating: a
-- security_invoker view is checked against the QUERYING role's own
-- table-level privileges, not the view owner's — and since every app role
-- (ADMIN included) connects as the one shared Postgres role `authenticated`,
-- revoking that role's SELECT on the base table breaks the view for
-- literally everyone, not just non-admins.
--
-- That same migration already knew this failure mode and fixed it correctly
-- for erp_product_stock_totals and erp_stock_valuation_summary (switching
-- both away from security_invoker, per its own "collateral fix" comment) —
-- erp_product_batches_secure was simply missed, being newly introduced in
-- the same migration rather than an existing object being repaired.
--
-- Confirmed live: a purchase invoice correctly posted 10,000 units to a
-- batch (ledger entry and cached current_quantity both correct, reconciled
-- with zero discrepancies), yet Masters > Batches, the Inventory dashboard
-- and the Dashboard home tile all showed no stock at all — every one of
-- them reads erp_product_batches_secure.
--
-- Fix: drop security_invoker, exactly like erp_product_stock_totals already
-- does. The view then runs with its owner's privileges, unaffected by the
-- base table's revoked grant.
--
--   - purchase_rate masking is untouched: it's a column-level
--     `case when erp_is_admin()` expression that reads the CALLING user's
--     own session, not the view's execution mode — a non-admin still gets
--     null there, an admin still gets the real figure.
--   - RLS on the base table is bypassed for reads through this view, the
--     same trade-off already accepted for erp_product_stock_totals.
--     erp_product_batches' SELECT policy is "any staff can read every row"
--     with no per-row scoping today, so this changes which PRIVILEGE GRANT
--     is checked, not which rows anyone can see.
-- ============================================================================

create or replace view public.erp_product_batches_secure
as
select
  id, product_id, batch_number, manufacturing_date, expiry_date, mrp,
  case when public.erp_is_admin() then purchase_rate else null end as purchase_rate,
  sale_rate, opening_quantity, current_quantity, created_by, created_at, updated_at
from public.erp_product_batches;

-- Belt and suspenders: CREATE OR REPLACE VIEW's handling of a previously-set
-- storage parameter it doesn't repeat is not something to rely on — this
-- makes the change explicit regardless.
alter view public.erp_product_batches_secure set (security_invoker = false);

revoke all on public.erp_product_batches_secure from anon;
grant select on public.erp_product_batches_secure to authenticated;
