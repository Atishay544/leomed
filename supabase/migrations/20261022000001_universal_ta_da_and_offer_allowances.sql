-- ============================================================================
-- Travel Allowance and Dearness Allowance, for EVERY employee, not just MRs —
-- a flat per-day rate set on erp_employee_salary (mirroring
-- daily_dearness_allowance exactly), settable at offer time and editable
-- anytime after on Payroll -> Salaries, same as DA already is.
--
-- Design:
--   - erp_mr_travel_allowance (per-area, auto-detected from doctor/chemist
--     visits, HR-reviewed) is untouched — that mechanism only makes sense
--     for an MR who actually travels to areas. This is a SEPARATE, additive
--     source: any employee, no review step, same "days actually worked"
--     basis DA already uses (present days in full, half day at 0.5, never
--     leave/holiday/week-off).
--   - Both sources land on the SAME payslip line (erp_payroll_records.
--     travel_allowance) rather than two separate "Travel Allowance" rows —
--     for a non-MR employee the area-based side is always 0 (they have no
--     area visits), so this is effectively the only source for them; for an
--     MR who also has HR-approved area trips, both add up, same as a real
--     payslip would show one total.
--   - Settable on the offer letter (erp_offer_letters.daily_travel_allowance/
--     daily_dearness_allowance), seeded onto erp_employee_salary the moment
--     the offer is converted to an employee — see convertOfferToEmployee()
--     in lib/erp/actions/offers.ts (app layer, no migration needed there).
--   - Snapshotted onto erp_payroll_records at generation time, same
--     historical-payslip guarantee as every other salary-structure figure.
-- ============================================================================

alter table public.erp_employee_salary
  add column if not exists daily_travel_allowance numeric(10,2)
    check (daily_travel_allowance is null or daily_travel_allowance > 0);

alter table public.erp_offer_letters
  add column if not exists daily_travel_allowance numeric(10,2)
    check (daily_travel_allowance is null or daily_travel_allowance > 0),
  add column if not exists daily_dearness_allowance numeric(10,2)
    check (daily_dearness_allowance is null or daily_dearness_allowance > 0);

alter table public.erp_payroll_records
  add column if not exists daily_travel_allowance numeric(10,2);

