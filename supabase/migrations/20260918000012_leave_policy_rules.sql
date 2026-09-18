-- Two more customizable leave policy rules, generalized the same way
-- tracks_balance/carries_forward were (not hardcoded to a leave type by
-- name — configured per type, seeded sensibly for the three real ones):
--
--   1. A per-calendar-month cap, independent of the annual balance — e.g.
--      Casual Leave capped at 2 days in any one month even if more than 2
--      remain for the year. NULL means no monthly cap (Sick/Earned Leave
--      today).
--   2. Automatic accrual every N months — e.g. Earned Leave gaining 1 day
--      every 2 months, on top of whatever was allocated at hire time or set
--      manually. NULL accrual_days/accrual_interval_months means no
--      automatic accrual (Casual/Sick Leave today) — HR-set allocation is
--      the only thing that ever changes it, same as before this migration.

alter table public.erp_leave_types
  add column if not exists monthly_cap_days       numeric(5,1) check (monthly_cap_days is null or monthly_cap_days > 0),
  add column if not exists accrual_days            numeric(5,1) check (accrual_days is null or accrual_days > 0),
  add column if not exists accrual_interval_months integer      check (accrual_interval_months is null or accrual_interval_months > 0);

update public.erp_leave_types set monthly_cap_days = 2
 where name = 'Casual Leave';

update public.erp_leave_types set accrual_days = 1, accrual_interval_months = 2
 where name = 'Earned Leave';

-- ─── Accrual bookkeeping ────────────────────────────────────────────────────
-- One row per accruing leave type — accrual applies uniformly to every
-- active employee at once, so there is nothing to track per-employee here
-- (unlike erp_leave_balances itself).

create table if not exists public.erp_leave_accrual_state (
  leave_type_id  uuid primary key references public.erp_leave_types(id) on delete cascade,
  last_accrued_on date,
  updated_at     timestamptz not null default now()
);

alter table public.erp_leave_accrual_state enable row level security;

drop policy if exists erp_leave_accrual_state_select on public.erp_leave_accrual_state;
create policy erp_leave_accrual_state_select on public.erp_leave_accrual_state
  for select to authenticated using (public.erp_is_admin() or public.erp_is_hr());
-- No insert/update policy for authenticated: only erp_run_leave_accruals()
-- (SECURITY DEFINER) ever writes this, the same way the daily attendance
-- job is the only writer of erp_attendance's SYSTEM_AUTO rows.

-- ─── The accrual run itself ─────────────────────────────────────────────────
-- Cron-only (service_role), same as erp_process_daily_attendance() and
-- erp_leave_year_end_rollover() — reachable by hand at the same URL if a
-- run is missed. Deliberately self-throttling rather than tied to a
-- specific cron schedule: this can be (and is, see the attendance cron
-- route) called every day, and a leave type's own accrual_interval_months
-- decides when it's actually due, via last_accrued_on. That also means one
-- type accruing every 2 months and a hypothetical future one accruing every
-- 3 months both work correctly off the same daily call, with no schedule
-- to keep in sync per type.
create or replace function public.erp_run_leave_accruals()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type          record;
  v_last          date;
  v_due           boolean;
  v_year          integer := extract(year from current_date);
  v_credited      integer;
  v_types_run     integer := 0;
  v_total_credited integer := 0;
begin
  for v_type in
    select id, accrual_days, accrual_interval_months
      from public.erp_leave_types
     where tracks_balance and accrual_days is not null and accrual_interval_months is not null
  loop
    select last_accrued_on into v_last
      from public.erp_leave_accrual_state where leave_type_id = v_type.id;

    v_due := v_last is null or current_date >= (v_last + make_interval(months => v_type.accrual_interval_months));
    if not v_due then
      continue;
    end if;

    insert into public.erp_leave_balances (employee_id, leave_type_id, year, allocated)
    select u.id, v_type.id, v_year, v_type.accrual_days
      from public.erp_users u
     where u.active and u.role <> 'ADMIN'
    on conflict (employee_id, leave_type_id, year)
    do update set allocated = public.erp_leave_balances.allocated + v_type.accrual_days;

    get diagnostics v_credited = row_count;
    v_total_credited := v_total_credited + v_credited;
    v_types_run := v_types_run + 1;

    insert into public.erp_leave_accrual_state (leave_type_id, last_accrued_on)
    values (v_type.id, current_date)
    on conflict (leave_type_id) do update set last_accrued_on = current_date, updated_at = now();
  end loop;

  return jsonb_build_object('leave_types_accrued', v_types_run, 'employees_credited', v_total_credited);
end;
$$;

revoke all on function public.erp_run_leave_accruals() from public;
grant execute on function public.erp_run_leave_accruals() to service_role;
