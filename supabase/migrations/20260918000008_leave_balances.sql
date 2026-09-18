-- ============================================================================
-- Leave balances: per-employee, per-year quotas for Earned/Sick/Casual Leave
-- (and any future leave type HR chooses to track the same way), with actual
-- usage kept in sync as requests are approved/reversed.
--
-- Deliberately NOT touching every leave type: "Paid Leave", "Unpaid Leave"
-- and "Other" stay exactly as they are today (unlimited, no quota) — only a
-- leave type HR marks tracks_balance = true participates in the balance
-- system at all. Seeded true for Casual/Sick/Earned Leave below, since those
-- are the three the business actually runs a quota against; HR can flip the
-- flag on any other leave type later from Leave → Leave types.
-- ============================================================================

alter table public.erp_leave_types
  add column if not exists tracks_balance  boolean not null default false;
alter table public.erp_leave_types
  add column if not exists carries_forward boolean not null default false;

update public.erp_leave_types set tracks_balance = true
 where name in ('Casual Leave', 'Sick Leave', 'Earned Leave');

-- Only Earned Leave rolls into the next year unused — see
-- erp_leave_year_end_rollover() (20260918000009).
update public.erp_leave_types set carries_forward = true
 where name = 'Earned Leave';

create table if not exists public.erp_leave_balances (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.erp_users(id) on delete cascade,
  leave_type_id uuid not null references public.erp_leave_types(id) on delete cascade,
  year          integer not null check (year between 2000 and 2200),
  -- HR-set quota for this employee/type/year — includes any carried-forward
  -- Earned Leave from the previous year, folded in by the rollover function.
  allocated     numeric(5,1) not null default 0 check (allocated >= 0),
  -- Days consumed by APPROVED requests of this type in this year — kept in
  -- sync by erp_review_leave_request()/erp_admin_create_leave() as requests
  -- are approved or an approval is reversed. Never edited directly.
  used          numeric(5,1) not null default 0 check (used >= 0),
  updated_by    uuid references public.erp_users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint erp_leave_balances_unique unique (employee_id, leave_type_id, year)
);

create index if not exists erp_leave_balances_employee_idx on public.erp_leave_balances (employee_id, year);
create index if not exists erp_leave_balances_type_idx     on public.erp_leave_balances (leave_type_id);

drop trigger if exists erp_leave_balances_touch on public.erp_leave_balances;
create trigger erp_leave_balances_touch before update on public.erp_leave_balances
  for each row execute function public.erp_touch_updated_at();

drop trigger if exists erp_leave_balances_audit on public.erp_leave_balances;
create trigger erp_leave_balances_audit
  after insert or update or delete on public.erp_leave_balances
  for each row execute function public.erp_audit_trigger();

alter table public.erp_leave_balances enable row level security;

drop policy if exists erp_leave_balances_select on public.erp_leave_balances;
create policy erp_leave_balances_select on public.erp_leave_balances
  for select to authenticated
  using (employee_id = public.erp_current_user_id() or public.erp_is_admin() or public.erp_is_hr());

drop policy if exists erp_leave_balances_write on public.erp_leave_balances;
create policy erp_leave_balances_write on public.erp_leave_balances
  for all to authenticated
  using (public.erp_is_admin() or public.erp_is_hr())
  with check (public.erp_is_admin() or public.erp_is_hr());

-- ─── Keep `used` in sync with approvals ─────────────────────────────────────
-- Full bodies from 20260918000006_hr_role.sql (the latest — HR-aware)
-- with balance bookkeeping added. The day count attributes an entire
-- request to the calendar year of its from_date — a request spanning a
-- year boundary is a rare enough edge case that splitting it wasn't worth
-- the complexity; note it if it ever actually happens.

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
  v_row    public.erp_leave_requests%rowtype;
  v_tracks boolean;
  v_days   numeric(5,1);
  v_year   integer;
begin
  if not (public.erp_is_admin() or public.erp_is_hr()) then
    raise exception 'Only an administrator or HR can review leave requests'
      using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('APPROVED', 'REJECTED', 'CANCELLED') then
    raise exception 'A review must set the request to Approved, Rejected or Cancelled';
  end if;

  select * into v_row from public.erp_leave_requests where id = p_leave_id for update;
  if not found then
    raise exception 'Leave request not found';
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

create or replace function public.erp_admin_create_leave(
  p_employee_id   uuid,
  p_leave_type_id uuid,
  p_from_date     date,
  p_to_date       date,
  p_reason        text default null,
  p_status        public.erp_leave_status default 'APPROVED'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_tracks boolean;
  v_days   numeric(5,1);
  v_year   integer;
begin
  if not (public.erp_is_admin() or public.erp_is_hr()) then
    raise exception 'Only an administrator or HR can create leave for another employee'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.erp_leave_requests (
    employee_id, leave_type_id, from_date, to_date, reason, status,
    reviewed_by, reviewed_at
  ) values (
    p_employee_id, p_leave_type_id, p_from_date, p_to_date, p_reason, p_status,
    case when p_status <> 'PENDING' then public.erp_current_user_id() end,
    case when p_status <> 'PENDING' then now() end
  )
  returning id into v_id;

  if p_status = 'APPROVED' then
    select lt.tracks_balance into v_tracks from public.erp_leave_types lt where lt.id = p_leave_type_id;
    if v_tracks then
      v_days := (p_to_date - p_from_date + 1);
      v_year := extract(year from p_from_date);
      insert into public.erp_leave_balances (employee_id, leave_type_id, year, used)
      values (p_employee_id, p_leave_type_id, v_year, v_days)
      on conflict (employee_id, leave_type_id, year)
      do update set used = public.erp_leave_balances.used + v_days;
    end if;
    perform public.erp_apply_leave_to_attendance(p_employee_id, p_from_date, p_to_date, 'Approved leave');
  end if;

  return jsonb_build_object('leave_id', v_id, 'status', p_status);
end;
$$;
