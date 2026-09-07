-- ============================================================================
-- LEOMED PHARMA ERP — FIX: check-in must stamp its own "pending review"
-- explanation, not rely on a bare column default.
--
-- erp_attendance_check_out() already calls erp_calculate_attendance(v_id)
-- after recording the check-out (20260906000002_hr_attendance_leave.sql:475)
-- so that a short/incomplete day gets its real status and a remark
-- explaining why. erp_attendance_check_in() never made the matching call —
-- a freshly checked-in row only ever showed PENDING_REVIEW because that
-- happens to be the column's bare default (erp_attendance.attendance_status
-- default 'PENDING_REVIEW'), with remarks left null. Anyone looking at
-- today's attendance mid-day before checkout saw a status with no
-- explanation, instead of erp_calculate_attendance's own
-- "Missing check-out" remark (the code path already exists for this exact
-- case — it was simply never reached at check-in time).
--
-- Fix: call erp_calculate_attendance(v_id) at the end of check-in too,
-- exactly the same way check-out already does. Every other line of the
-- function (verified against the complete current body first) is
-- byte-for-byte unchanged.
-- ============================================================================

create or replace function public.erp_attendance_check_in(
  p_latitude  numeric default null,
  p_longitude numeric default null,
  p_accuracy  numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid := public.erp_current_user_id();
  v_role     public.erp_role := public.erp_current_role();
  v_id       uuid;
  v_existing timestamptz;
begin
  if v_actor is null then
    raise exception 'Your account is not an active Leomed staff account'
      using errcode = 'insufficient_privilege';
  end if;
  if v_role = 'ADMIN' then
    raise exception 'Administrators do not require attendance tracking';
  end if;

  select id, check_in_time into v_id, v_existing
    from public.erp_attendance
   where employee_id = v_actor and date = current_date
   for update;

  if found and v_existing is not null then
    raise exception 'You have already checked in today';
  end if;

  if found then
    update public.erp_attendance
       set check_in_time      = now(),
           check_in_latitude  = p_latitude,
           check_in_longitude = p_longitude,
           check_in_accuracy  = p_accuracy,
           source             = 'MOBILE_APP'
     where id = v_id;
  else
    insert into public.erp_attendance (
      employee_id, date, check_in_time, check_in_latitude, check_in_longitude,
      check_in_accuracy, source
    ) values (
      v_actor, current_date, now(), p_latitude, p_longitude, p_accuracy, 'MOBILE_APP'
    )
    returning id into v_id;
  end if;

  perform public.erp_calculate_attendance(v_id);

  return jsonb_build_object(
    'attendance_id', v_id,
    'check_in_time', (select check_in_time from public.erp_attendance where id = v_id)
  );
end;
$$;
