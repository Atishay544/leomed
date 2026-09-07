-- ============================================================================
-- LEOMED PHARMA ERP — FIX: erp_attendance_check_in()/check_out() only
-- excluded ADMIN by role; any other role — including VIEWER, which holds no
-- attendance.checkin capability at all in permissions.ts — could check in
-- via a direct RPC call, bypassing the Next.js action's assertCapability()
-- check entirely (exactly the "hiding an action in the app layer is not the
-- same as the database refusing it" gap this codebase otherwise guards
-- against everywhere else).
--
-- Found via a targeted diagnostic after
-- supabase/tests/erp_role_capability_matrix.sql flagged it as a "known
-- finding" (confirmed: a VIEWER's check-in call succeeded).
--
-- Fix: an explicit allow-list of roles that actually do attendance (MR,
-- ACCOUNTANT, MANAGER — the same three permissions.ts grants
-- attendance.checkin to), on both check-in and check-out. The ADMIN-specific
-- message is kept as its own check first since it's a clearer message for
-- the one role most likely to hit this by accident; every other excluded
-- role (today just VIEWER, any future read-only role automatically too)
-- gets a generic refusal. Every other line (verified against the complete
-- current body of each function first) is byte-for-byte unchanged.
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
  if v_role not in ('MR', 'ACCOUNTANT', 'MANAGER') then
    raise exception 'Your role does not require attendance tracking'
      using errcode = 'insufficient_privilege';
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

create or replace function public.erp_attendance_check_out(
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
  v_actor uuid := public.erp_current_user_id();
  v_role  public.erp_role := public.erp_current_role();
  v_id    uuid;
  v_in    timestamptz;
  v_out   timestamptz;
begin
  if v_actor is null then
    raise exception 'Your account is not an active Leomed staff account'
      using errcode = 'insufficient_privilege';
  end if;
  if v_role = 'ADMIN' then
    raise exception 'Administrators do not require attendance tracking';
  end if;
  if v_role not in ('MR', 'ACCOUNTANT', 'MANAGER') then
    raise exception 'Your role does not require attendance tracking'
      using errcode = 'insufficient_privilege';
  end if;

  select id, check_in_time, check_out_time into v_id, v_in, v_out
    from public.erp_attendance
   where employee_id = v_actor and date = current_date
   for update;

  if not found or v_in is null then
    raise exception 'Check in before you can check out';
  end if;
  if v_out is not null then
    raise exception 'You have already checked out today';
  end if;

  update public.erp_attendance
     set check_out_time      = now(),
         check_out_latitude  = p_latitude,
         check_out_longitude = p_longitude,
         check_out_accuracy  = p_accuracy
   where id = v_id;

  perform public.erp_calculate_attendance(v_id);

  return (select to_jsonb(a) from public.erp_attendance a where a.id = v_id);
end;
$$;
