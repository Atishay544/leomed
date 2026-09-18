-- Year-end leave rollover — mirrors erp_process_daily_attendance() exactly:
-- cron-only (service_role), reachable by hand at the same URL if a run is
-- missed (see app/api/cron/erp-leave-rollover/route.ts).
--
-- What actually happens on 1 January:
--   - Earned Leave (carries_forward = true): whatever was left unused last
--     year (allocated - used) becomes the OPENING allocated balance for the
--     new year. This is a straight carry of the leftover, not an automatic
--     fresh annual grant on top — if the company also grants a fresh year's
--     EL every January, HR adds that on top via Leave -> Leave Balances,
--     same screen used to set it at hire time. Deliberately not guessed
--     here: how much (if any) new EL accrues each year, and any cap on how
--     much can carry forward, is an HR policy call this code should not
--     silently assume.
--   - Casual/Sick Leave (carries_forward = false): nothing to do. There is
--     no new-year row until HR sets one, and a missing row already reads as
--     zero balance everywhere balances are looked up — that absence of a
--     row IS the expiry. No explicit reset needed.
--   - Any OTHER tracks_balance leave type behaves like Casual/Sick unless
--     HR also marks it carries_forward, in which case it behaves like
--     Earned Leave — this is not hardcoded to Earned Leave by name.

create or replace function public.erp_leave_year_end_rollover(p_new_year integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev_year integer := p_new_year - 1;
  v_rolled    integer := 0;
begin
  -- ON CONFLICT DO NOTHING, not an additive update: this must be safe to
  -- run more than once for the same year (a retried cron hit, or someone
  -- triggering it by hand after it already ran) without piling the carried
  -- balance on top of itself. A year that already has a row is left alone —
  -- any manual top-up HR made after the first run is not overwritten either.
  insert into public.erp_leave_balances (employee_id, leave_type_id, year, allocated, used)
  select b.employee_id, b.leave_type_id, p_new_year,
         greatest(0, b.allocated - b.used), 0
    from public.erp_leave_balances b
    join public.erp_leave_types lt on lt.id = b.leave_type_id
    join public.erp_users u on u.id = b.employee_id
   where b.year = v_prev_year
     and lt.carries_forward
     and u.active
  on conflict (employee_id, leave_type_id, year) do nothing;

  get diagnostics v_rolled = row_count;

  return jsonb_build_object('new_year', p_new_year, 'balances_rolled_forward', v_rolled);
end;
$$;

revoke all on function public.erp_leave_year_end_rollover(integer) from public;
grant execute on function public.erp_leave_year_end_rollover(integer) to service_role;
