-- ============================================================================
-- Dearness Allowance (DA) — a fixed per-day amount for each day an employee
-- actually worked, at whatever rate is set for THAT employee (e.g. MR1 ₹150/
-- day, MR2 ₹300/day — a flat number, not tied to area/territory the way
-- Travel Allowance is).
--
-- Design:
--   - Rate lives on erp_employee_salary (daily_dearness_allowance), right
--     next to fixed_salary/standard_deductions — it's a salary-structure
--     setting, admin edits it the same way. Null means "no DA for this
--     employee", not ₹0.
--   - "Actually worked" = PRESENT/PRESENT_WITH_EXCEPTION days, HALF_DAY at
--     0.5 — the exact same day-count erp_recalculate_payroll_record() already
--     uses everywhere else (v_present/v_half), so DA never disagrees with
--     what the payslip's own attendance section says. Leave, holidays and
--     week-offs are paid but nobody "worked" them, so they earn no DA.
--   - No separate review step, unlike Travel Allowance: DA's day-count comes
--     straight from attendance, which is already the reviewed, authoritative
--     number LOP is calculated from — there is nothing here that needs a
--     second HR sign-off.
--   - Snapshotted onto erp_payroll_records at generation time (the rate, per
--     the historical-payslip guarantee — a later change to an employee's DA
--     rate never alters a month already generated), same treatment as
--     fixed_salary/standard_deductions.
-- ============================================================================

alter table public.erp_employee_salary
  add column if not exists daily_dearness_allowance numeric(10,2)
    check (daily_dearness_allowance is null or daily_dearness_allowance > 0);

alter table public.erp_payroll_records
  add column if not exists daily_dearness_allowance numeric(10,2),
  add column if not exists dearness_allowance numeric(12,2) not null default 0 check (dearness_allowance >= 0);

