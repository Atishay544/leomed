-- ============================================================================
-- Ad-hoc Travel Allowance — for a non-field employee (e.g. a Manager) the
-- company occasionally sends somewhere for a few days. Neither existing TA
-- source fits this:
--   - The per-area, auto-detected source (erp_mr_travel_allowance) only
--     makes sense for an MR who logs doctor/chemist visits.
--   - The flat daily_travel_allowance on erp_employee_salary pays EVERY day
--     actually worked, continuously — wrong for someone who travels for
--     one specific trip, not as a standing part of the job.
--
-- So: admin picks the employee, the date range of the trip, and a daily
-- rate — a direct decision, not an inference, so (like Company Expenses)
-- it needs no separate review step. Only days within that range the
-- employee was actually present (or half-day, at half rate) earn it, same
-- "days actually worked" basis as every other allowance here.
--
-- Flights, hotels and other trip costs are NOT this — those go through
-- Expenses -> Record company expense, same as any other company spend.
-- This is only the day-rate allowance itself, a THIRD additive source
-- feeding the same travel_allowance payslip line as the other two.
-- ============================================================================

create table if not exists public.erp_employee_travel_days (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.erp_users(id) on delete cascade,
  from_date     date not null,
  to_date       date not null,
  daily_amount  numeric(10,2) not null check (daily_amount > 0),
  purpose       text,
  created_by    uuid references public.erp_users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint erp_employee_travel_days_valid_range check (to_date >= from_date)
);

create index if not exists erp_employee_travel_days_employee_idx
  on public.erp_employee_travel_days (employee_id, from_date desc);

drop trigger if exists erp_employee_travel_days_touch on public.erp_employee_travel_days;
create trigger erp_employee_travel_days_touch before update on public.erp_employee_travel_days
  for each row execute function public.erp_touch_updated_at();

drop trigger if exists erp_employee_travel_days_audit on public.erp_employee_travel_days;
create trigger erp_employee_travel_days_audit
  after insert or update or delete on public.erp_employee_travel_days
  for each row execute function public.erp_audit_trigger();

alter table public.erp_employee_travel_days enable row level security;

-- An employee can see their own trips (transparency — "why is my pay what
-- it is"), never write them. Only admin/HR assigns one.
drop policy if exists erp_employee_travel_days_select on public.erp_employee_travel_days;
create policy erp_employee_travel_days_select on public.erp_employee_travel_days
  for select to authenticated
  using (employee_id = public.erp_current_user_id() or public.erp_is_admin() or public.erp_is_hr());

drop policy if exists erp_employee_travel_days_write on public.erp_employee_travel_days;
create policy erp_employee_travel_days_write on public.erp_employee_travel_days
  for all to authenticated
  using (public.erp_is_admin() or public.erp_is_hr())
  with check (public.erp_is_admin() or public.erp_is_hr());

-- Full body from 20261022000002_area_dearness_allowance.sql (the latest),
-- plus a third, additive source for travel_allowance: ad-hoc trip days
-- actually worked, within the current payroll period.
create or replace function public.erp_recalculate_payroll_record(p_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r                          record;
  v_period_start             date;
  v_period_end               date;
  v_days_in_month            integer;
  v_present                  integer := 0;
  v_half                     integer := 0;
  v_absent                   integer := 0;
  v_holiday                  integer := 0;
  v_weekoff                  integer := 0;
  v_paid_leave               integer := 0;
  v_unpaid_leave             integer := 0;
  v_payable                  numeric(6,2);
  v_incentives               numeric(12,2) := 0;
  v_bonus                    numeric(12,2) := 0;
  v_other                    numeric(12,2) := 0;
  v_adhoc_deduction          numeric(12,2) := 0;
  v_area_travel_allowance    numeric(12,2) := 0;
  v_flat_travel_allowance    numeric(12,2) := 0;
  v_tripday_travel_allowance numeric(12,2) := 0;
  v_travel_allowance         numeric(12,2) := 0;
  v_area_dearness_allowance  numeric(12,2) := 0;
  v_flat_dearness_allowance  numeric(12,2) := 0;
  v_dearness_allowance       numeric(12,2) := 0;
  v_prorated_fixed           numeric(12,2);
  v_lop_deduction            numeric(12,2);
  v_net                      numeric(12,2);
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

  -- Source 1 for each: HR-reviewed, per-area, MR-only.
  select coalesce(sum(approved_ta_amount), 0), coalesce(sum(approved_da_amount), 0)
    into v_area_travel_allowance, v_area_dearness_allowance
    from public.erp_mr_travel_allowance
   where mr_id = r.employee_id
     and allowance_date between v_period_start and v_period_end
     and status = 'APPROVED';

  -- Source 2 for each: flat per-day rate, any employee, no review step —
  -- same "days actually worked" basis. For a non-MR employee source 1 is
  -- always 0, so this is effectively their only allowance of either kind.
  v_flat_travel_allowance   := round(coalesce(r.daily_travel_allowance, 0)   * (v_present + v_half * 0.5), 2);
  v_flat_dearness_allowance := round(coalesce(r.daily_dearness_allowance, 0) * (v_present + v_half * 0.5), 2);

  -- Source 3, travel allowance only: ad-hoc trip days admin assigned
  -- directly (erp_employee_travel_days) — a day earns it only if it both
  -- falls inside the assigned trip range AND was actually worked.
  select coalesce(sum(
           td.daily_amount * case a.attendance_status when 'HALF_DAY' then 0.5 else 1 end
         ), 0)
    into v_tripday_travel_allowance
    from public.erp_employee_travel_days td
    join public.erp_attendance a
      on a.employee_id = td.employee_id
     and a.date between greatest(td.from_date, v_period_start) and least(td.to_date, v_period_end)
     and a.attendance_status in ('PRESENT', 'PRESENT_WITH_EXCEPTION', 'HALF_DAY')
   where td.employee_id = r.employee_id
     and td.from_date <= v_period_end
     and td.to_date >= v_period_start;

  v_travel_allowance   := v_area_travel_allowance + v_flat_travel_allowance + v_tripday_travel_allowance;
  v_dearness_allowance := v_area_dearness_allowance + v_flat_dearness_allowance;

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
