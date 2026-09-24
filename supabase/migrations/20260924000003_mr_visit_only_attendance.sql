-- ============================================================================
-- MR attendance is decided by field-visit targets ONLY, never clock time.
--
-- Previously an MR's day was judged the same way as any other employee's:
-- checked-in and checked-out for at least min_full_day_minutes → PRESENT,
-- between the half/full thresholds → HALF_DAY, below half → PENDING_REVIEW,
-- with a shortfall against the doctor/chemist visit target only ever
-- downgrading an already-PRESENT day to PRESENT_WITH_EXCEPTION (still paid
-- as present, just flagged).
--
-- Per the business rule given: an MR has no fixed workday start time and no
-- minimum working-minutes requirement — what an MR is actually judged on is
-- checking in, checking out, and hitting that day's doctor/chemist visit
-- targets. So for an MR:
--   - No check-in  -> ABSENT (unchanged).
--   - Checked in, never checked out -> PENDING_REVIEW (unchanged) — still
--     needs a human, never an automatic guess.
--   - Checked in AND out, visit targets met -> PRESENT.
--   - Checked in AND out, visit targets NOT met -> PENDING_REVIEW (not
--     PRESENT_WITH_EXCEPTION any more) — admin/HR reviews it on the
--     Attendance -> Review screen (erp_admin_correct_attendance, already
--     built) and marks it PRESENT or ABSENT with a remark. There is no more
--     silent "present anyway" outcome for a missed target.
--   - min_full_day_minutes/min_half_day_minutes are no longer read for an
--     MR at all. total_working_minutes is still recorded for reference.
--
-- Non-MR employees (Accountant, HR, warehouse, etc.) have no visit data to
-- judge them by, so their clock-time-based rule is completely unchanged.
-- GPS validation also applies to both, unchanged — it's metadata captured
-- as part of checking in/out itself, not a separate criterion.
-- ============================================================================

create or replace function public.erp_calculate_attendance(p_attendance_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r                   record;
  v_rules             record;
  v_required_doctor   integer;
  v_required_chemist  integer;
  v_doctor_count      integer := 0;
  v_chemist_count     integer := 0;
  v_working_minutes   integer;
  v_status            public.erp_attendance_status;
  v_remarks           text[] := '{}';
  v_gps_ok            boolean := true;
  v_week_off_days     smallint[];
begin
  select a.*, u.role, u.week_off_days as user_week_off_days
    into r
    from public.erp_attendance a
    join public.erp_users u on u.id = a.employee_id
   where a.id = p_attendance_id
   for update of a;

  if not found or r.is_manual_override then
    return;
  end if;

  select * into v_rules from public.erp_attendance_rules where id = 1;

  -- Holiday takes precedence over everything else.
  if exists (select 1 from public.erp_holidays where holiday_date = r.date) then
    update public.erp_attendance
       set attendance_status = 'HOLIDAY', remarks = null
     where id = p_attendance_id;
    return;
  end if;

  -- Approved leave.
  if exists (
    select 1 from public.erp_leave_requests
     where employee_id = r.employee_id and status = 'APPROVED'
       and r.date between from_date and to_date
  ) then
    update public.erp_attendance
       set attendance_status = 'LEAVE', remarks = 'Approved leave'
     where id = p_attendance_id;
    return;
  end if;

  -- Weekly off (per-employee override, else the company default).
  v_week_off_days := coalesce(r.user_week_off_days, v_rules.default_week_off_days);
  if extract(dow from r.date)::smallint = any(v_week_off_days) then
    update public.erp_attendance
       set attendance_status = 'WEEK_OFF', remarks = null
     where id = p_attendance_id;
    return;
  end if;

  -- No check-in at all: nothing worked, nothing excused.
  if r.check_in_time is null then
    update public.erp_attendance
       set attendance_status = 'ABSENT', remarks = 'No check-in recorded'
     where id = p_attendance_id;
    return;
  end if;

  -- GPS validation — an exception, never an automatic absence (spec §6).
  if v_rules.gps_required then
    if r.check_in_latitude is null or r.check_in_longitude is null
       or (r.check_in_accuracy is not null and r.check_in_accuracy > v_rules.min_gps_accuracy_meters) then
      v_gps_ok := false;
      v_remarks := v_remarks || 'Check-in location missing or inaccurate'::text;
    end if;
    if r.check_out_time is not null and (
         r.check_out_latitude is null or r.check_out_longitude is null
         or (r.check_out_accuracy is not null and r.check_out_accuracy > v_rules.min_gps_accuracy_meters)
       ) then
      v_gps_ok := false;
      v_remarks := v_remarks || 'Check-out location missing or inaccurate'::text;
    end if;
  end if;

  -- Checked in but never checked out: needs a human, not a guess.
  if r.check_out_time is null then
    update public.erp_attendance
       set attendance_status = 'PENDING_REVIEW',
           remarks = array_to_string(v_remarks || 'Missing check-out'::text, '; ')
     where id = p_attendance_id;
    return;
  end if;

  v_working_minutes := round(extract(epoch from (r.check_out_time - r.check_in_time)) / 60)::integer;

  if r.role = 'MR' then
    -- MR: decided entirely by field-visit targets, never by clock time.
    select coalesce(t.required_doctor_visits,  v_rules.default_mr_doctor_visits),
           coalesce(t.required_chemist_visits, v_rules.default_mr_chemist_visits)
      into v_required_doctor, v_required_chemist
      from (select 1) as _dummy
      left join public.erp_mr_attendance_targets t on t.mr_id = r.employee_id;

    select count(*) into v_doctor_count
      from public.erp_doctor_visits where mr_id = r.employee_id and visit_date = r.date;
    select count(*) into v_chemist_count
      from public.erp_chemist_visits where mr_id = r.employee_id and visit_date = r.date;

    if v_doctor_count >= v_required_doctor and v_chemist_count >= v_required_chemist then
      v_status := 'PRESENT';
    else
      -- No more silent "present anyway" for a missed target — a human
      -- decides present or absent from here, with a remark.
      v_status := 'PENDING_REVIEW';
      v_remarks := v_remarks || format(
        'Field visits %s/%s doctor, %s/%s chemist — below target, needs review',
        v_doctor_count, v_required_doctor, v_chemist_count, v_required_chemist
      );
    end if;
  else
    -- Non-MR: unchanged — there is no visit data to judge them by, so this
    -- stays the clock-time rule it always was.
    if v_working_minutes < v_rules.min_half_day_minutes then
      v_status := 'PENDING_REVIEW';
      v_remarks := v_remarks || format('Working time %s min is below the half-day minimum', v_working_minutes);
    elsif v_working_minutes < v_rules.min_full_day_minutes then
      v_status := 'HALF_DAY';
      v_remarks := v_remarks || format('Working time %s min is below the full-day minimum', v_working_minutes);
    else
      v_status := 'PRESENT';
    end if;
  end if;

  if v_status = 'PRESENT' and not v_gps_ok then
    v_status := 'PRESENT_WITH_EXCEPTION';
  end if;

  update public.erp_attendance
     set attendance_status       = v_status,
         total_working_minutes   = v_working_minutes,
         doctor_visit_count      = v_doctor_count,
         chemist_visit_count     = v_chemist_count,
         required_doctor_visits  = case when r.role = 'MR' then v_required_doctor  else null end,
         required_chemist_visits = case when r.role = 'MR' then v_required_chemist else null end,
         remarks                 = nullif(array_to_string(v_remarks, '; '), '')
   where id = p_attendance_id;
end;
$$;
