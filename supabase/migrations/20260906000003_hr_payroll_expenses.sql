-- ============================================================================
-- LEOMED PHARMA ERP — HR: PAYROLL, INCENTIVES, EXPENSES
--
-- Continues 20260906000002 (attendance + leave). Salary lives in its own
-- table, deliberately separate from erp_users (the auth-linked identity
-- table) — erp_users stays about who can sign in and as what role, never
-- what they are paid.
--
-- Historical-payslip guarantee (spec §32): erp_payroll_records is a SNAPSHOT.
-- Once written, a record's salary/attendance/incentive/deduction figures are
-- never recomputed from "live" data except by erp_recalculate_payroll_record,
-- which itself refuses to touch a FINALIZED/PAID period. A later change to
-- erp_employee_salary never alters an already-finalized month's numbers.
-- ============================================================================

-- ─── Employee salary (separate from erp_users on purpose) ──────────────────

create table if not exists public.erp_employee_salary (
  employee_id         uuid primary key references public.erp_users(id) on delete cascade,
  fixed_salary        numeric(12,2) not null default 0 check (fixed_salary >= 0),
  basic_salary        numeric(12,2) not null default 0 check (basic_salary >= 0),
  gross_salary        numeric(12,2) not null default 0 check (gross_salary >= 0),
  allowances          numeric(12,2) not null default 0 check (allowances >= 0),
  -- Recurring deductions applied every month (e.g. PF, insurance) — distinct
  -- from the one-off DEDUCTION items on a specific month's payroll record.
  standard_deductions numeric(12,2) not null default 0 check (standard_deductions >= 0),
  effective_from      date not null default current_date,
  updated_by          uuid references public.erp_users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists erp_employee_salary_touch on public.erp_employee_salary;
create trigger erp_employee_salary_touch before update on public.erp_employee_salary
  for each row execute function public.erp_touch_updated_at();

drop trigger if exists erp_employee_salary_audit on public.erp_employee_salary;
create trigger erp_employee_salary_audit
  after insert or update or delete on public.erp_employee_salary
  for each row execute function public.erp_audit_trigger();

-- ─── Payroll ────────────────────────────────────────────────────────────────

do $$ begin
  create type public.erp_payroll_status as enum ('DRAFT', 'CALCULATED', 'UNDER_REVIEW', 'FINALIZED', 'PAID');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.erp_payroll_item_type as enum ('INCENTIVE', 'OTHER_EARNING', 'DEDUCTION');
exception when duplicate_object then null; end $$;

create table if not exists public.erp_payroll_periods (
  id             uuid primary key default gen_random_uuid(),
  period_year    integer not null check (period_year between 2000 and 2200),
  period_month   integer not null check (period_month between 1 and 12),
  status         public.erp_payroll_status not null default 'DRAFT',
  finalized_at   timestamptz,
  finalized_by   uuid references public.erp_users(id) on delete set null,
  reopened_at    timestamptz,
  reopened_by    uuid references public.erp_users(id) on delete set null,
  reopen_reason  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint erp_payroll_periods_unique unique (period_year, period_month)
);

drop trigger if exists erp_payroll_periods_touch on public.erp_payroll_periods;
create trigger erp_payroll_periods_touch before update on public.erp_payroll_periods
  for each row execute function public.erp_touch_updated_at();

drop trigger if exists erp_payroll_periods_audit on public.erp_payroll_periods;
create trigger erp_payroll_periods_audit
  after insert or update or delete on public.erp_payroll_periods
  for each row execute function public.erp_audit_trigger();

-- One row per employee per period — the historical snapshot itself.
create table if not exists public.erp_payroll_records (
  id                  uuid primary key default gen_random_uuid(),
  payroll_period_id   uuid not null references public.erp_payroll_periods(id) on delete cascade,
  employee_id         uuid not null references public.erp_users(id) on delete cascade,

  -- Snapshotted identity — a later role/department change must not reword a
  -- payslip that has already gone out.
  employee_name       text not null,
  designation         text,
  department          text,

  -- Attendance summary for the period (spec §33).
  working_days        integer not null default 0,
  present_days         integer not null default 0,
  half_days           integer not null default 0,
  paid_leave_days     integer not null default 0,
  unpaid_leave_days   integer not null default 0,
  absent_days         integer not null default 0,
  holiday_days        integer not null default 0,
  week_off_days       integer not null default 0,
  payable_days        numeric(6,2) not null default 0,

  -- Salary snapshot (frozen at generation time, from erp_employee_salary).
  fixed_salary        numeric(12,2) not null default 0,
  basic_salary        numeric(12,2) not null default 0,
  gross_salary        numeric(12,2) not null default 0,
  allowances          numeric(12,2) not null default 0,
  standard_deductions numeric(12,2) not null default 0,

  -- Aggregated from erp_payroll_items — never entered directly.
  incentives          numeric(12,2) not null default 0,
  other_earnings      numeric(12,2) not null default 0,
  deductions          numeric(12,2) not null default 0,  -- standard_deductions + ad-hoc DEDUCTION items

  net_salary          numeric(12,2) not null default 0,

  remarks             text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint erp_payroll_records_unique unique (payroll_period_id, employee_id)
);

create index if not exists erp_payroll_records_period_idx   on public.erp_payroll_records (payroll_period_id);
create index if not exists erp_payroll_records_employee_idx on public.erp_payroll_records (employee_id, created_at desc);

drop trigger if exists erp_payroll_records_touch on public.erp_payroll_records;
create trigger erp_payroll_records_touch before update on public.erp_payroll_records
  for each row execute function public.erp_touch_updated_at();

drop trigger if exists erp_payroll_records_audit on public.erp_payroll_records;
create trigger erp_payroll_records_audit
  after insert or update or delete on public.erp_payroll_records
  for each row execute function public.erp_audit_trigger();

-- Itemized incentives/other-earnings/deductions an admin adds before
-- finalizing (spec §26 — "incentives must not modify the fixed salary").
create table if not exists public.erp_payroll_items (
  id                 uuid primary key default gen_random_uuid(),
  payroll_record_id  uuid not null references public.erp_payroll_records(id) on delete cascade,
  item_type          public.erp_payroll_item_type not null,
  label              text not null check (length(trim(label)) > 0),
  amount             numeric(12,2) not null check (amount > 0),
  created_by         uuid references public.erp_users(id) on delete set null,
  created_at         timestamptz not null default now()
);

create index if not exists erp_payroll_items_record_idx on public.erp_payroll_items (payroll_record_id);

drop trigger if exists erp_payroll_items_audit on public.erp_payroll_items;
create trigger erp_payroll_items_audit
  after insert or update or delete on public.erp_payroll_items
  for each row execute function public.erp_audit_trigger();

-- ─── Expenses ───────────────────────────────────────────────────────────────

do $$ begin
  create type public.erp_expense_category as enum (
    'TRAVEL', 'FUEL', 'OFFICE', 'MARKETING', 'PROMOTIONAL', 'DOCTOR_MEETING',
    'SAMPLES', 'EVENTS', 'LOGISTICS', 'MISCELLANEOUS', 'OTHER'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.erp_expense_status as enum ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID');
exception when duplicate_object then null; end $$;

create table if not exists public.erp_expenses (
  id            uuid primary key default gen_random_uuid(),
  expense_date  date not null,
  category      public.erp_expense_category not null,
  -- The person who recorded it — an MR's own travel, or an accountant
  -- logging a company-level marketing spend under their own name.
  employee_id   uuid not null references public.erp_users(id) on delete cascade,
  vendor_name   text,
  amount        numeric(12,2) not null check (amount > 0),
  description   text,
  receipt_url   text,
  payment_mode  public.erp_payment_method not null default 'CASH',
  status        public.erp_expense_status not null default 'SUBMITTED',
  approved_by   uuid references public.erp_users(id) on delete set null,
  approved_at   timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists erp_expenses_employee_idx on public.erp_expenses (employee_id, created_at desc);
create index if not exists erp_expenses_status_idx   on public.erp_expenses (status);
create index if not exists erp_expenses_date_idx     on public.erp_expenses (expense_date);
create index if not exists erp_expenses_category_idx on public.erp_expenses (category);

drop trigger if exists erp_expenses_touch on public.erp_expenses;
create trigger erp_expenses_touch before update on public.erp_expenses
  for each row execute function public.erp_touch_updated_at();

drop trigger if exists erp_expenses_audit on public.erp_expenses;
create trigger erp_expenses_audit
  after insert or update or delete on public.erp_expenses
  for each row execute function public.erp_audit_trigger();

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- One authoritative payroll calculation, mirroring erp_calculate_attendance's
-- role in the attendance module. Refuses to touch a FINALIZED/PAID period —
-- that is exactly what "the historical snapshot never changes" means.
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
  v_other           numeric(12,2) := 0;
  v_adhoc_deduction numeric(12,2) := 0;
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
         coalesce(sum(amount) filter (where item_type = 'OTHER_EARNING'), 0),
         coalesce(sum(amount) filter (where item_type = 'DEDUCTION'), 0)
    into v_incentives, v_other, v_adhoc_deduction
    from public.erp_payroll_items
   where payroll_record_id = p_record_id;

  v_net := round(
    (r.fixed_salary / nullif(v_days_in_month, 0)) * v_payable
    + v_incentives + v_other - (r.standard_deductions + v_adhoc_deduction)
  , 2);

  update public.erp_payroll_records
     set working_days      = v_days_in_month,
         present_days      = v_present,
         half_days         = v_half,
         paid_leave_days   = v_paid_leave,
         unpaid_leave_days = v_unpaid_leave,
         absent_days       = v_absent,
         holiday_days      = v_holiday,
         week_off_days     = v_weekoff,
         payable_days      = v_payable,
         incentives        = v_incentives,
         other_earnings    = v_other,
         deductions        = r.standard_deductions + v_adhoc_deduction,
         net_salary        = coalesce(v_net, 0)
   where id = p_record_id;
end;
$$;

-- Admin selects a month; this creates/refreshes one record per active
-- non-admin employee. Re-running a DRAFT/CALCULATED period is safe — it
-- refreshes the salary/identity snapshot and attendance-derived figures
-- without touching manually-added items. Refuses a FINALIZED/PAID period.
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
    select u.id as employee_id, u.name, u.role, u.department
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
        payroll_period_id, employee_id, employee_name, designation, department,
        fixed_salary, basic_salary, gross_salary, allowances, standard_deductions
      ) values (
        v_period_id, r.employee_id, r.name, r.role::text, r.department,
        v_fixed, v_basic, v_gross, v_allow, v_stddeduct
      )
      returning id into v_record_id;
      v_created := v_created + 1;
    else
      update public.erp_payroll_records
         set employee_name = r.name, designation = r.role::text, department = r.department,
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

create or replace function public.erp_add_payroll_item(
  p_record_id uuid, p_item_type public.erp_payroll_item_type, p_label text, p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.erp_payroll_status;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator can add payroll items' using errcode = 'insufficient_privilege';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount above zero';
  end if;
  if p_label is null or trim(p_label) = '' then
    raise exception 'Enter a label for this item';
  end if;

  select pp.status into v_status
    from public.erp_payroll_records pr
    join public.erp_payroll_periods pp on pp.id = pr.payroll_period_id
   where pr.id = p_record_id;

  if v_status is null then raise exception 'Payroll record not found'; end if;
  if v_status in ('FINALIZED', 'PAID') then
    raise exception 'This payroll is finalized. Reopen it before making changes.';
  end if;

  insert into public.erp_payroll_items (payroll_record_id, item_type, label, amount, created_by)
  values (p_record_id, p_item_type, trim(p_label), p_amount, public.erp_current_user_id());

  perform public.erp_recalculate_payroll_record(p_record_id);

  return (select to_jsonb(pr) from public.erp_payroll_records pr where pr.id = p_record_id);
end;
$$;

create or replace function public.erp_delete_payroll_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record_id uuid;
  v_status    public.erp_payroll_status;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator can remove payroll items' using errcode = 'insufficient_privilege';
  end if;

  select pi.payroll_record_id, pp.status into v_record_id, v_status
    from public.erp_payroll_items pi
    join public.erp_payroll_records pr on pr.id = pi.payroll_record_id
    join public.erp_payroll_periods pp on pp.id = pr.payroll_period_id
   where pi.id = p_item_id;

  if v_record_id is null then raise exception 'Item not found'; end if;
  if v_status in ('FINALIZED', 'PAID') then
    raise exception 'This payroll is finalized. Reopen it before making changes.';
  end if;

  delete from public.erp_payroll_items where id = p_item_id;
  perform public.erp_recalculate_payroll_record(v_record_id);

  return (select to_jsonb(pr) from public.erp_payroll_records pr where pr.id = v_record_id);
end;
$$;

create or replace function public.erp_finalize_payroll(p_period_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.erp_payroll_status;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator can finalize payroll' using errcode = 'insufficient_privilege';
  end if;

  select status into v_status from public.erp_payroll_periods where id = p_period_id for update;
  if v_status is null then raise exception 'Payroll period not found'; end if;
  if v_status in ('FINALIZED', 'PAID') then
    raise exception 'This payroll period is already finalized';
  end if;
  if not exists (select 1 from public.erp_payroll_records where payroll_period_id = p_period_id) then
    raise exception 'Generate payroll for this period before finalizing it';
  end if;

  update public.erp_payroll_periods
     set status = 'FINALIZED', finalized_at = now(), finalized_by = public.erp_current_user_id()
   where id = p_period_id;

  return jsonb_build_object('period_id', p_period_id, 'status', 'FINALIZED');
end;
$$;

-- Reopening is an explicit, audited admin action (spec §31) — the generic
-- audit trigger on erp_payroll_periods already records the before/after
-- including reopen_reason.
create or replace function public.erp_reopen_payroll(p_period_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.erp_payroll_status;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator can reopen payroll' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A reason is required to reopen a finalized payroll';
  end if;

  select status into v_status from public.erp_payroll_periods where id = p_period_id for update;
  if v_status is null then raise exception 'Payroll period not found'; end if;
  if v_status not in ('FINALIZED', 'PAID') then
    raise exception 'Only a finalized or paid payroll can be reopened';
  end if;

  update public.erp_payroll_periods
     set status = 'UNDER_REVIEW', reopened_at = now(), reopened_by = public.erp_current_user_id(),
         reopen_reason = p_reason
   where id = p_period_id;

  return jsonb_build_object('period_id', p_period_id, 'status', 'UNDER_REVIEW');
end;
$$;

create or replace function public.erp_mark_payroll_paid(p_period_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.erp_payroll_status;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator can mark payroll as paid' using errcode = 'insufficient_privilege';
  end if;

  select status into v_status from public.erp_payroll_periods where id = p_period_id for update;
  if v_status is null then raise exception 'Payroll period not found'; end if;
  if v_status <> 'FINALIZED' then
    raise exception 'Finalize this payroll before marking it as paid';
  end if;

  update public.erp_payroll_periods set status = 'PAID' where id = p_period_id;
  return jsonb_build_object('period_id', p_period_id, 'status', 'PAID');
end;
$$;

-- Admin-only status transition on an expense — mirrors erp_review_leave_request.
-- Everything else about an expense (amount, category, description, …) is a
-- plain RLS-guarded column-restricted update; only approve/reject/mark-paid
-- goes through here, so an employee can never approve their own expense
-- (spec §43).
create or replace function public.erp_review_expense(
  p_expense_id uuid,
  p_status     public.erp_expense_status,
  p_notes      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator can review expenses' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('APPROVED', 'REJECTED', 'PAID') then
    raise exception 'An expense review must set Approved, Rejected or Paid';
  end if;

  update public.erp_expenses
     set status = p_status,
         notes = coalesce(p_notes, notes),
         approved_by = case when p_status = 'APPROVED' then public.erp_current_user_id() else approved_by end,
         approved_at = case when p_status = 'APPROVED' then now() else approved_at end
   where id = p_expense_id;

  if not found then raise exception 'Expense not found'; end if;

  return (select to_jsonb(e) from public.erp_expenses e where e.id = p_expense_id);
end;
$$;

-- One-query aggregate for the company expense dashboard (spec §29) — never a
-- per-row count done in application code.
create or replace function public.erp_expense_summary(p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with scope as (
    select * from public.erp_expenses where expense_date between p_from and p_to
  )
  select jsonb_build_object(
    'total',        (select coalesce(sum(amount), 0) from scope where status <> 'REJECTED'),
    'by_category',  (
      select coalesce(jsonb_object_agg(category, total), '{}'::jsonb)
        from (
          select category, sum(amount) as total
            from scope
           where status <> 'REJECTED'
           group by category
        ) c
    ),
    'by_status', (
      select coalesce(jsonb_object_agg(status, total), '{}'::jsonb)
        from (select status, sum(amount) as total from scope group by status) s
    )
  );
$$;

revoke all on function public.erp_expense_summary(date, date) from public;
grant execute on function public.erp_expense_summary(date, date) to authenticated;

-- ─── Grants ─────────────────────────────────────────────────────────────────

revoke all on public.erp_employee_salary  from anon;
revoke all on public.erp_payroll_periods  from anon;
revoke all on public.erp_payroll_records  from anon;
revoke all on public.erp_payroll_items    from anon;
revoke all on public.erp_expenses         from anon;

-- Salary: admin-only end to end (RLS below); every write also goes through
-- the caller's own session so RLS is the real gate, matching this codebase's
-- convention (service-role is never used for ordinary ERP writes).
grant select, insert, update on public.erp_employee_salary to authenticated;

-- Payroll periods/records/items: read is broader (an employee reads their
-- own payroll_records), every write is a SECURITY DEFINER function above —
-- no direct insert/update/delete grant needed on periods/records/items.
grant select on public.erp_payroll_periods to authenticated;
grant select on public.erp_payroll_records to authenticated;
grant select on public.erp_payroll_items   to authenticated;

grant select on public.erp_expenses to authenticated;
grant insert (expense_date, category, employee_id, vendor_name, amount, description, receipt_url, payment_mode)
  on public.erp_expenses to authenticated;
grant update (expense_date, category, vendor_name, amount, description, receipt_url, payment_mode)
  on public.erp_expenses to authenticated;

revoke all on function public.erp_recalculate_payroll_record(uuid) from public;
revoke all on function public.erp_generate_payroll_period(integer, integer) from public;
revoke all on function public.erp_add_payroll_item(uuid, public.erp_payroll_item_type, text, numeric) from public;
revoke all on function public.erp_delete_payroll_item(uuid) from public;
revoke all on function public.erp_finalize_payroll(uuid) from public;
revoke all on function public.erp_reopen_payroll(uuid, text) from public;
revoke all on function public.erp_mark_payroll_paid(uuid) from public;
revoke all on function public.erp_review_expense(uuid, public.erp_expense_status, text) from public;

grant execute on function public.erp_generate_payroll_period(integer, integer) to authenticated;
grant execute on function public.erp_add_payroll_item(uuid, public.erp_payroll_item_type, text, numeric) to authenticated;
grant execute on function public.erp_delete_payroll_item(uuid) to authenticated;
grant execute on function public.erp_finalize_payroll(uuid) to authenticated;
grant execute on function public.erp_reopen_payroll(uuid, text) to authenticated;
grant execute on function public.erp_mark_payroll_paid(uuid) to authenticated;
grant execute on function public.erp_review_expense(uuid, public.erp_expense_status, text) to authenticated;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.erp_employee_salary enable row level security;
alter table public.erp_payroll_periods enable row level security;
alter table public.erp_payroll_records enable row level security;
alter table public.erp_payroll_items   enable row level security;
alter table public.erp_expenses        enable row level security;

drop policy if exists erp_employee_salary_select on public.erp_employee_salary;
create policy erp_employee_salary_select on public.erp_employee_salary
  for select to authenticated using (public.erp_is_admin());

drop policy if exists erp_employee_salary_write on public.erp_employee_salary;
create policy erp_employee_salary_write on public.erp_employee_salary
  for all to authenticated using (public.erp_is_admin()) with check (public.erp_is_admin());

drop policy if exists erp_payroll_periods_select on public.erp_payroll_periods;
create policy erp_payroll_periods_select on public.erp_payroll_periods
  for select to authenticated using (public.erp_is_admin());

drop policy if exists erp_payroll_records_select on public.erp_payroll_records;
create policy erp_payroll_records_select on public.erp_payroll_records
  for select to authenticated
  using (employee_id = public.erp_current_user_id() or public.erp_is_admin());

drop policy if exists erp_payroll_items_select on public.erp_payroll_items;
create policy erp_payroll_items_select on public.erp_payroll_items
  for select to authenticated
  using (exists (
    select 1 from public.erp_payroll_records pr
     where pr.id = payroll_record_id
       and (pr.employee_id = public.erp_current_user_id() or public.erp_is_admin())
  ));

drop policy if exists erp_expenses_select on public.erp_expenses;
create policy erp_expenses_select on public.erp_expenses
  for select to authenticated
  using (employee_id = public.erp_current_user_id() or public.erp_is_admin());

drop policy if exists erp_expenses_insert on public.erp_expenses;
create policy erp_expenses_insert on public.erp_expenses
  for insert to authenticated
  with check (employee_id = public.erp_current_user_id());

-- Self may edit the business details only while still awaiting review — once
-- approved/rejected/paid it is a decided record, not a draft.
drop policy if exists erp_expenses_self_update on public.erp_expenses;
create policy erp_expenses_self_update on public.erp_expenses
  for update to authenticated
  using (employee_id = public.erp_current_user_id() and status = 'SUBMITTED')
  with check (employee_id = public.erp_current_user_id() and status = 'SUBMITTED');

drop policy if exists erp_expenses_admin_update on public.erp_expenses;
create policy erp_expenses_admin_update on public.erp_expenses
  for update to authenticated
  using (public.erp_is_admin()) with check (public.erp_is_admin());
