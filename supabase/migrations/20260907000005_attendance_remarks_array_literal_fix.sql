-- ============================================================================
-- LEOMED PHARMA ERP — FIX: appending a bare string literal to a text[]
-- variable is genuinely ambiguous to Postgres, not just untyped.
--
-- erp_calculate_attendance() builds up its remarks as `v_remarks :=
-- v_remarks || '<literal>'` (or inline in an UPDATE). Where the literal is
-- wrapped in format(...) that's unambiguous (format() returns a concrete
-- text), but three spots concatenate a BARE, untyped string literal
-- straight onto the text[] array. An untyped literal can be coerced to
-- either `text` (array_append — the intended meaning) or `text[]`
-- (array_cat), and Postgres's operator resolution picks the array
-- interpretation, then fails to parse the plain string as a `{...}` array
-- literal:
--
--   ERROR: malformed array literal: "Missing check-out"
--
-- This was never caught before because none of the three lines had ever
-- actually run: the "Missing check-out" branch only became reachable once
-- erp_attendance_check_in() started calling erp_calculate_attendance()
-- (20260907000004), and the two GPS-remark lines only run when GPS
-- validation actually fails, which no test run had exercised yet.
--
-- Fix: cast each literal to ::text explicitly, so the operator resolves to
-- array_append (a single element), never array_cat. Every other line
-- (verified against the complete current body first) is byte-for-byte
-- unchanged.
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

  -- MR-only: today's counts read live from the EXISTING visit tables.
  if r.role = 'MR' then
    select coalesce(t.required_doctor_visits,  v_rules.default_mr_doctor_visits),
           coalesce(t.required_chemist_visits, v_rules.default_mr_chemist_visits)
      into v_required_doctor, v_required_chemist
      from (select 1) as _dummy
      left join public.erp_mr_attendance_targets t on t.mr_id = r.employee_id;

    select count(*) into v_doctor_count
      from public.erp_doctor_visits where mr_id = r.employee_id and visit_date = r.date;
    select count(*) into v_chemist_count
      from public.erp_chemist_visits where mr_id = r.employee_id and visit_date = r.date;
  end if;

  if v_working_minutes < v_rules.min_half_day_minutes then
    -- Short of even half a day, but they did check in and out — a call for
    -- admin judgment, not an automatic fraud/absence verdict (spec §9, §17).
    v_status := 'PENDING_REVIEW';
    v_remarks := v_remarks || format('Working time %s min is below the half-day minimum', v_working_minutes);
  elsif v_working_minutes < v_rules.min_full_day_minutes then
    v_status := 'HALF_DAY';
    v_remarks := v_remarks || format('Working time %s min is below the full-day minimum', v_working_minutes);
  else
    v_status := 'PRESENT';
  end if;

  -- Visit targets apply to MRs ONLY. A non-MR employee is never evaluated
  -- against a doctor/chemist visit count (spec — the most important rule).
  if r.role = 'MR' and v_status = 'PRESENT'
     and (v_doctor_count < v_required_doctor or v_chemist_count < v_required_chemist) then
    v_status := 'PRESENT_WITH_EXCEPTION';
    v_remarks := v_remarks || format(
      'Field visits %s/%s doctor, %s/%s chemist — below target',
      v_doctor_count, v_required_doctor, v_chemist_count, v_required_chemist
    );
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
