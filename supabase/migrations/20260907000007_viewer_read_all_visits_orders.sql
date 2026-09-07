-- ============================================================================
-- LEOMED PHARMA ERP — FIX: VIEWER's visits.read.all / orders.read.all
-- capabilities were never backed by RLS.
--
-- permissions.ts grants VIEWER visits.read.all and orders.read.all (a
-- read-only observer/audit role, by its own doc comment: "sees the whole
-- field force... no writes anywhere"). But every RLS policy that widens
-- visibility beyond "your own mr_id" checks erp_can_read_all_field(),
-- which is defined as ADMIN or MANAGER only — VIEWER was never included.
-- The result: a Viewer's doctor-visits/chemist-visits/field-orders screens
-- have been showing empty lists since the role was built, since RLS only
-- ever let them see rows matching their own (non-existent, since they're
-- not an MR) mr_id.
--
-- Found via supabase/tests/erp_role_capability_matrix.sql (a VIEWER
-- read-all-visits test).
--
-- The fix is NOT to add VIEWER to erp_can_read_all_field() itself — that
-- function is also the write-authorization check behind
-- erp_set_field_order_status() and the erp_field_orders UPDATE policy, and
-- VIEWER must never gain either. Instead: a new, read-only
-- erp_can_view_all_field() (ADMIN, MANAGER, VIEWER), swapped in only for
-- the SELECT-side policies that correspond to VIEWER's actually-granted
-- capabilities:
--   - erp_users (so an MR's/chemist visit's name resolves instead of being
--     silently dropped by a join)
--   - erp_doctor_visits, erp_chemist_visits, erp_doctor_visit_products
--   - erp_field_orders (SELECT only — its UPDATE policy is untouched),
--     erp_field_order_items
--
-- Deliberately NOT touched: erp_followups, erp_targets, attendance, leave —
-- VIEWER holds no followups.manage / targets.manage / attendance.read.all /
-- leave.manage capability, so those stay ADMIN+MANAGER only, matching
-- permissions.ts exactly.
-- ============================================================================

create or replace function public.erp_can_view_all_field()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.erp_users
    where auth_user_id = auth.uid() and active and role in ('ADMIN', 'MANAGER', 'VIEWER')
  );
$$;

revoke all on function public.erp_can_view_all_field() from public;
grant execute on function public.erp_can_view_all_field() to authenticated;

drop policy if exists erp_users_select on public.erp_users;
create policy erp_users_select on public.erp_users
  for select to authenticated
  using (auth_user_id = auth.uid() or public.erp_is_admin() or public.erp_can_view_all_field());

drop policy if exists erp_doctor_visits_select on public.erp_doctor_visits;
create policy erp_doctor_visits_select on public.erp_doctor_visits
  for select to authenticated
  using (mr_id = public.erp_current_user_id() or public.erp_can_view_all_field());

drop policy if exists erp_chemist_visits_select on public.erp_chemist_visits;
create policy erp_chemist_visits_select on public.erp_chemist_visits
  for select to authenticated
  using (mr_id = public.erp_current_user_id() or public.erp_can_view_all_field());

drop policy if exists erp_visit_products_select on public.erp_doctor_visit_products;
create policy erp_visit_products_select on public.erp_doctor_visit_products
  for select to authenticated
  using (exists (
    select 1 from public.erp_doctor_visits v
     where v.id = visit_id
       and (v.mr_id = public.erp_current_user_id() or public.erp_can_view_all_field())
  ));

drop policy if exists erp_field_orders_select on public.erp_field_orders;
create policy erp_field_orders_select on public.erp_field_orders
  for select to authenticated
  using (mr_id = public.erp_current_user_id() or public.erp_can_view_all_field());

drop policy if exists erp_field_order_items_select on public.erp_field_order_items;
create policy erp_field_order_items_select on public.erp_field_order_items
  for select to authenticated
  using (exists (
    select 1 from public.erp_field_orders o
     where o.id = field_order_id
       and (o.mr_id = public.erp_current_user_id() or public.erp_can_view_all_field())
  ));
