-- ============================================================================
-- Leave approval for HR becomes hierarchical too, same rule as Manager: only
-- an employee's own direct manager (erp_users.reports_to pointing at the
-- caller) may review their leave request — no blanket "any HR can approve
-- anyone" anymore. If HR3 reports to HR2 who reports to HR1 who reports to
-- Admin, then HR2 reviews HR3's leave, HR1 reviews HR2's, and Admin remains
-- the universal fallback (e.g. for someone whose manager is unavailable, or
-- who has no manager assigned at all) — exactly the same shape as the Sales
-- hierarchy (RSM -> MR) built in 20261023000001, just without the erp_is_hr()
-- bypass that let any HR skip the chain entirely.
--
-- Deliberately narrow, same as 20261023000001's own note: this does NOT
-- touch leave TYPE management, company-wide leave BALANCE editing, or
-- adminCreateLeave ("create leave on behalf of") — those stay admin/HR-only
-- (leave.manage), unchanged, since they're company-wide administrative
-- config/actions, not "who gets to approve this specific pending request".
-- Every other erp_is_hr() blanket (attendance, payroll, offer letters, leave
-- policy rules, travel/dearness allowance, ...) is untouched; this migration
-- only touches the two leave-request-review call sites.
-- ============================================================================

-- Full body from 20261023000001_manager_direct_reports.sql (the latest),
-- minus erp_is_hr() from the authorization check.
create or replace function public.erp_review_leave_request(
  p_leave_id      uuid,
  p_status        public.erp_leave_status,
  p_admin_remarks text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.erp_leave_requests%rowtype;
  v_tracks  boolean;
  v_days    numeric(5,1);
  v_year    integer;
  v_is_my_report boolean;
begin
  if p_status not in ('APPROVED', 'REJECTED', 'CANCELLED') then
    raise exception 'A review must set the request to Approved, Rejected or Cancelled';
  end if;

  select * into v_row from public.erp_leave_requests where id = p_leave_id for update;
  if not found then
    raise exception 'Leave request not found';
  end if;

  -- Admin can review anyone's request. Otherwise, only that employee's own
  -- manager (their reports_to pointing at the caller) may — whether that
  -- manager's role is MANAGER or HR makes no difference here.
  select exists (
    select 1 from public.erp_users u
     where u.id = v_row.employee_id and u.reports_to = public.erp_current_user_id()
  ) into v_is_my_report;

  if not (public.erp_is_admin() or v_is_my_report) then
    raise exception 'You are not authorised to review this leave request'
      using errcode = 'insufficient_privilege';
  end if;

  update public.erp_leave_requests
     set status = p_status, admin_remarks = p_admin_remarks,
         reviewed_by = public.erp_current_user_id(), reviewed_at = now()
   where id = p_leave_id;

  -- Only a genuine transition into/out of APPROVED moves the balance — this
  -- must never double-deduct or double-refund.
  if p_status = 'APPROVED' and v_row.status <> 'APPROVED' then
    select lt.tracks_balance into v_tracks from public.erp_leave_types lt where lt.id = v_row.leave_type_id;
    if v_tracks then
      v_days := (v_row.to_date - v_row.from_date + 1);
      v_year := extract(year from v_row.from_date);
      insert into public.erp_leave_balances (employee_id, leave_type_id, year, used)
      values (v_row.employee_id, v_row.leave_type_id, v_year, v_days)
      on conflict (employee_id, leave_type_id, year)
      do update set used = public.erp_leave_balances.used + v_days;
    end if;
  elsif p_status <> 'APPROVED' and v_row.status = 'APPROVED' then
    select lt.tracks_balance into v_tracks from public.erp_leave_types lt where lt.id = v_row.leave_type_id;
    if v_tracks then
      v_days := (v_row.to_date - v_row.from_date + 1);
      v_year := extract(year from v_row.from_date);
      update public.erp_leave_balances
         set used = greatest(0, used - v_days)
       where employee_id = v_row.employee_id and leave_type_id = v_row.leave_type_id and year = v_year;
    end if;
  end if;

  if p_status = 'APPROVED' then
    perform public.erp_apply_leave_to_attendance(v_row.employee_id, v_row.from_date, v_row.to_date, 'Approved leave');
  end if;

  return jsonb_build_object('leave_id', p_leave_id, 'status', p_status);
end;
$$;

-- Full body from 20261023000001_manager_direct_reports.sql (the latest),
-- minus erp_is_hr() — an HR employee now sees their own direct reports'
-- requests here the same way a manager does, not every request company-wide.
drop policy if exists erp_leave_requests_select on public.erp_leave_requests;
create policy erp_leave_requests_select on public.erp_leave_requests
  for select to authenticated
  using (
    employee_id = public.erp_current_user_id()
    or public.erp_is_admin()
    or exists (
      select 1 from public.erp_users u
       where u.id = erp_leave_requests.employee_id and u.reports_to = public.erp_current_user_id()
    )
  );
