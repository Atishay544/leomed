-- ============================================================================
-- MR Travel Allowance — a fixed per-day amount for whichever areas an MR
-- actually travelled to, auto-detected from their own doctor/chemist visits
-- (no separate travel log for the MR to fill in).
--
-- Design, per the business rules given:
--   - Rate lives on the AREA (erp_areas.daily_travel_allowance), not the
--     territory — different towns from the same base cost different amounts
--     to reach. Null/unset means "not a chargeable trip" (a home-base city
--     locality, typically).
--   - Multiple distinct areas visited by the same MR on the same day are
--     SUMMED, not capped at the highest one — confirmed business rule: each
--     area visited is treated as its own leg of travel (fuel burned getting
--     there and back), not one trip covering everything.
--   - Computed daily (piggybacked on the existing attendance cron — see the
--     route change — not a 3rd cron job) as a PENDING suggestion. Nothing
--     gets paid until HR reviews and approves it; approving may adjust the
--     amount, rejecting zeroes it out. An already-reviewed day is never
--     silently recomputed, even if that day's visit data changes later.
--   - Only APPROVED amounts ever reach payroll.
-- ============================================================================

alter table public.erp_areas
  add column if not exists daily_travel_allowance numeric(10,2)
    check (daily_travel_allowance is null or daily_travel_allowance > 0);

do $$ begin
  create type public.erp_travel_allowance_status as enum ('PENDING', 'APPROVED', 'REJECTED');
exception when duplicate_object then null; end $$;

create table if not exists public.erp_mr_travel_allowance (
  id               uuid primary key default gen_random_uuid(),
  mr_id            uuid not null references public.erp_users(id) on delete cascade,
  allowance_date   date not null,
  -- Snapshot of what was auto-detected, for HR's review context — e.g.
  -- [{"area_id":"...", "area_name":"Shamli", "rate":300}, {"area_id":"...",
  -- "area_name":"Deoband", "rate":250}]. Not a foreign key elsewhere; purely
  -- informational, so it still reads correctly even if an area is later
  -- renamed or deleted.
  detected_areas   jsonb not null default '[]'::jsonb,
  computed_amount  numeric(10,2) not null default 0 check (computed_amount >= 0),
  -- Null until reviewed. HR can approve at a different amount than computed
  -- (e.g. a dispute or correction) — the computed figure is never lost,
  -- since it stays in this same row alongside whatever was approved.
  approved_amount  numeric(10,2) check (approved_amount is null or approved_amount >= 0),
  status           public.erp_travel_allowance_status not null default 'PENDING',
  reviewed_by      uuid references public.erp_users(id) on delete set null,
  reviewed_at      timestamptz,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint erp_mr_travel_allowance_unique unique (mr_id, allowance_date)
);

create index if not exists erp_mr_travel_allowance_mr_idx     on public.erp_mr_travel_allowance (mr_id, allowance_date desc);
create index if not exists erp_mr_travel_allowance_status_idx on public.erp_mr_travel_allowance (status);

drop trigger if exists erp_mr_travel_allowance_touch on public.erp_mr_travel_allowance;
create trigger erp_mr_travel_allowance_touch before update on public.erp_mr_travel_allowance
  for each row execute function public.erp_touch_updated_at();

drop trigger if exists erp_mr_travel_allowance_audit on public.erp_mr_travel_allowance;
create trigger erp_mr_travel_allowance_audit
  after insert or update or delete on public.erp_mr_travel_allowance
  for each row execute function public.erp_audit_trigger();

alter table public.erp_mr_travel_allowance enable row level security;

-- An MR can see their own rows (transparency — "why is my pay what it is"),
-- never write them. Only admin/HR reviews.
drop policy if exists erp_mr_travel_allowance_select on public.erp_mr_travel_allowance;
create policy erp_mr_travel_allowance_select on public.erp_mr_travel_allowance
  for select to authenticated
  using (mr_id = public.erp_current_user_id() or public.erp_is_admin() or public.erp_is_hr());

