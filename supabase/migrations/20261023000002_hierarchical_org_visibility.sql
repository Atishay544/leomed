-- ============================================================================
-- Hierarchical org-wide visibility, replacing "every MANAGER sees the whole
-- company" with "a manager sees their own org subtree" — everyone below
-- them in the erp_users.reports_to chain, however many levels deep (MR ->
-- Territory Sales Manager -> Area Sales Manager -> Regional Sales Manager
-- -> State Sales Manager -> Chief Sales Officer, or any other shape the
-- business sets up by editing "Reports to" on Staff).
--
-- Mechanism: a new recursive helper, erp_is_in_my_org(employee_id), walks
-- reports_to downward from the calling user and answers "is this employee
-- anywhere under me". erp_can_read_all_field() / erp_can_view_all_field()
-- (previously: role in ('ADMIN','MANAGER') / ('ADMIN','MANAGER','VIEWER'))
-- are narrowed to drop MANAGER — ADMIN keeps seeing everything (unchanged),
-- VIEWER keeps seeing everything (unchanged, not part of this request), and
-- every RLS policy that used to OR in one of those two now ALSO ORs in
-- erp_is_in_my_org(<row's owning employee column>) alongside it. The net
-- effect for a manager: their own row, plus everyone under them — nothing
-- else.
--
-- HR is untouched: erp_is_hr() is a separate, already-existing bypass on
-- attendance and leave that this migration does not touch, and HR's
-- existing leave.manage is already unrestricted/company-wide, which
-- already covers an HR hierarchy (Associate HR reporting to Senior HR)
-- without needing this mechanism.
--
-- Every SECURITY INVOKER reporting function (erp_dashboard_summary,
-- erp_mr_performance, erp_territory_performance, erp_area_performance,
-- erp_product_performance, erp_distributor_performance, erp_doctor_
-- performance, erp_chemist_performance, erp_order_invoice_conversion, and
-- others in that cluster) queries erp_users/erp_doctor_visits/
-- erp_chemist_visits/erp_field_orders/erp_attendance directly and relies
-- on THEIR RLS for scoping (that's what "security invoker" means here) —
-- so fixing those five tables' policies automatically and correctly scopes
-- every one of those reports too. None of them need their own edit.
-- ============================================================================

-- Cycle-guarded: nothing currently stops an admin from accidentally setting
-- up a reports_to loop in the Staff form (A reports to B, B reports to A),
-- and an unguarded recursive CTE would hang forever on one. The `path`
-- array refuses to revisit an id already walked, which bounds this to at
-- most one pass over erp_users regardless.
create or replace function public.erp_is_in_my_org(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    with recursive descendants as (
      select id, array[id] as path
        from public.erp_users
       where reports_to = public.erp_current_user_id()
      union all
      select u.id, d.path || u.id
        from public.erp_users u
        join descendants d on u.reports_to = d.id
       where not (u.id = any(d.path))
    )
    select 1 from descendants where id = p_employee_id
  );
$$;

revoke all on function public.erp_is_in_my_org(uuid) from public;
grant execute on function public.erp_is_in_my_org(uuid) to authenticated;

-- Admin only now — a manager's "sees everyone" is replaced by
-- erp_is_in_my_org() at each call site below.
create or replace function public.erp_can_read_all_field()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.erp_users
    where auth_user_id = auth.uid() and active and role = 'ADMIN'
  );
$$;

-- Admin + Viewer only now — Viewer's blanket read access is unchanged and
-- not part of this request; Manager's is replaced the same way as above.
create or replace function public.erp_can_view_all_field()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.erp_users
    where auth_user_id = auth.uid() and active and role in ('ADMIN', 'VIEWER')
  );
$$;

-- ─── erp_users ───────────────────────────────────────────────────────────────
-- Full body from 20260918000006_hr_role.sql (the latest), plus org-subtree
-- visibility — a manager can see the staff directory rows for people under
-- them (needed for e.g. the Staff list, lookups, dropdowns to resolve
-- sensibly for a manager, not just blanket-blocked).

drop policy if exists erp_users_select on public.erp_users;
create policy erp_users_select on public.erp_users
  for select to authenticated
  using (
    auth_user_id = auth.uid()
    or public.erp_is_admin() or public.erp_is_hr()
    or public.erp_can_view_all_field()
    or public.erp_is_in_my_org(id)
  );

-- ─── erp_doctor_visits / erp_chemist_visits ─────────────────────────────────
-- Full bodies from 20260907000007_viewer_read_all_visits_orders.sql (the
-- latest), plus org-subtree visibility.

drop policy if exists erp_doctor_visits_select on public.erp_doctor_visits;
create policy erp_doctor_visits_select on public.erp_doctor_visits
  for select to authenticated
  using (
    mr_id = public.erp_current_user_id()
    or public.erp_can_view_all_field()
    or public.erp_is_in_my_org(mr_id)
  );

drop policy if exists erp_chemist_visits_select on public.erp_chemist_visits;
create policy erp_chemist_visits_select on public.erp_chemist_visits
  for select to authenticated
  using (
    mr_id = public.erp_current_user_id()
    or public.erp_can_view_all_field()
    or public.erp_is_in_my_org(mr_id)
  );

