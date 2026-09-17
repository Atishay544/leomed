-- ============================================================================
-- The HR role: personnel administration end to end (staff accounts, offer
-- letters, territory/area org structure, attendance, leave, payroll,
-- expenses) without admin's reach into sales, pricing, inventory or
-- settings — see HR_CAPABILITIES in lib/erp/permissions.ts for the exact
-- list and the reasoning.
--
-- "Admin has master role for everything" is enforced HERE, not just in the
-- app layer: every policy/function below that now accepts erp_is_hr() in
-- place of an admin-only check additionally refuses HR the one thing that
-- capability would otherwise let them do — create, promote to, or edit an
-- ADMIN account. Nothing else admin can do is touched; HR simply joins
-- admin on the specific HR-scoped checks this file lists.
-- ============================================================================

create or replace function public.erp_is_hr()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.erp_users
    where auth_user_id = auth.uid() and active and role = 'HR'
  );
$$;

revoke all on function public.erp_is_hr() from public;
grant execute on function public.erp_is_hr() to authenticated;

-- ─── Staff accounts ─────────────────────────────────────────────────────────
-- HR can see, add and edit every account except admin's own — the row-level
-- "role <> 'ADMIN'" guards are what actually keeps HR from ever creating an
-- admin or editing one; the app layer (Staff page, StaffPage's role
-- picklist) mirrors this only for a clean UI, per this file's usual "the
-- database wins" rule.

drop policy if exists erp_users_select on public.erp_users;
create policy erp_users_select on public.erp_users
  for select to authenticated
  using (auth_user_id = auth.uid() or public.erp_is_admin() or public.erp_is_hr() or public.erp_can_view_all_field());

drop policy if exists erp_users_insert on public.erp_users;
create policy erp_users_insert on public.erp_users
  for insert to authenticated
  with check (public.erp_is_admin() or (public.erp_is_hr() and role <> 'ADMIN'));

drop policy if exists erp_users_update on public.erp_users;
create policy erp_users_update on public.erp_users
  for update to authenticated
  using (public.erp_is_admin() or auth_user_id = auth.uid() or (public.erp_is_hr() and role <> 'ADMIN'))
  with check (public.erp_is_admin() or auth_user_id = auth.uid() or (public.erp_is_hr() and role <> 'ADMIN'));

-- erp_guard_user_self_update (20260904000006) exists to stop a non-admin
-- sneaking a role/active/etc change past RLS on their OWN row — the only
-- row RLS ever let a non-admin touch, until the policy above. Without this
-- update, the trigger's blanket "not admin? then no role/active/etc change"
-- rule would also block HR from doing the exact job the policy above just
-- granted them on someone ELSE's row (deactivating a leaver, correcting a
-- role). It must still apply in full when HR edits their OWN row — HR
-- self-promoting is exactly the self-service loophole this trigger exists
-- to close, same as for any other non-admin.
create or replace function public.erp_guard_user_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.erp_is_admin() then
    return new;
  end if;

  if public.erp_is_hr() and old.auth_user_id is distinct from auth.uid() then
    return new;
  end if;

  if new.role         is distinct from old.role
     or new.active       is distinct from old.active
     or new.mr_code      is distinct from old.mr_code
     or new.territory    is distinct from old.territory
     or new.reports_to   is distinct from old.reports_to
     or new.auth_user_id is distinct from old.auth_user_id
     or new.email        is distinct from old.email
  then
    raise exception 'Only an administrator can change role, MR code, territory, email or account status'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- ─── Territories & areas ────────────────────────────────────────────────────

drop policy if exists erp_territories_write on public.erp_territories;
create policy erp_territories_write on public.erp_territories
  for all to authenticated
  using (public.erp_is_admin() or public.erp_is_hr())
  with check (public.erp_is_admin() or public.erp_is_hr());

drop policy if exists erp_areas_write on public.erp_areas;
create policy erp_areas_write on public.erp_areas
  for all to authenticated
  using (public.erp_is_admin() or public.erp_is_hr())
  with check (public.erp_is_admin() or public.erp_is_hr());