-- Full body from 20260918000006_hr_role.sql (the latest), plus snapshotting
-- daily_dearness_allowance alongside the rest of the salary structure.
create or replace function public.erp_generate_payroll_period(p_year integer, p_month integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_id uuid;
  v_status    public.erp_payroll_status;
  v_record_id uuid;
  v_created   integer := 0;
  v_updated   integer := 0;
  v_fixed     numeric(12,2);
  v_basic     numeric(12,2);
  v_gross     numeric(12,2);
  v_allow     numeric(12,2);
  v_stddeduct numeric(12,2);
  v_da_rate   numeric(10,2);
  r           record;
begin
  if not (public.erp_is_admin() or public.erp_is_hr()) then
    raise exception 'Only an administrator or HR can generate payroll' using errcode = 'insufficient_privilege';
  end if;
  if p_month < 1 or p_month > 12 then
    raise exception 'Enter a valid month';
  end if;

  select id, status into v_period_id, v_status
    from public.erp_payroll_periods
   where period_year = p_year and period_month = p_month
   for update;

  if v_period_id is not null and v_status in ('FINALIZED', 'PAID') then
    raise exception 'This payroll period is already finalized. Reopen it before recalculating.';
  end if;

  if v_period_id is null then
    insert into public.erp_payroll_periods (period_year, period_month, status)
    values (p_year, p_month, 'CALCULATED')
    returning id into v_period_id;
  else
    update public.erp_payroll_periods set status = 'CALCULATED' where id = v_period_id;
  end if;

  for r in
    select u.id as employee_id, u.name, u.role, u.department, u.designation
      from public.erp_users u
     where u.active and u.role <> 'ADMIN'
  loop
    select fixed_salary, basic_salary, gross_salary, allowances, standard_deductions, daily_dearness_allowance
      into v_fixed, v_basic, v_gross, v_allow, v_stddeduct, v_da_rate
      from public.erp_employee_salary where employee_id = r.employee_id;

    v_fixed     := coalesce(v_fixed, 0);
    v_basic     := coalesce(v_basic, 0);
    v_gross     := coalesce(v_gross, 0);
    v_allow     := coalesce(v_allow, 0);
    v_stddeduct := coalesce(v_stddeduct, 0);

    select id into v_record_id
      from public.erp_payroll_records
     where payroll_period_id = v_period_id and employee_id = r.employee_id
     for update;

    if v_record_id is null then
      insert into public.erp_payroll_records (
        payroll_period_id, employee_id, employee_name, designation, job_title, department,
        fixed_salary, basic_salary, gross_salary, allowances, standard_deductions, daily_dearness_allowance
      ) values (
        v_period_id, r.employee_id, r.name, r.role::text, r.designation, r.department,
        v_fixed, v_basic, v_gross, v_allow, v_stddeduct, v_da_rate
      )
      returning id into v_record_id;
      v_created := v_created + 1;
    else
      update public.erp_payroll_records
         set employee_name = r.name, designation = r.role::text, job_title = r.designation, department = r.department,
             fixed_salary = v_fixed, basic_salary = v_basic, gross_salary = v_gross,
             allowances = v_allow, standard_deductions = v_stddeduct, daily_dearness_allowance = v_da_rate
       where id = v_record_id;
      v_updated := v_updated + 1;
    end if;

    perform public.erp_recalculate_payroll_record(v_record_id);
  end loop;

  return jsonb_build_object('period_id', v_period_id, 'created', v_created, 'updated', v_updated);
end;
$$;

-- Full body from 20260921000001_mr_travel_allowance.sql (the latest), plus
-- dearness_allowance summed in as an additional earning.
create or replace function public.erp_recalculate_payroll_record(p_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r                  record;
  v_period_start     date;
  v_period_end       date;
  v_days_in_month    integer;
  v_present          integer := 0;
  v_half             integer := 0;
  v_absent           integer := 0;
  v_holiday          integer := 0;
  v_weekoff          integer := 0;
  v_paid_leave       integer := 0;
  v_unpaid_leave     integer := 0;
  v_payable          numeric(6,2);
  v_incentives       numeric(12,2) := 0;
  v_bonus            numeric(12,2) := 0;
  v_other            numeric(12,2) := 0;
  v_adhoc_deduction  numeric(12,2) := 0;
  v_travel_allowance numeric(12,2) := 0;
  v_dearness_allowance numeric(12,2) := 0;
  v_prorated_fixed   numeric(12,2);
  v_lop_deduction    numeric(12,2);
  v_net              numeric(12,2);
begin
  select pr.*, pp.period_year, pp.period_month, pp.status as period_status
    into r
    from public.erp_payroll_records pr
    join public.erp_payroll_periods pp on pp.id = pr.payroll_period_id
   where pr.id = p_record_id
   for update of pr;

  if not found then return; end if;
  if r.period_status in ('FINALIZED', 'PAID') then return; end if;

  v_period_start  := make_date(r.period_year, r.period_month, 1);
  v_period_end    := (v_period_start + interval '1 month - 1 day')::date;
  v_days_in_month := extract(day from v_period_end)::integer;

  select
    count(*) filter (where a.attendance_status in ('PRESENT', 'PRESENT_WITH_EXCEPTION')),
    count(*) filter (where a.attendance_status = 'HALF_DAY'),
    count(*) filter (where a.attendance_status = 'ABSENT'),
    count(*) filter (where a.attendance_status = 'HOLIDAY'),
    count(*) filter (where a.attendance_status = 'WEEK_OFF')
    into v_present, v_half, v_absent, v_holiday, v_weekoff
    from public.erp_attendance a
   where a.employee_id = r.employee_id
     and a.date between v_period_start and v_period_end;

  -- A LEAVE day is paid or unpaid according to the approved request that
  -- covers it — read from the leave type, never re-typed here.
  select
    count(*) filter (where lt.is_paid),
    count(*) filter (where lt.is_paid is not true)
    into v_paid_leave, v_unpaid_leave
    from public.erp_attendance a
    left join lateral (
      select lr.leave_type_id
        from public.erp_leave_requests lr
       where lr.employee_id = a.employee_id and lr.status = 'APPROVED'
         and a.date between lr.from_date and lr.to_date
       order by lr.created_at desc
       limit 1
    ) covering on true
    left join public.erp_leave_types lt on lt.id = covering.leave_type_id
   where a.employee_id = r.employee_id
     and a.date between v_period_start and v_period_end
     and a.attendance_status = 'LEAVE';

  v_payable := v_present + (v_half * 0.5) + v_paid_leave + v_holiday + v_weekoff;

  select coalesce(sum(amount) filter (where item_type = 'INCENTIVE'), 0),
         coalesce(sum(amount) filter (where item_type = 'BONUS'), 0),
         coalesce(sum(amount) filter (where item_type = 'OTHER_EARNING'), 0),
         coalesce(sum(amount) filter (where item_type = 'DEDUCTION'), 0)
    into v_incentives, v_bonus, v_other, v_adhoc_deduction
    from public.erp_payroll_items
   where payroll_record_id = p_record_id;

  select coalesce(sum(approved_amount), 0) into v_travel_allowance
    from public.erp_mr_travel_allowance
   where mr_id = r.employee_id
     and allowance_date between v_period_start and v_period_end
     and status = 'APPROVED';

  -- Priced at the rate snapshotted onto this record (not a live lookup on
  -- erp_employee_salary) — see the historical-payslip guarantee. Only days
  -- actually worked earn it: present days in full, a half day at 0.5, never
  -- leave/holiday/week-off even though those are paid.
  v_dearness_allowance := round(coalesce(r.daily_dearness_allowance, 0) * (v_present + v_half * 0.5), 2);

  v_prorated_fixed := round((r.fixed_salary / nullif(v_days_in_month, 0)) * v_payable, 2);
  -- The full-vs-prorated gap IS the Loss of Pay figure — derived this way
  -- (not independently from unpaid_leave_days/absent_days) so it can never
  -- disagree with what net_salary below actually pays out.
  v_lop_deduction := greatest(0, round(r.fixed_salary - v_prorated_fixed, 2));

  v_net := round(
    v_prorated_fixed + v_incentives + v_bonus + v_other + v_travel_allowance + v_dearness_allowance
    - (r.standard_deductions + v_adhoc_deduction)
  , 2);

  update public.erp_payroll_records
     set working_days          = v_days_in_month,
         present_days          = v_present,
         half_days             = v_half,
         paid_leave_days       = v_paid_leave,
         unpaid_leave_days     = v_unpaid_leave,
         absent_days           = v_absent,
         holiday_days          = v_holiday,
         week_off_days         = v_weekoff,
         payable_days          = v_payable,
         incentives            = v_incentives,
         bonus                 = v_bonus,
         other_earnings        = v_other,
         deductions            = r.standard_deductions + v_adhoc_deduction,
         lop_deduction_amount  = v_lop_deduction,
         travel_allowance      = v_travel_allowance,
         dearness_allowance    = v_dearness_allowance,
         net_salary            = coalesce(v_net, 0)
   where id = p_record_id;
end;
$$;