-- ─── erp_doctor_visit_products (owner via parent visit) ─────────────────────

drop policy if exists erp_visit_products_select on public.erp_doctor_visit_products;
create policy erp_visit_products_select on public.erp_doctor_visit_products
  for select to authenticated
  using (
    exists (
      select 1 from public.erp_doctor_visits v
       where v.id = visit_id
         and (
           v.mr_id = public.erp_current_user_id()
           or public.erp_can_view_all_field()
           or public.erp_is_in_my_org(v.mr_id)
         )
    )
  );

-- ─── erp_field_orders ────────────────────────────────────────────────────────
-- Full bodies from 20260907000007 (select) and 20260905000004_erp_rls_
-- hardening.sql (update) — the latest for each — plus org-subtree
-- visibility, including for the UPDATE policy: a manager could already
-- edit (within the window) and change status on orders company-wide via
-- erp_can_read_all_field(); that's now scoped to their own org subtree
-- instead of dropped outright, matching orders.manage_status staying a
-- MANAGER capability.

drop policy if exists erp_field_orders_select on public.erp_field_orders;
create policy erp_field_orders_select on public.erp_field_orders
  for select to authenticated
  using (
    mr_id = public.erp_current_user_id()
    or public.erp_can_view_all_field()
    or public.erp_is_in_my_org(mr_id)
  );

drop policy if exists erp_field_orders_update on public.erp_field_orders;
create policy erp_field_orders_update on public.erp_field_orders
  for update to authenticated
  using (
    public.erp_can_read_all_field()
    or public.erp_is_in_my_org(mr_id)
    or (mr_id = public.erp_current_user_id() and public.erp_within_edit_window(created_at))
  )
  with check (
    public.erp_can_read_all_field()
    or public.erp_is_in_my_org(mr_id)
    or (mr_id = public.erp_current_user_id() and public.erp_within_edit_window(created_at))
  );

-- erp_set_field_order_status() is the only path that can change `status`
-- (the column isn't in the direct grant — see 20260905000004's own note).
-- It bypasses RLS (SECURITY DEFINER) so it re-checks for itself; now looks
-- up the order's own mr_id first so it can ask erp_is_in_my_org() the same
-- question the RLS policies above do.
create or replace function public.erp_set_field_order_status(
  p_order_id uuid,
  p_status   public.erp_field_order_status,
  p_remarks  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mr_id uuid;
begin
  select mr_id into v_mr_id from public.erp_field_orders where id = p_order_id;
  if not found then
    raise exception 'Field order not found';
  end if;

  if not (public.erp_can_read_all_field() or public.erp_is_in_my_org(v_mr_id)) then
    raise exception 'Only an administrator, or a manager overseeing this order''s MR, may change a field order''s status'
      using errcode = 'insufficient_privilege';
  end if;

  update public.erp_field_orders
     set status     = p_status,
         remarks    = coalesce(nullif(trim(coalesce(p_remarks, '')), ''), remarks),
         updated_by = public.erp_current_user_id()
   where id = p_order_id;
end;
$$;

-- ─── erp_field_order_items (owner via parent order) ─────────────────────────

drop policy if exists erp_field_order_items_select on public.erp_field_order_items;
create policy erp_field_order_items_select on public.erp_field_order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.erp_field_orders o
       where o.id = field_order_id
         and (
           o.mr_id = public.erp_current_user_id()
           or public.erp_can_view_all_field()
           or public.erp_is_in_my_org(o.mr_id)
         )
    )
  );

-- ─── erp_attendance ──────────────────────────────────────────────────────────
-- Full body from 20260918000006_hr_role.sql (the latest) plus org-subtree
-- visibility. erp_is_hr() is untouched — HR keeps seeing everyone's
-- attendance regardless, same as before this migration.

drop policy if exists erp_attendance_select on public.erp_attendance;
create policy erp_attendance_select on public.erp_attendance
  for select to authenticated
  using (
    employee_id = public.erp_current_user_id()
    or public.erp_is_hr()
    or public.erp_can_read_all_field()
    or public.erp_is_in_my_org(employee_id)
  );

-- ─── erp_followups ───────────────────────────────────────────────────────────

drop policy if exists erp_followups_select on public.erp_followups;
create policy erp_followups_select on public.erp_followups
  for select to authenticated
  using (
    mr_id = public.erp_current_user_id()
    or public.erp_can_read_all_field()
    or public.erp_is_in_my_org(mr_id)
  );

drop policy if exists erp_followups_update on public.erp_followups;
create policy erp_followups_update on public.erp_followups
  for update to authenticated
  using (
    mr_id = public.erp_current_user_id()
    or public.erp_can_read_all_field()
    or public.erp_is_in_my_org(mr_id)
  )
  with check (
    mr_id = public.erp_current_user_id()
    or public.erp_can_read_all_field()
    or public.erp_is_in_my_org(mr_id)
  );

-- ─── erp_targets ─────────────────────────────────────────────────────────────

drop policy if exists erp_targets_select on public.erp_targets;
create policy erp_targets_select on public.erp_targets
  for select to authenticated
  using (
    mr_id = public.erp_current_user_id()
    or public.erp_can_read_all_field()
    or public.erp_is_in_my_org(mr_id)
  );