create or replace function public.erp_reassign_mr(p_from_mr uuid, p_to_mr uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_territories integer;
  v_areas       integer;
begin
  if not (public.erp_is_admin() or public.erp_is_hr()) then
    raise exception 'Only an administrator or HR may reassign areas' using errcode = 'insufficient_privilege';
  end if;
  if p_from_mr is null or p_to_mr is null then
    raise exception 'Choose both an MR to reassign from and an MR to reassign to';
  end if;
  if p_from_mr = p_to_mr then
    raise exception 'Choose a different MR to reassign to';
  end if;

  update public.erp_territories set mr_id = p_to_mr where mr_id = p_from_mr;
  get diagnostics v_territories = row_count;

  update public.erp_areas set mr_id = p_to_mr where mr_id = p_from_mr;
  get diagnostics v_areas = row_count;

  return jsonb_build_object('territories_reassigned', v_territories, 'areas_reassigned', v_areas);
end;
$$;

create or replace function public.erp_reassign_distributor(p_from_distributor uuid, p_to_distributor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_territories integer;
  v_areas       integer;
begin
  if not (public.erp_is_admin() or public.erp_is_hr()) then
    raise exception 'Only an administrator or HR may reassign territories' using errcode = 'insufficient_privilege';
  end if;
  if p_from_distributor is null or p_to_distributor is null then
    raise exception 'Choose both a distributor to reassign from and a distributor to reassign to';
  end if;
  if p_from_distributor = p_to_distributor then
    raise exception 'Choose a different distributor to reassign to';
  end if;

  update public.erp_territories set distributor_id = p_to_distributor where distributor_id = p_from_distributor;
  get diagnostics v_territories = row_count;

  update public.erp_areas set distributor_id = p_to_distributor where distributor_id = p_from_distributor;
  get diagnostics v_areas = row_count;

  return jsonb_build_object('territories_reassigned', v_territories, 'areas_reassigned', v_areas);
end;
$$;

-- ─── Offer letters ──────────────────────────────────────────────────────────

drop policy if exists erp_offer_letters_all on public.erp_offer_letters;
create policy erp_offer_letters_all on public.erp_offer_letters
  for all to authenticated
  using (public.erp_is_admin() or public.erp_is_hr())
  with check (public.erp_is_admin() or public.erp_is_hr());

drop policy if exists erp_offer_letter_components_all on public.erp_offer_letter_components;
create policy erp_offer_letter_components_all on public.erp_offer_letter_components
  for all to authenticated
  using (public.erp_is_admin() or public.erp_is_hr())
  with check (public.erp_is_admin() or public.erp_is_hr());

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
      incentive_terms, remarks, created_by, updated_by
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

-- ─── Attendance ─────────────────────────────────────────────────────────────

drop policy if exists erp_attendance_rules_update on public.erp_attendance_rules;
create policy erp_attendance_rules_update on public.erp_attendance_rules
  for update to authenticated
  using (public.erp_is_admin() or public.erp_is_hr())
  with check (public.erp_is_admin() or public.erp_is_hr());

drop policy if exists erp_mr_targets_write on public.erp_mr_attendance_targets;
create policy erp_mr_targets_write on public.erp_mr_attendance_targets
  for all to authenticated
  using (public.erp_is_admin() or public.erp_is_hr())
  with check (public.erp_is_admin() or public.erp_is_hr());

drop policy if exists erp_holidays_write on public.erp_holidays;
create policy erp_holidays_write on public.erp_holidays
  for all to authenticated
  using (public.erp_is_admin() or public.erp_is_hr())
  with check (public.erp_is_admin() or public.erp_is_hr());

-- HR needs to see every employee's attendance to review/correct it, same as
-- erp_can_read_all_field() already gives ADMIN/MANAGER — added directly
-- here rather than into that shared helper, since MANAGER's read-all is
-- about field-force visits/orders, a different concern HR must not gain.
drop policy if exists erp_attendance_select on public.erp_attendance;
create policy erp_attendance_select on public.erp_attendance
  for select to authenticated
  using (employee_id = public.erp_current_user_id() or public.erp_is_hr() or public.erp_can_read_all_field());

create or replace function public.erp_admin_correct_attendance(
  p_attendance_id  uuid,
  p_status         public.erp_attendance_status default null,
  p_check_in_time  timestamptz default null,
  p_check_out_time timestamptz default null,
  p_reason         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_in  timestamptz;
  v_out timestamptz;
begin
  if not (public.erp_is_admin() or public.erp_is_hr()) then
    raise exception 'Only an administrator or HR can correct attendance'
      using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A reason is required to correct attendance';
  end if;

  select check_in_time, check_out_time into v_in, v_out
    from public.erp_attendance where id = p_attendance_id for update;
  if not found then
    raise exception 'Attendance record not found';
  end if;

  v_in  := coalesce(p_check_in_time, v_in);
  v_out := coalesce(p_check_out_time, v_out);

  update public.erp_attendance
     set attendance_status     = coalesce(p_status, attendance_status),
         check_in_time         = v_in,
         check_out_time        = v_out,
         total_working_minutes = case when v_in is not null and v_out is not null
                                       then round(extract(epoch from (v_out - v_in)) / 60)::integer
                                       else total_working_minutes end,
         remarks               = trim(both ' ' from
                                    coalesce(remarks || ' — ', '') || 'Admin correction: ' || p_reason),
         is_manual_override    = true
   where id = p_attendance_id;

  return (select to_jsonb(a) from public.erp_attendance a where a.id = p_attendance_id);
end;
$$;

create or replace function public.erp_admin_recalculate_attendance(p_attendance_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.erp_is_admin() or public.erp_is_hr()) then
    raise exception 'Only an administrator or HR can recalculate attendance'
      using errcode = 'insufficient_privilege';
  end if;

  update public.erp_attendance set is_manual_override = false where id = p_attendance_id;
  perform public.erp_calculate_attendance(p_attendance_id);

  return (select to_jsonb(a) from public.erp_attendance a where a.id = p_attendance_id);
end;
$$;

-- ─── Leave ──────────────────────────────────────────────────────────────────

drop policy if exists erp_leave_types_write on public.erp_leave_types;
create policy erp_leave_types_write on public.erp_leave_types
  for all to authenticated
  using (public.erp_is_admin() or public.erp_is_hr())
  with check (public.erp_is_admin() or public.erp_is_hr());

drop policy if exists erp_leave_requests_select on public.erp_leave_requests;
create policy erp_leave_requests_select on public.erp_leave_requests
  for select to authenticated
  using (employee_id = public.erp_current_user_id() or public.erp_is_admin() or public.erp_is_hr());

create or replace function public.erp_review_leave_request(
  p_leave_id      uuid,
  p_status        public.erp_leave_status,
  p_admin_remarks text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.erp_leave_requests%rowtype;
begin
  if not (public.erp_is_admin() or public.erp_is_hr()) then
    raise exception 'Only an administrator or HR can review leave requests'
      using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('APPROVED', 'REJECTED', 'CANCELLED') then
    raise exception 'A review must set the request to Approved, Rejected or Cancelled';
  end if;

  select * into v_row from public.erp_leave_requests where id = p_leave_id for update;
  if not found then
    raise exception 'Leave request not found';
  end if;

  update public.erp_leave_requests
     set status = p_status, admin_remarks = p_admin_remarks,
         reviewed_by = public.erp_current_user_id(), reviewed_at = now()
   where id = p_leave_id;

  if p_status = 'APPROVED' then
    perform public.erp_apply_leave_to_attendance(v_row.employee_id, v_row.from_date, v_row.to_date, 'Approved leave');
  end if;

  return jsonb_build_object('leave_id', p_leave_id, 'status', p_status);
end;
$$;

create or replace function public.erp_admin_create_leave(
  p_employee_id   uuid,
  p_leave_type_id uuid,
  p_from_date     date,
  p_to_date       date,
  p_reason        text default null,
  p_status        public.erp_leave_status default 'APPROVED'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not (public.erp_is_admin() or public.erp_is_hr()) then
    raise exception 'Only an administrator or HR can create leave for another employee'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.erp_leave_requests (
    employee_id, leave_type_id, from_date, to_date, reason, status,
    reviewed_by, reviewed_at
  ) values (
    p_employee_id, p_leave_type_id, p_from_date, p_to_date, p_reason, p_status,
    case when p_status <> 'PENDING' then public.erp_current_user_id() end,
    case when p_status <> 'PENDING' then now() end
  )
  returning id into v_id;

  if p_status = 'APPROVED' then
    perform public.erp_apply_leave_to_attendance(p_employee_id, p_from_date, p_to_date, 'Approved leave');
  end if;

  return jsonb_build_object('leave_id', v_id, 'status', p_status);
end;
$$;

-- ─── Payroll & salary ───────────────────────────────────────────────────────
-- This reverses a previously "deliberately ADMIN-only" line (see
-- 20260906000003_hr_payroll_expenses.sql) — an explicit, intentional product
-- decision for this feature, not an oversight: payroll and salary
-- administration is routine HR work everywhere else, and HR now exists as a
-- role specifically to hold it.

drop policy if exists erp_employee_salary_select on public.erp_employee_salary;
create policy erp_employee_salary_select on public.erp_employee_salary
  for select to authenticated using (public.erp_is_admin() or public.erp_is_hr());

drop policy if exists erp_employee_salary_write on public.erp_employee_salary;
create policy erp_employee_salary_write on public.erp_employee_salary
  for all to authenticated
  using (public.erp_is_admin() or public.erp_is_hr())
  with check (public.erp_is_admin() or public.erp_is_hr());

drop policy if exists erp_payroll_periods_select on public.erp_payroll_periods;
create policy erp_payroll_periods_select on public.erp_payroll_periods
  for select to authenticated using (public.erp_is_admin() or public.erp_is_hr());

drop policy if exists erp_payroll_records_select on public.erp_payroll_records;
create policy erp_payroll_records_select on public.erp_payroll_records
  for select to authenticated
  using (employee_id = public.erp_current_user_id() or public.erp_is_admin() or public.erp_is_hr());

drop policy if exists erp_payroll_items_select on public.erp_payroll_items;
create policy erp_payroll_items_select on public.erp_payroll_items
  for select to authenticated
  using (exists (
    select 1 from public.erp_payroll_records pr
     where pr.id = payroll_record_id
       and (pr.employee_id = public.erp_current_user_id() or public.erp_is_admin() or public.erp_is_hr())
  ));

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
  if not (public.erp_is_admin() or public.erp_is_hr()) then
    raise exception 'Only an administrator or HR can add payroll items' using errcode = 'insufficient_privilege';
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
  if not (public.erp_is_admin() or public.erp_is_hr()) then
    raise exception 'Only an administrator or HR can remove payroll items' using errcode = 'insufficient_privilege';
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
  if not (public.erp_is_admin() or public.erp_is_hr()) then
    raise exception 'Only an administrator or HR can finalize payroll' using errcode = 'insufficient_privilege';
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

create or replace function public.erp_reopen_payroll(p_period_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.erp_payroll_status;
begin
  if not (public.erp_is_admin() or public.erp_is_hr()) then
    raise exception 'Only an administrator or HR can reopen payroll' using errcode = 'insufficient_privilege';
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
  if not (public.erp_is_admin() or public.erp_is_hr()) then
    raise exception 'Only an administrator or HR can mark payroll as paid' using errcode = 'insufficient_privilege';
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

-- ─── Expenses ───────────────────────────────────────────────────────────────

drop policy if exists erp_expenses_select on public.erp_expenses;
create policy erp_expenses_select on public.erp_expenses
  for select to authenticated
  using (employee_id = public.erp_current_user_id() or public.erp_is_admin() or public.erp_is_hr());

drop policy if exists erp_expenses_admin_update on public.erp_expenses;
create policy erp_expenses_admin_update on public.erp_expenses
  for update to authenticated
  using (public.erp_is_admin() or public.erp_is_hr())
  with check (public.erp_is_admin() or public.erp_is_hr());

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
  if not (public.erp_is_admin() or public.erp_is_hr()) then
    raise exception 'Only an administrator or HR can review expenses' using errcode = 'insufficient_privilege';
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