-- Full body from 20260918000010_offer_letter_leave_entitlement.sql (the
-- latest), plus the two new allowance fields on both the insert and update
-- branches.
create or replace function public.erp_save_offer_letter(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor       uuid;
  v_offer_id    uuid;
  v_offer_number text;
  v_component   jsonb;
  v_id          uuid;
begin
  if not (public.erp_is_admin() or public.erp_is_hr()) then
    raise exception 'Only an administrator or HR may manage offer letters'
      using errcode = 'insufficient_privilege';
  end if;
  v_actor := public.erp_current_user_id();
  v_id := nullif(p_payload->>'id', '')::uuid;

  if v_id is not null then
    update public.erp_offer_letters set
      candidate_name    = p_payload->>'candidate_name',
      candidate_address = nullif(p_payload->>'candidate_address', ''),
      candidate_email   = nullif(p_payload->>'candidate_email', ''),
      candidate_phone   = nullif(p_payload->>'candidate_phone', ''),
      designation       = p_payload->>'designation',
      role              = (p_payload->>'role')::public.erp_role,
      department        = nullif(p_payload->>'department', ''),
      territory         = nullif(p_payload->>'territory', ''),
      reports_to        = nullif(p_payload->>'reports_to', '')::uuid,
      offer_date        = coalesce(nullif(p_payload->>'offer_date', '')::date, offer_date),
      joining_date      = nullif(p_payload->>'joining_date', '')::date,
      incentive_terms   = nullif(p_payload->>'incentive_terms', ''),
      remarks           = nullif(p_payload->>'remarks', ''),
      annual_el_days    = coalesce((p_payload->>'annual_el_days')::numeric, 0),
      annual_sl_days    = coalesce((p_payload->>'annual_sl_days')::numeric, 0),
      annual_cl_days    = coalesce((p_payload->>'annual_cl_days')::numeric, 0),
      daily_travel_allowance   = nullif(p_payload->>'daily_travel_allowance', '')::numeric,
      daily_dearness_allowance = nullif(p_payload->>'daily_dearness_allowance', '')::numeric,
      revision          = revision + 1,
      status            = 'DRAFT',
      updated_by        = v_actor
    where id = v_id and status <> 'CONVERTED'
    returning id, offer_number into v_offer_id, v_offer_number;

    if not found then
      raise exception 'Offer letter not found, or it has already been converted to an employee and can no longer be edited';
    end if;

    delete from public.erp_offer_letter_components where offer_letter_id = v_offer_id;
  else
    v_offer_number := public.erp_next_document_number(
      'offer_letter', 'OFR', coalesce(nullif(p_payload->>'offer_date', '')::date, current_date)
    );

    insert into public.erp_offer_letters (
      offer_number, candidate_name, candidate_address, candidate_email, candidate_phone,
      designation, role, department, territory, reports_to, offer_date, joining_date,
      incentive_terms, remarks, annual_el_days, annual_sl_days, annual_cl_days,
      daily_travel_allowance, daily_dearness_allowance,
      created_by, updated_by
    ) values (
      v_offer_number,
      p_payload->>'candidate_name',
      nullif(p_payload->>'candidate_address', ''),
      nullif(p_payload->>'candidate_email', ''),
      nullif(p_payload->>'candidate_phone', ''),
      p_payload->>'designation',
      (p_payload->>'role')::public.erp_role,
      nullif(p_payload->>'department', ''),
      nullif(p_payload->>'territory', ''),
      nullif(p_payload->>'reports_to', '')::uuid,
      coalesce(nullif(p_payload->>'offer_date', '')::date, current_date),
      nullif(p_payload->>'joining_date', '')::date,
      nullif(p_payload->>'incentive_terms', ''),
      nullif(p_payload->>'remarks', ''),
      coalesce((p_payload->>'annual_el_days')::numeric, 0),
      coalesce((p_payload->>'annual_sl_days')::numeric, 0),
      coalesce((p_payload->>'annual_cl_days')::numeric, 0),
      nullif(p_payload->>'daily_travel_allowance', '')::numeric,
      nullif(p_payload->>'daily_dearness_allowance', '')::numeric,
      v_actor, v_actor
    )
    returning id into v_offer_id;
  end if;

  for v_component in select * from jsonb_array_elements(coalesce(p_payload->'components', '[]'::jsonb))
  loop
    insert into public.erp_offer_letter_components (
      offer_letter_id, component_name, category, monthly_amount, annual_amount, sort_order
    ) values (
      v_offer_id,
      v_component->>'component_name',
      coalesce((v_component->>'category')::public.erp_offer_component_category, 'EARNING'),
      coalesce((v_component->>'monthly_amount')::numeric, 0),
      coalesce((v_component->>'annual_amount')::numeric, 0),
      coalesce((v_component->>'sort_order')::integer, 0)
    );
  end loop;

  return jsonb_build_object('id', v_offer_id, 'offer_number', v_offer_number);
end;
$$;

-- Full body from 20260924000002_mr_dearness_allowance.sql (the latest),
-- plus snapshotting daily_travel_allowance alongside daily_dearness_allowance.
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
  v_ta_rate   numeric(10,2);
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
    select fixed_salary, basic_salary, gross_salary, allowances, standard_deductions,
           daily_dearness_allowance, daily_travel_allowance
      into v_fixed, v_basic, v_gross, v_allow, v_stddeduct, v_da_rate, v_ta_rate
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
        fixed_salary, basic_salary, gross_salary, allowances, standard_deductions,
        daily_dearness_allowance, daily_travel_allowance
      ) values (
        v_period_id, r.employee_id, r.name, r.role::text, r.designation, r.department,
        v_fixed, v_basic, v_gross, v_allow, v_stddeduct, v_da_rate, v_ta_rate
      )
      returning id into v_record_id;
      v_created := v_created + 1;
    else
      update public.erp_payroll_records
         set employee_name = r.name, designation = r.role::text, job_title = r.designation, department = r.department,
             fixed_salary = v_fixed, basic_salary = v_basic, gross_salary = v_gross,
             allowances = v_allow, standard_deductions = v_stddeduct,
             daily_dearness_allowance = v_da_rate, daily_travel_allowance = v_ta_rate
       where id = v_record_id;
      v_updated := v_updated + 1;
    end if;

    perform public.erp_recalculate_payroll_record(v_record_id);
  end loop;

  return jsonb_build_object('period_id', v_period_id, 'created', v_created, 'updated', v_updated);
end;
$$;

-- Full body from 20260924000002_mr_dearness_allowance.sql (the latest),
-- plus a flat per-day travel allowance added into the SAME travel_allowance
-- total the area-based (erp_mr_travel_allowance) figure already feeds — one
-- payslip line, two possible sources.
create or replace function public.erp_recalculate_payroll_record(p_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r                       record;
  v_period_start          date;
  v_period_end            date;
  v_days_in_month         integer;
  v_present               integer := 0;
  v_half                  integer := 0;
  v_absent                integer := 0;
  v_holiday               integer := 0;
  v_weekoff               integer := 0;
  v_paid_leave            integer := 0;
  v_unpaid_leave          integer := 0;
  v_payable               numeric(6,2);
  v_incentives            numeric(12,2) := 0;
  v_bonus                 numeric(12,2) := 0;
  v_other                 numeric(12,2) := 0;
  v_adhoc_deduction       numeric(12,2) := 0;
  v_area_travel_allowance numeric(12,2) := 0;
  v_flat_travel_allowance numeric(12,2) := 0;
  v_travel_allowance      numeric(12,2) := 0;
  v_dearness_allowance    numeric(12,2) := 0;
  v_prorated_fixed        numeric(12,2);
  v_lop_deduction         numeric(12,2);
  v_net                   numeric(12,2);
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

  -- Source 1: HR-reviewed, per-area, MR-only (unchanged query).
  select coalesce(sum(approved_amount), 0) into v_area_travel_allowance
    from public.erp_mr_travel_allowance
   where mr_id = r.employee_id
     and allowance_date between v_period_start and v_period_end
     and status = 'APPROVED';

  -- Source 2: flat per-day rate, any employee, no review step — same
  -- "days actually worked" basis as DA below. For a non-MR employee source 1
  -- is always 0, so this is effectively their only travel allowance.
  v_flat_travel_allowance := round(coalesce(r.daily_travel_allowance, 0) * (v_present + v_half * 0.5), 2);
  v_travel_allowance := v_area_travel_allowance + v_flat_travel_allowance;

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
