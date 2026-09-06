-- ============================================================================
-- LEOMED PHARMA ERP — HR: ATTENDANCE + LEAVE
--
-- Reuses the existing staff directory (erp_users), role system (erp_role),
-- audit trigger (erp_audit_trigger) and settings-singleton pattern
-- (erp_settings) rather than inventing parallel employee/audit systems.
--
-- Core business rule (kept in exactly one place: erp_calculate_attendance):
--   ADMIN     — no attendance record is ever required.
--   MR        — check-in + check-out + working time + GPS + doctor/chemist
--               visit counts, the visit counts read live from the EXISTING
--               erp_doctor_visits / erp_chemist_visits tables — no second
--               visit system is created.
--   Everyone
--   else      — check-in + check-out + working time + GPS. Never evaluated
--               against a visit target.
-- ============================================================================

-- ─── Employee-master additions (reuse erp_users; do not fork a new table) ───

alter table public.erp_users add column if not exists department text;
alter table public.erp_users add column if not exists employee_code text;
-- Per-employee weekly-off override, e.g. '{0}' = Sunday only (0=Sun..6=Sat).
-- Null means "use the company default" from erp_attendance_rules.
alter table public.erp_users add column if not exists week_off_days smallint[];

create unique index if not exists erp_users_employee_code_key
  on public.erp_users (upper(employee_code)) where employee_code is not null;
create index if not exists erp_users_department_idx on public.erp_users (department);

-- ─── Enums ──────────────────────────────────────────────────────────────────

