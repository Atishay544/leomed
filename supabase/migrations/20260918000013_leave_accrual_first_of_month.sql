-- Anchor leave accrual to the 1st of the month, not a rolling "N months
-- since whatever day it last happened to run" date. Same rate as before
-- (e.g. Earned Leave's 1 day every 2 months) — only the trigger date
-- changes, so it lands predictably on a calendar boundary (1 Jan, 1 Mar,
-- 1 May, ... once it first fires, not 15 Jan, 15 Mar, 15 May, ... if that
-- happened to be the day the very first run landed on).
--
-- Full body from 20260918000012_leave_policy_rules.sql, with only the
-- due-check (v_due) changed: it now requires today to be the 1st of the
-- month, and counts whole calendar months elapsed since last_accrued_on
-- (year*12 + month arithmetic) rather than adding an interval to a date.
-- Safe to keep calling daily — this is still a no-op on every day that
-- isn't the 1st, and a no-op again later the same day if retried, since
-- last_accrued_on is already this month by then.

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
  if extract(day from current_date) <> 1 then
    return jsonb_build_object('leave_types_accrued', 0, 'employees_credited', 0, 'reason', 'not the 1st of the month');
  end if;

  for v_type in
    select id, accrual_days, accrual_interval_months
      from public.erp_leave_types
     where tracks_balance and accrual_days is not null and accrual_interval_months is not null
  loop
    select last_accrued_on into v_last
      from public.erp_leave_accrual_state where leave_type_id = v_type.id;

    v_due := v_last is null or
      (extract(year from current_date)::integer * 12 + extract(month from current_date)::integer)
      - (extract(year from v_last)::integer * 12 + extract(month from v_last)::integer)
      >= v_type.accrual_interval_months;
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
