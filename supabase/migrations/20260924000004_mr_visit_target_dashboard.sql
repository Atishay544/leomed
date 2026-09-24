-- ============================================================================
-- MR visit-target progress, for the dashboard — today's count against the
-- day's target, and the same for month-to-date, per MR.
--
-- SECURITY INVOKER, same reasoning as erp_mr_performance()/erp_dashboard_
-- summary(): no role check inside the function at all — erp_users' own RLS
-- (auth_user_id = auth.uid() OR admin/HR/viewer) naturally scopes the "for
-- r in select from erp_users" loop to everyone for an admin/HR caller, or
-- just that one MR's own row for an MR calling it about themselves. One
-- function, no duplicated "am I allowed to see this" logic.
--
-- Month-to-date TARGET is not just (daily target x days elapsed) — it
-- excludes week-offs, holidays and approved leave, the same three things
-- erp_calculate_attendance() itself never asks a visit target of an MR for.
-- Computed by walking the actual calendar (generate_series), not by reading
-- erp_attendance rows, so it's correct even for today before that day's
-- attendance row has been finalized by a checkout or the nightly job.
-- ============================================================================

create or replace function public.erp_mr_visit_target_progress(p_date date default current_date)
returns table (
  mr_id                    uuid,
  mr_name                  text,
  mr_code                  text,
  territory                text,
  required_doctor_visits   integer,
  required_chemist_visits  integer,
  today_doctor_visits      integer,
  today_chemist_visits     integer,
  mtd_working_days         integer,
  mtd_doctor_visits        integer,
  mtd_doctor_target        integer,
  mtd_chemist_visits       integer,
  mtd_chemist_target       integer
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_rules        record;
  v_month_start  date := date_trunc('month', p_date)::date;
  r              record;
  v_week_off     smallint[];
begin
  select * into v_rules from public.erp_attendance_rules where id = 1;

  for r in
    select u.id, u.name, u.mr_code, u.territory, u.week_off_days
      from public.erp_users u
     where u.role = 'MR' and u.active
     order by u.name
  loop
    select coalesce(t.required_doctor_visits,  v_rules.default_mr_doctor_visits),
           coalesce(t.required_chemist_visits, v_rules.default_mr_chemist_visits)
      into required_doctor_visits, required_chemist_visits
      from (select 1) as _dummy
      left join public.erp_mr_attendance_targets t on t.mr_id = r.id;

    v_week_off := coalesce(r.week_off_days, v_rules.default_week_off_days);

    mr_id     := r.id;
    mr_name   := r.name;
    mr_code   := r.mr_code;
    territory := r.territory;

    select count(*)::integer into today_doctor_visits
      from public.erp_doctor_visits v where v.mr_id = r.id and v.visit_date = p_date;
    select count(*)::integer into today_chemist_visits
      from public.erp_chemist_visits v where v.mr_id = r.id and v.visit_date = p_date;

    select count(*)::integer into mtd_working_days
      from generate_series(v_month_start, p_date, interval '1 day') gs(d)
     where extract(dow from gs.d)::smallint <> all(v_week_off)
       and not exists (select 1 from public.erp_holidays h where h.holiday_date = gs.d::date)
       and not exists (
         select 1 from public.erp_leave_requests lr
          where lr.employee_id = r.id and lr.status = 'APPROVED'
            and gs.d::date between lr.from_date and lr.to_date
       );

    select count(*)::integer into mtd_doctor_visits
      from public.erp_doctor_visits v where v.mr_id = r.id and v.visit_date between v_month_start and p_date;
    select count(*)::integer into mtd_chemist_visits
      from public.erp_chemist_visits v where v.mr_id = r.id and v.visit_date between v_month_start and p_date;

    mtd_doctor_target  := required_doctor_visits  * mtd_working_days;
    mtd_chemist_target := required_chemist_visits * mtd_working_days;

    return next;
  end loop;
end;
$$;

revoke all on function public.erp_mr_visit_target_progress(date) from public;
grant execute on function public.erp_mr_visit_target_progress(date) to authenticated;