do $$ begin
  create type public.erp_attendance_status as enum (
    'PRESENT', 'PRESENT_WITH_EXCEPTION', 'ABSENT', 'HALF_DAY',
    'LEAVE', 'HOLIDAY', 'WEEK_OFF', 'PENDING_REVIEW'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.erp_attendance_source as enum ('MOBILE_APP', 'WEB', 'ADMIN_MANUAL', 'SYSTEM_AUTO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.erp_leave_status as enum ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
exception when duplicate_object then null; end $$;

-- ─── Attendance rules (singleton — mirrors erp_settings) ───────────────────
-- Admin-configurable so none of these are hard-coded in the frontend (spec §7).

create table if not exists public.erp_attendance_rules (
  id                                smallint primary key default 1 check (id = 1),
  work_start_time                   time    not null default '09:30:00',
  grace_period_minutes              integer not null default 15  check (grace_period_minutes >= 0),
  min_full_day_minutes              integer not null default 480 check (min_full_day_minutes > 0),
  min_half_day_minutes              integer not null default 240 check (min_half_day_minutes > 0),
  late_threshold_minutes            integer not null default 30  check (late_threshold_minutes >= 0),
  early_checkout_threshold_minutes  integer not null default 30  check (early_checkout_threshold_minutes >= 0),
  gps_required                      boolean not null default true,
  min_gps_accuracy_meters           numeric(8,2) not null default 100 check (min_gps_accuracy_meters > 0),
  -- Global MR field-activity targets; erp_mr_attendance_targets overrides
  -- these per MR (spec §8 — individual settings override global settings).
  default_mr_doctor_visits          integer not null default 8 check (default_mr_doctor_visits >= 0),
  default_mr_chemist_visits         integer not null default 4 check (default_mr_chemist_visits >= 0),
  -- 0=Sunday .. 6=Saturday. Per-employee override lives on erp_users.week_off_days.
  default_week_off_days             smallint[] not null default '{0}',
  updated_at                        timestamptz not null default now(),

  constraint erp_attendance_rules_half_lt_full check (min_half_day_minutes < min_full_day_minutes)
);

insert into public.erp_attendance_rules (id) values (1) on conflict (id) do nothing;

drop trigger if exists erp_attendance_rules_touch on public.erp_attendance_rules;
create trigger erp_attendance_rules_touch before update on public.erp_attendance_rules
  for each row execute function public.erp_touch_updated_at();

-- ─── Per-MR visit-target override ───────────────────────────────────────────

create table if not exists public.erp_mr_attendance_targets (
  mr_id                  uuid primary key references public.erp_users(id) on delete cascade,
  required_doctor_visits  integer not null check (required_doctor_visits >= 0),
  required_chemist_visits integer not null check (required_chemist_visits >= 0),
  created_by uuid references public.erp_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists erp_mr_attendance_targets_touch on public.erp_mr_attendance_targets;
create trigger erp_mr_attendance_targets_touch before update on public.erp_mr_attendance_targets
  for each row execute function public.erp_touch_updated_at();

-- ─── Holidays ───────────────────────────────────────────────────────────────

create table if not exists public.erp_holidays (
  id           uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  name         text not null check (length(trim(name)) > 0),
  created_by   uuid references public.erp_users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists erp_holidays_date_idx on public.erp_holidays (holiday_date);

-- ─── Attendance ─────────────────────────────────────────────────────────────

create table if not exists public.erp_attendance (
  id                      uuid primary key default gen_random_uuid(),
  employee_id             uuid not null references public.erp_users(id) on delete cascade,
  date                    date not null,

  check_in_time           timestamptz,
  check_out_time          timestamptz,
  check_in_latitude       numeric(9,6),
  check_in_longitude      numeric(9,6),
  check_in_accuracy       numeric(8,2),
  check_out_latitude      numeric(9,6),
  check_out_longitude     numeric(9,6),
  check_out_accuracy      numeric(8,2),

  total_working_minutes   integer,

  -- Read-through snapshot of the EXISTING erp_doctor_visits/erp_chemist_visits
  -- tables at calculation time (a cache for fast dashboards, spec §41 — never
  -- a second source of truth for visit content). Meaningless for non-MR rows.
  doctor_visit_count       integer not null default 0,
  chemist_visit_count      integer not null default 0,
  required_doctor_visits   integer,
  required_chemist_visits  integer,

  attendance_status       public.erp_attendance_status not null default 'PENDING_REVIEW',
  remarks                 text,
  source                  public.erp_attendance_source not null default 'MOBILE_APP',
  -- Set by erp_admin_correct_attendance()/leave approval — tells the
  -- automatic calculator (checkout, nightly job) to leave the row alone,
  -- so a human decision is never silently overwritten (spec §13, §17, §23).
  is_manual_override      boolean not null default false,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- The exact "prevent duplicate attendance records" constraint (spec §3).
  constraint erp_attendance_one_per_day unique (employee_id, date)
);

create index if not exists erp_attendance_date_idx        on public.erp_attendance (date);
create index if not exists erp_attendance_employee_idx    on public.erp_attendance (employee_id, date desc);
create index if not exists erp_attendance_status_idx      on public.erp_attendance (date, attendance_status);

drop trigger if exists erp_attendance_touch on public.erp_attendance;
create trigger erp_attendance_touch before update on public.erp_attendance
  for each row execute function public.erp_touch_updated_at();

-- Reuse the existing generic audit trigger — every insert/update lands in
-- erp_audit_logs with the actor, full old/new row and a timestamp, exactly
-- as it already does for erp_users (spec §18, §44). No new audit table.
drop trigger if exists erp_attendance_audit on public.erp_attendance;
create trigger erp_attendance_audit
  after insert or update or delete on public.erp_attendance
  for each row execute function public.erp_audit_trigger();

-- ─── Leave ──────────────────────────────────────────────────────────────────

create table if not exists public.erp_leave_types (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(trim(name)) > 0),
  is_paid    boolean not null default true,
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.erp_leave_types (name, is_paid, sort_order) values
  ('Casual Leave',  true,  1),
  ('Sick Leave',    true,  2),
  ('Earned Leave',  true,  3),
  ('Paid Leave',    true,  4),
  ('Unpaid Leave',  false, 5),
  ('Other',         true,  6)
on conflict (name) do nothing;

create table if not exists public.erp_leave_requests (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.erp_users(id) on delete cascade,
  leave_type_id  uuid not null references public.erp_leave_types(id) on delete restrict,
  from_date      date not null,
  to_date        date not null,
  reason         text,
  status         public.erp_leave_status not null default 'PENDING',
  admin_remarks  text,
  reviewed_by    uuid references public.erp_users(id) on delete set null,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint erp_leave_requests_range check (to_date >= from_date)
);

create index if not exists erp_leave_requests_employee_idx on public.erp_leave_requests (employee_id, created_at desc);
create index if not exists erp_leave_requests_status_idx   on public.erp_leave_requests (status);
create index if not exists erp_leave_requests_range_idx    on public.erp_leave_requests (from_date, to_date);

drop trigger if exists erp_leave_requests_touch on public.erp_leave_requests;
create trigger erp_leave_requests_touch before update on public.erp_leave_requests
  for each row execute function public.erp_touch_updated_at();

drop trigger if exists erp_leave_requests_audit on public.erp_leave_requests;
create trigger erp_leave_requests_audit
  after insert or update or delete on public.erp_leave_requests
  for each row execute function public.erp_audit_trigger();

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- One authoritative calculation (spec §47). Called by check-out, the nightly
-- job, and the admin "recalculate" action — never duplicated elsewhere.
-- Never touches a row the admin has manually decided (is_manual_override).
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
      v_remarks := v_remarks || 'Check-in location missing or inaccurate';
    end if;
    if r.check_out_time is not null and (
         r.check_out_latitude is null or r.check_out_longitude is null
         or (r.check_out_accuracy is not null and r.check_out_accuracy > v_rules.min_gps_accuracy_meters)
       ) then
      v_gps_ok := false;
      v_remarks := v_remarks || 'Check-out location missing or inaccurate';
    end if;
  end if;

  -- Checked in but never checked out: needs a human, not a guess.
  if r.check_out_time is null then
    update public.erp_attendance
       set attendance_status = 'PENDING_REVIEW',
           remarks = array_to_string(v_remarks || 'Missing check-out', '; ')
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

-- ─── Check-in / check-out ───────────────────────────────────────────────────
-- SECURITY DEFINER and no direct table grants for authenticated (below): the
-- only way to write a check-in/out is through here, so the timestamp is
-- always the server's, never a value a client could pass in (spec §4).

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

-- ─── Admin corrections ──────────────────────────────────────────────────────
-- Every call updates the row directly (never deletes/recreates it), and the
-- generic audit trigger records the before/after — including the reason,
-- which is folded into remarks (spec §17, §18).

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
  if not public.erp_is_admin() then
    raise exception 'Only an administrator can correct attendance'
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

-- Re-runs the automatic calculation on a row an admin no longer wants pinned
-- (e.g. reopening a corrected exception for a fresh look).
create or replace function public.erp_admin_recalculate_attendance(p_attendance_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator can recalculate attendance'
      using errcode = 'insufficient_privilege';
  end if;

  update public.erp_attendance set is_manual_override = false where id = p_attendance_id;
  perform public.erp_calculate_attendance(p_attendance_id);

  return (select to_jsonb(a) from public.erp_attendance a where a.id = p_attendance_id);
end;
$$;

-- ─── Daily job: absence + finalization (spec §14, §42) ─────────────────────
-- Reachable only by the service role (see grants) — driven by an external
-- scheduler (Vercel Cron hitting an API route with the service key), since
-- this project has no pg_cron extension enabled. Never finalizes payroll —
-- it only settles yesterday's attendance rows.

create or replace function public.erp_process_daily_attendance(p_date date default (current_date - 1))
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id          uuid;
  v_created     integer := 0;
  v_recalculated integer := 0;
  r             record;
begin
  for r in
    select u.id as employee_id
      from public.erp_users u
     where u.active and u.role <> 'ADMIN'
       and not exists (
         select 1 from public.erp_attendance a
          where a.employee_id = u.id and a.date = p_date
       )
  loop
    insert into public.erp_attendance (employee_id, date, source)
    values (r.employee_id, p_date, 'SYSTEM_AUTO')
    returning id into v_id;
    perform public.erp_calculate_attendance(v_id);
    v_created := v_created + 1;
  end loop;

  for r in
    select a.id
      from public.erp_attendance a
      join public.erp_users u on u.id = a.employee_id
     where a.date = p_date and not a.is_manual_override
       and u.active and u.role <> 'ADMIN'
  loop
    perform public.erp_calculate_attendance(r.id);
    v_recalculated := v_recalculated + 1;
  end loop;

  return jsonb_build_object('date', p_date, 'created', v_created, 'recalculated', v_recalculated);
end;
$$;

-- ─── Leave review + admin-created leave ─────────────────────────────────────
-- Approving a leave request stamps every date in range as LEAVE and marks it
-- manually-overridden, so the nightly job can never silently flip it back
-- (spec §23 — "do not allow contradictory states"). An admin can still
-- explicitly change a specific day afterwards via erp_admin_correct_attendance.

create or replace function public.erp_apply_leave_to_attendance(
  p_employee_id uuid,
  p_from_date   date,
  p_to_date     date,
  p_note        text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d  date := p_from_date;
  v_id uuid;
begin
  while v_d <= p_to_date loop
    select id into v_id from public.erp_attendance
     where employee_id = p_employee_id and date = v_d for update;

    if v_id is null then
      insert into public.erp_attendance (employee_id, date, attendance_status, source, is_manual_override, remarks)
      values (p_employee_id, v_d, 'LEAVE', 'SYSTEM_AUTO', true, p_note);
    else
      update public.erp_attendance
         set attendance_status = 'LEAVE', is_manual_override = true, remarks = p_note
       where id = v_id;
    end if;

    v_d := v_d + 1;
  end loop;
end;
$$;

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
  if not public.erp_is_admin() then
    raise exception 'Only an administrator can review leave requests'
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

-- Admin applying/creating leave on an employee's behalf (spec §22) — a
-- separate, fully admin-controlled entry point rather than widening the
-- self-service column grants used by erp_leave_requests_insert below.
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
  if not public.erp_is_admin() then
    raise exception 'Only an administrator can create leave for another employee'
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

-- ─── Reporting aggregate (spec §15, §41 — one query, not a client-side count
-- over every row) ────────────────────────────────────────────────────────────
-- security invoker: relies on the caller's own RLS (erp_can_read_all_field()),
-- exactly like erp_dashboard_summary in 20260904000007_erp_reporting.sql.

create or replace function public.erp_attendance_summary(
  p_date       date,
  p_role       public.erp_role default null,
  p_territory  text default null,
  p_department text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with scope as (
    select u.id, u.role
      from public.erp_users u
     where u.active and u.role <> 'ADMIN'
       and (p_role is null or u.role = p_role)
       and (p_territory is null or u.territory = p_territory)
       and (p_department is null or u.department = p_department)
  ),
  rows as (
    select coalesce(a.attendance_status::text, 'NOT_MARKED') as status
      from scope s
      left join public.erp_attendance a on a.employee_id = s.id and a.date = p_date
  )
  select jsonb_build_object(
    'date',              p_date,
    'total_employees',   (select count(*) from scope),
    'present',           (select count(*) from rows where status in ('PRESENT', 'PRESENT_WITH_EXCEPTION')),
    'absent',            (select count(*) from rows where status = 'ABSENT'),
    'half_day',          (select count(*) from rows where status = 'HALF_DAY'),
    'leave',             (select count(*) from rows where status = 'LEAVE'),
    'holiday',           (select count(*) from rows where status = 'HOLIDAY'),
    'week_off',          (select count(*) from rows where status = 'WEEK_OFF'),
    'pending_review',    (select count(*) from rows where status = 'PENDING_REVIEW'),
    'exceptions',        (select count(*) from rows where status = 'PRESENT_WITH_EXCEPTION'),
    'not_marked',        (select count(*) from rows where status = 'NOT_MARKED')
  );
$$;

revoke all on function public.erp_attendance_summary(date, public.erp_role, text, text) from public;
grant execute on function public.erp_attendance_summary(date, public.erp_role, text, text) to authenticated;

-- ─── Grants ─────────────────────────────────────────────────────────────────

revoke all on public.erp_attendance_rules       from anon;
revoke all on public.erp_mr_attendance_targets  from anon;
revoke all on public.erp_holidays               from anon;
revoke all on public.erp_attendance             from anon;
revoke all on public.erp_leave_types            from anon;
revoke all on public.erp_leave_requests         from anon;

grant select on public.erp_attendance_rules to authenticated;
grant update on public.erp_attendance_rules to authenticated; -- RLS below limits this to admins

grant select on public.erp_mr_attendance_targets to authenticated;
grant insert, update, delete on public.erp_mr_attendance_targets to authenticated; -- RLS: admin only

grant select on public.erp_holidays to authenticated;
grant insert, delete on public.erp_holidays to authenticated; -- RLS: admin only

grant select on public.erp_leave_types to authenticated;
grant insert, update on public.erp_leave_types to authenticated; -- RLS: admin only

-- erp_attendance has NO insert/update/delete grant for authenticated: every
-- write goes through a SECURITY DEFINER function above, so a client can never
-- set its own check-in/out timestamp or flip its own status directly.
grant select on public.erp_attendance to authenticated;

-- erp_leave_requests: employees may create their own request (limited
-- columns) and cancel their own pending one; every other write is a
-- SECURITY DEFINER function (review / admin-create).
grant select on public.erp_leave_requests to authenticated;
grant insert (employee_id, leave_type_id, from_date, to_date, reason) on public.erp_leave_requests to authenticated;
grant update (status) on public.erp_leave_requests to authenticated;

revoke all on function public.erp_calculate_attendance(uuid)                       from public;
revoke all on function public.erp_attendance_check_in(numeric, numeric, numeric)   from public;
revoke all on function public.erp_attendance_check_out(numeric, numeric, numeric)  from public;
revoke all on function public.erp_admin_correct_attendance(uuid, public.erp_attendance_status, timestamptz, timestamptz, text) from public;
revoke all on function public.erp_admin_recalculate_attendance(uuid)               from public;
revoke all on function public.erp_process_daily_attendance(date)                  from public;
revoke all on function public.erp_apply_leave_to_attendance(uuid, date, date, text) from public;
revoke all on function public.erp_review_leave_request(uuid, public.erp_leave_status, text) from public;
revoke all on function public.erp_admin_create_leave(uuid, uuid, date, date, text, public.erp_leave_status) from public;

grant execute on function public.erp_attendance_check_in(numeric, numeric, numeric)  to authenticated;
grant execute on function public.erp_attendance_check_out(numeric, numeric, numeric) to authenticated;
grant execute on function public.erp_admin_correct_attendance(uuid, public.erp_attendance_status, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.erp_admin_recalculate_attendance(uuid)             to authenticated;
grant execute on function public.erp_review_leave_request(uuid, public.erp_leave_status, text) to authenticated;
grant execute on function public.erp_admin_create_leave(uuid, uuid, date, date, text, public.erp_leave_status) to authenticated;
-- Nightly job only — driven by the service-role key from an API route, never by a signed-in user.
grant execute on function public.erp_process_daily_attendance(date) to service_role;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.erp_attendance_rules      enable row level security;
alter table public.erp_mr_attendance_targets enable row level security;
alter table public.erp_holidays              enable row level security;
alter table public.erp_attendance            enable row level security;
alter table public.erp_leave_types           enable row level security;
alter table public.erp_leave_requests        enable row level security;

drop policy if exists erp_attendance_rules_select on public.erp_attendance_rules;
create policy erp_attendance_rules_select on public.erp_attendance_rules
  for select to authenticated using (public.erp_is_staff());

drop policy if exists erp_attendance_rules_update on public.erp_attendance_rules;
create policy erp_attendance_rules_update on public.erp_attendance_rules
  for update to authenticated using (public.erp_is_admin()) with check (public.erp_is_admin());

drop policy if exists erp_mr_targets_select on public.erp_mr_attendance_targets;
create policy erp_mr_targets_select on public.erp_mr_attendance_targets
  for select to authenticated
  using (mr_id = public.erp_current_user_id() or public.erp_can_read_all_field());

drop policy if exists erp_mr_targets_write on public.erp_mr_attendance_targets;
create policy erp_mr_targets_write on public.erp_mr_attendance_targets
  for all to authenticated using (public.erp_is_admin()) with check (public.erp_is_admin());

drop policy if exists erp_holidays_select on public.erp_holidays;
create policy erp_holidays_select on public.erp_holidays
  for select to authenticated using (public.erp_is_staff());

drop policy if exists erp_holidays_write on public.erp_holidays;
create policy erp_holidays_write on public.erp_holidays
  for all to authenticated using (public.erp_is_admin()) with check (public.erp_is_admin());

drop policy if exists erp_attendance_select on public.erp_attendance;
create policy erp_attendance_select on public.erp_attendance
  for select to authenticated
  using (employee_id = public.erp_current_user_id() or public.erp_can_read_all_field());

drop policy if exists erp_leave_types_select on public.erp_leave_types;
create policy erp_leave_types_select on public.erp_leave_types
  for select to authenticated using (public.erp_is_staff());

drop policy if exists erp_leave_types_write on public.erp_leave_types;
create policy erp_leave_types_write on public.erp_leave_types
  for all to authenticated using (public.erp_is_admin()) with check (public.erp_is_admin());

drop policy if exists erp_leave_requests_select on public.erp_leave_requests;
create policy erp_leave_requests_select on public.erp_leave_requests
  for select to authenticated
  using (employee_id = public.erp_current_user_id() or public.erp_is_admin());

drop policy if exists erp_leave_requests_insert on public.erp_leave_requests;
create policy erp_leave_requests_insert on public.erp_leave_requests
  for insert to authenticated
  with check (employee_id = public.erp_current_user_id());

-- Self-service is limited to cancelling one's own still-pending request; every
-- other transition (approve/reject/admin-cancel) runs through
-- erp_review_leave_request(), a SECURITY DEFINER function that bypasses RLS.
drop policy if exists erp_leave_requests_self_cancel on public.erp_leave_requests;
create policy erp_leave_requests_self_cancel on public.erp_leave_requests
  for update to authenticated
  using (employee_id = public.erp_current_user_id() and status = 'PENDING')
  with check (employee_id = public.erp_current_user_id() and status = 'CANCELLED');
