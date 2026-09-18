-- ============================================================================
-- Leave accrual, done per employee against their own joining date, replacing
-- the single company-wide "next_accrual_date per leave type" from
-- 20260918000012/20260918000013 (neither has had time to matter in
-- production — this supersedes both outright rather than migrating data).
--
-- The rule (as specified): an employee's accrual clock starts from an
-- "effective month" derived from their joining date —
--   - joined on/before the 15th of a month  -> effective month is THAT month
--   - joined after the 15th                 -> effective month is the NEXT month
-- and their first accrual lands on the 1st of (effective month +
-- accrual_interval_months), repeating every accrual_interval_months after
-- that. Example (2-month interval): joins 1-15 July -> first credit
-- 1 September, then 1 November. Joins 16-31 July -> first credit 1 October,
-- then 1 December.
--
-- erp_leave_accrual_state now tracks this per (employee, leave_type) as
-- next_accrual_date, seeded lazily off erp_users.joining_date (falling back
-- to created_at for anyone hired before that column existed) the first time
-- the accrual job considers them, then advanced by the interval each time
-- it's credited. A departed (inactive) employee's clock simply stops
-- advancing rather than continuing to accrue leave they can't use.
-- ============================================================================

alter table public.erp_users
  add column if not exists joining_date date;

drop table if exists public.erp_leave_accrual_state;

create table public.erp_leave_accrual_state (
  employee_id      uuid not null references public.erp_users(id) on delete cascade,
  leave_type_id    uuid not null references public.erp_leave_types(id) on delete cascade,
  next_accrual_date date not null,
  updated_at       timestamptz not null default now(),
  primary key (employee_id, leave_type_id)
);

create index if not exists erp_leave_accrual_state_due_idx
  on public.erp_leave_accrual_state (leave_type_id, next_accrual_date);

alter table public.erp_leave_accrual_state enable row level security;

drop policy if exists erp_leave_accrual_state_select on public.erp_leave_accrual_state;
create policy erp_leave_accrual_state_select on public.erp_leave_accrual_state
  for select to authenticated using (public.erp_is_admin() or public.erp_is_hr());
-- No insert/update policy for authenticated — only erp_run_leave_accruals()
-- (SECURITY DEFINER) ever writes this.

create or replace function public.erp_run_leave_accruals()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type           record;
  v_year           integer := extract(year from current_date);
  v_credited       integer;
  v_types_run      integer := 0;
  v_total_credited integer := 0;
begin
  for v_type in
    select id, accrual_days, accrual_interval_months
      from public.erp_leave_types
     where tracks_balance and accrual_days is not null and accrual_interval_months is not null
  loop
    -- Seed a schedule for anyone active who doesn't have one yet for this
    -- leave type, anchored to their own joining date (or created_at if
    -- joining_date was never set).
    insert into public.erp_leave_accrual_state (employee_id, leave_type_id, next_accrual_date)
    select
      u.id, v_type.id,
      ( case when extract(day from coalesce(u.joining_date, u.created_at::date)) <= 15
          then date_trunc('month', coalesce(u.joining_date, u.created_at::date))::date
          else (date_trunc('month', coalesce(u.joining_date, u.created_at::date)) + interval '1 month')::date
        end
      ) + make_interval(months => v_type.accrual_interval_months)
      from public.erp_users u
     where u.active and u.role <> 'ADMIN'
       and not exists (
         select 1 from public.erp_leave_accrual_state s
          where s.employee_id = u.id and s.leave_type_id = v_type.id
       )
    on conflict (employee_id, leave_type_id) do nothing;

    -- Credit anyone whose schedule is due (still active — a departed
    -- employee's clock is frozen, not advanced), then roll their date
    -- forward by one interval. A backlog (e.g. accrual only just configured
    -- for someone hired months ago) clears itself over the next several
    -- daily calls rather than all landing in one run, which is deliberate:
    -- each call advances the date by exactly one interval, same as a
    -- properly-on-schedule employee would get.
    with due as (
      update public.erp_leave_accrual_state s
         set next_accrual_date = s.next_accrual_date + make_interval(months => v_type.accrual_interval_months),
             updated_at = now()
        from public.erp_users u
       where s.employee_id = u.id
         and s.leave_type_id = v_type.id
         and s.next_accrual_date <= current_date
         and u.active and u.role <> 'ADMIN'
      returning s.employee_id
    )
    insert into public.erp_leave_balances (employee_id, leave_type_id, year, allocated)
    select employee_id, v_type.id, v_year, v_type.accrual_days from due
    on conflict (employee_id, leave_type_id, year)
    do update set allocated = public.erp_leave_balances.allocated + v_type.accrual_days;

    get diagnostics v_credited = row_count;
    if v_credited > 0 then
      v_types_run := v_types_run + 1;
      v_total_credited := v_total_credited + v_credited;
    end if;
  end loop;

  return jsonb_build_object('leave_types_credited', v_types_run, 'accruals_credited', v_total_credited);
end;
$$;