drop policy if exists erp_mr_travel_allowance_write on public.erp_mr_travel_allowance;
create policy erp_mr_travel_allowance_write on public.erp_mr_travel_allowance
  for all to authenticated
  using (public.erp_is_admin() or public.erp_is_hr())
  with check (public.erp_is_admin() or public.erp_is_hr());

-- ─── Daily auto-detection ───────────────────────────────────────────────────
-- Cron-only (service_role), same pattern as erp_process_daily_attendance()/
-- erp_run_leave_accruals() — reachable by hand at the same URL if a run is
-- missed. A doctor visit and a chemist visit to the SAME area on the SAME
-- day count once (the UNION below dedupes it), not twice.

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
      sum(combined.rate) as total_amount,
      jsonb_agg(jsonb_build_object('area_id', combined.area_id, 'area_name', combined.area_name, 'rate', combined.rate)
                order by combined.area_name) as areas_json
    from (
      select distinct v.mr_id, a.id as area_id, a.name as area_name, a.daily_travel_allowance as rate
        from public.erp_doctor_visits v
        join public.erp_doctors d on d.id = v.doctor_id
        join public.erp_areas a on a.id = d.area_id
       where v.visit_date = p_date
         and a.daily_travel_allowance is not null and a.daily_travel_allowance > 0
      union
      select distinct v.mr_id, a.id as area_id, a.name as area_name, a.daily_travel_allowance as rate
        from public.erp_chemist_visits v
        join public.erp_chemists c on c.id = v.chemist_id
        join public.erp_areas a on a.id = c.area_id
       where v.visit_date = p_date
         and a.daily_travel_allowance is not null and a.daily_travel_allowance > 0
    ) combined
    group by combined.mr_id
  loop
    -- Only ever (re)computes a PENDING row — a day HR has already approved
    -- or rejected is never overwritten just because a visit for that day
    -- was added or edited afterward.
    insert into public.erp_mr_travel_allowance (mr_id, allowance_date, detected_areas, computed_amount, status)
    values (r.mr_id, p_date, r.areas_json, r.total_amount, 'PENDING')
    on conflict (mr_id, allowance_date) do update
       set detected_areas  = excluded.detected_areas,
           computed_amount = excluded.computed_amount,
           updated_at      = now()
     where public.erp_mr_travel_allowance.status = 'PENDING';

    v_processed := v_processed + 1;
  end loop;

  return jsonb_build_object('date', p_date, 'mrs_processed', v_processed);
end;
$$;

revoke all on function public.erp_compute_daily_travel_allowance(date) from public;
grant execute on function public.erp_compute_daily_travel_allowance(date) to service_role;

-- ─── Payroll integration ────────────────────────────────────────────────────
-- Only APPROVED amounts for the payroll period ever get summed in — a still-
-- PENDING day simply isn't included that month; if HR approves it late, it
-- has to be added as a manual payroll item for that period instead of
-- silently reopening a month that's already been calculated.

alter table public.erp_payroll_records
  add column if not exists travel_allowance numeric(12,2) not null default 0 check (travel_allowance >= 0);

-- Full body from 20260918000011_payroll_lop_deduction.sql (the latest),
-- plus travel_allowance summed in as an additional earning.
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
  v_travel_allowance numeric(12,2) := 0;
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

  select coalesce(sum(approved_amount), 0) into v_travel_allowance
    from public.erp_mr_travel_allowance
   where mr_id = r.employee_id
     and allowance_date between v_period_start and v_period_end
     and status = 'APPROVED';

  v_prorated_fixed := round((r.fixed_salary / nullif(v_days_in_month, 0)) * v_payable, 2);
  -- The full-vs-prorated gap IS the Loss of Pay figure — derived this way
  -- (not independently from unpaid_leave_days/absent_days) so it can never
  -- disagree with what net_salary below actually pays out.
  v_lop_deduction := greatest(0, round(r.fixed_salary - v_prorated_fixed, 2));

  v_net := round(
    v_prorated_fixed + v_incentives + v_bonus + v_other + v_travel_allowance
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
         net_salary            = coalesce(v_net, 0)
   where id = p_record_id;
end;
$$;
