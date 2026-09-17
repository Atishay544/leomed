-- ============================================================================
-- A real, free-text job title on staff — "Territory Manager", "Area Sales
-- Manager", "Senior Accountant" — distinct from ROLE (ADMIN/MR/ACCOUNTANT/
-- MANAGER/VIEWER, which drives permissions and must stay a closed set).
-- This is exactly the offer letter's DESIGNATION field, carried forward
-- once a candidate is actually converted to an employee.
--
-- erp_payroll_records already has a column literally named `designation` —
-- but it snapshots ROLE ("Snapshotted identity — a later role/department
-- change must not reword a payslip that has already gone out", per its own
-- comment), and erp_generate_payroll_period()'s role-filtering explicitly
-- depends on it holding the role string. Repurposing it would break that
-- filter for anyone who gets a real designation. So the genuine job-title
-- snapshot on a payroll record is a NEW column, `job_title` — the existing
-- `designation` column keeps meaning exactly what it always has.
-- ============================================================================

alter table public.erp_users
  add column if not exists designation text;

alter table public.erp_payroll_records
  add column if not exists job_title text;

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
  r           record;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator can generate payroll' using errcode = 'insufficient_privilege';
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
    select fixed_salary, basic_salary, gross_salary, allowances, standard_deductions
      into v_fixed, v_basic, v_gross, v_allow, v_stddeduct
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
        fixed_salary, basic_salary, gross_salary, allowances, standard_deductions
      ) values (
        v_period_id, r.employee_id, r.name, r.role::text, r.designation, r.department,
        v_fixed, v_basic, v_gross, v_allow, v_stddeduct
      )
      returning id into v_record_id;
      v_created := v_created + 1;
    else
      update public.erp_payroll_records
         set employee_name = r.name, designation = r.role::text, job_title = r.designation, department = r.department,
             fixed_salary = v_fixed, basic_salary = v_basic, gross_salary = v_gross,
             allowances = v_allow, standard_deductions = v_stddeduct
       where id = v_record_id;
      v_updated := v_updated + 1;
    end if;

    perform public.erp_recalculate_payroll_record(v_record_id);
  end loop;

  return jsonb_build_object('period_id', v_period_id, 'created', v_created, 'updated', v_updated);
end;
$$;
