-- Loss-of-Pay deduction as an explicit, visible figure on the payslip.
--
-- The math is not new: unpaid_leave_days and absent_days were already
-- excluded from payable_days, so they already reduced net_salary via the
-- prorated fixed-salary calculation — that part of erp_recalculate_
-- payroll_record() is untouched. What's new is naming that shortfall: it's
-- computed as the DIFFERENCE between the full fixed salary and the prorated
-- amount, rather than independently from the day counts, specifically so it
-- always reconciles exactly with net_salary even if some day in the month
-- has no attendance row at all (a data gap, not a leave/absence) — the
-- deduction line will never disagree with the number it's explaining.
--
-- Bundles unpaid leave AND unauthorised absence into one "Loss of Pay"
-- figure, matching how the business itself describes it (both are days
-- nobody gets paid for) rather than splitting them into two payslip lines.

alter table public.erp_payroll_records
  add column if not exists lop_deduction_amount numeric(12,2) not null default 0 check (lop_deduction_amount >= 0);

-- Full body from 20260907000011_payroll_bonus_item_type.sql (the latest —
-- with bonus), plus lop_deduction_amount.
create or replace function public.erp_recalculate_payroll_record(p_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r                 record;
  v_period_start    date;
  v_period_end      date;
  v_days_in_month   integer;
  v_present         integer := 0;
  v_half            integer := 0;
  v_absent          integer := 0;
  v_holiday         integer := 0;
  v_weekoff         integer := 0;
  v_paid_leave      integer := 0;
  v_unpaid_leave    integer := 0;
  v_payable         numeric(6,2);
  v_incentives      numeric(12,2) := 0;
  v_bonus           numeric(12,2) := 0;
  v_other           numeric(12,2) := 0;
  v_adhoc_deduction numeric(12,2) := 0;
  v_prorated_fixed  numeric(12,2);
  v_lop_deduction   numeric(12,2);
  v_net             numeric(12,2);
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

  v_prorated_fixed := round((r.fixed_salary / nullif(v_days_in_month, 0)) * v_payable, 2);
  -- The full-vs-prorated gap IS the Loss of Pay figure — derived this way
  -- (not independently from unpaid_leave_days/absent_days) so it can never
  -- disagree with what net_salary below actually pays out.
  v_lop_deduction := greatest(0, round(r.fixed_salary - v_prorated_fixed, 2));

  v_net := round(
    v_prorated_fixed + v_incentives + v_bonus + v_other - (r.standard_deductions + v_adhoc_deduction)
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
         net_salary            = coalesce(v_net, 0)
   where id = p_record_id;
end;
$$;
