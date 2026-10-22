-- ============================================================================
-- A Manager can review leave requests for the employees who report to them
-- (erp_users.reports_to) — e.g. a Regional Sales Manager sanctioning leave
-- for "their" 2 MRs, while the manager's own leave is still sanctioned by
-- admin directly (reports_to = the admin, but admin already bypasses this
-- scoping entirely via erp_is_admin()).
--
-- Deliberately narrow: this does NOT give a manager erp_leave_requests write
-- access generally, leave TYPE management, or company-wide leave BALANCE
-- editing — those stay admin/HR only (leave.manage), unchanged. A manager
-- gets a new, separate capability (leave.manage_team, added in
-- lib/erp/permissions.ts) that only ever lets them review a request whose
-- employee reports to them — enforced here, in the database, not just by
-- which page the app happens to show them.
--
-- Expense approval is NOT part of this — expenses.manage stays admin-only,
-- unchanged, per an explicit instruction that flights/hotels/other costs
-- are approved by admin for every employee regardless of who manages them.
-- ============================================================================

create index if not exists erp_users_reports_to_idx on public.erp_users (reports_to);

-- Full body from 20260918000008_leave_balances.sql (the only — never
-- redefined since). The row is now fetched BEFORE the authorization check
-- (it used to be fetched after), since the check needs to know who the
-- request belongs to.
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

  -- Admin/HR can review anyone's request. Otherwise, only that employee's
  -- own manager (their reports_to pointing at the caller) may.
  select exists (
    select 1 from public.erp_users u
     where u.id = v_row.employee_id and u.reports_to = public.erp_current_user_id()
  ) into v_is_my_report;

  if not (public.erp_is_admin() or public.erp_is_hr() or v_is_my_report) then
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

-- Full body from 20260918000006_hr_role.sql (the latest), plus a manager
-- seeing requests from their own direct reports alongside their own.
drop policy if exists erp_leave_requests_select on public.erp_leave_requests;
create policy erp_leave_requests_select on public.erp_leave_requests
  for select to authenticated
  using (
    employee_id = public.erp_current_user_id()
    or public.erp_is_admin() or public.erp_is_hr()
    or exists (
      select 1 from public.erp_users u
       where u.id = erp_leave_requests.employee_id and u.reports_to = public.erp_current_user_id()
    )
  );
