-- ============================================================================
-- LEOMED PHARMA ERP — HR: combined-dashboard aggregate
--
-- One query for "this month's payroll total" on the admin HR dashboard,
-- rather than paging through every payroll record in application code
-- (spec §41 — the same discipline as erp_attendance_summary/erp_expense_summary).
-- ============================================================================

create or replace function public.erp_payroll_period_totals(p_period_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'employee_count',    count(*),
    'total_net_salary',  coalesce(sum(net_salary), 0),
    'total_incentives',  coalesce(sum(incentives), 0),
    'total_deductions',  coalesce(sum(deductions), 0)
  )
  from public.erp_payroll_records
  where payroll_period_id = p_period_id;
$$;

revoke all on function public.erp_payroll_period_totals(uuid) from public;
grant execute on function public.erp_payroll_period_totals(uuid) to authenticated;
