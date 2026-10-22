-- ============================================================================
-- Dearness Allowance, for an MR, ALSO varies by area — same mechanism as
-- Travel Allowance already uses (rate lives on erp_areas, auto-detected
-- daily from doctor/chemist visits, summed across distinct areas visited,
-- HR-reviewed before it reaches payroll). The flat per-employee DA added in
-- 20260924000002/20261022000001 stays as-is for employees DA doesn't vary
-- by area for (every non-MR, and any MR with no per-area DA configured) —
-- both sources are additive, same pattern already used for TA.
--
-- erp_mr_travel_allowance keeps its name (renaming it would touch RLS
-- policies, PostgREST embed names, and every reference across the app for
-- a cosmetic win only) but now carries both figures per MR per day:
-- computed_ta_amount/approved_ta_amount (renamed from computed_amount/
-- approved_amount — plain data rename, no values lost) and the new
-- computed_da_amount/approved_da_amount alongside them. One review
-- decision per day still covers both — the admin is looking at the same
-- areas and the same context either way, not two separate questions.
-- ============================================================================

alter table public.erp_areas
  add column if not exists daily_dearness_allowance numeric(10,2)
    check (daily_dearness_allowance is null or daily_dearness_allowance > 0);

alter table public.erp_mr_travel_allowance
  rename column computed_amount to computed_ta_amount;
alter table public.erp_mr_travel_allowance
  rename column approved_amount to approved_ta_amount;

alter table public.erp_mr_travel_allowance
  add column if not exists computed_da_amount numeric(10,2) not null default 0 check (computed_da_amount >= 0),
  add column if not exists approved_da_amount  numeric(10,2) check (approved_da_amount is null or approved_da_amount >= 0);

-- Full body from 20260921000001_mr_travel_allowance.sql (the only — never
-- redefined until now), broadened to pick up an area with EITHER rate set
-- (previously only daily_travel_allowance was checked), and computing both
-- sums. detected_areas keeps its existing 'rate' key (now unambiguously the
-- TA rate, matching computed_ta_amount) and gains 'da_rate' alongside it.
create or replace function public.erp_compute_daily_travel_allowance(p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_processed integer := 0;
  r record;
begin
  for r in
    select
      combined.mr_id,
      sum(coalesce(combined.ta_rate, 0)) as total_ta,
      sum(coalesce(combined.da_rate, 0)) as total_da,
      jsonb_agg(
        jsonb_build_object(
          'area_id', combined.area_id, 'area_name', combined.area_name,
          'rate', combined.ta_rate, 'da_rate', combined.da_rate
        )
        order by combined.area_name
      ) as areas_json
    from (
      select distinct v.mr_id, a.id as area_id, a.name as area_name,
             a.daily_travel_allowance as ta_rate, a.daily_dearness_allowance as da_rate
        from public.erp_doctor_visits v
        join public.erp_doctors d on d.id = v.doctor_id
        join public.erp_areas a on a.id = d.area_id
       where v.visit_date = p_date
         and (
           (a.daily_travel_allowance is not null and a.daily_travel_allowance > 0)
           or (a.daily_dearness_allowance is not null and a.daily_dearness_allowance > 0)
         )
      union
      select distinct v.mr_id, a.id as area_id, a.name as area_name,
             a.daily_travel_allowance as ta_rate, a.daily_dearness_allowance as da_rate
        from public.erp_chemist_visits v
        join public.erp_chemists c on c.id = v.chemist_id
        join public.erp_areas a on a.id = c.area_id
       where v.visit_date = p_date
         and (
           (a.daily_travel_allowance is not null and a.daily_travel_allowance > 0)
           or (a.daily_dearness_allowance is not null and a.daily_dearness_allowance > 0)
         )
    ) combined
    group by combined.mr_id
  loop
    -- Only ever (re)computes a PENDING row — a day HR has already approved
    -- or rejected is never overwritten just because a visit for that day
    -- was added or edited afterward.
    insert into public.erp_mr_travel_allowance (
      mr_id, allowance_date, detected_areas, computed_ta_amount, computed_da_amount, status
    )
    values (r.mr_id, p_date, r.areas_json, r.total_ta, r.total_da, 'PENDING')
    on conflict (mr_id, allowance_date) do update
       set detected_areas     = excluded.detected_areas,
           computed_ta_amount = excluded.computed_ta_amount,
           computed_da_amount = excluded.computed_da_amount,
           updated_at         = now()
     where public.erp_mr_travel_allowance.status = 'PENDING';

    v_processed := v_processed + 1;
  end loop;

  return jsonb_build_object('date', p_date, 'mrs_processed', v_processed);
end;
$$;

-- Full body from 20261022000001_universal_ta_da_and_offer_allowances.sql
-- (the latest), plus a second source for Dearness Allowance: this MR's
-- APPROVED per-area amounts, summed into the same dearness_allowance total
-- the flat per-employee rate already feeds — same additive pattern as
-- travel_allowance already uses for its two sources.
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

  v_travel_allowance   := v_area_travel_allowance + v_flat_travel_allowance;
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
