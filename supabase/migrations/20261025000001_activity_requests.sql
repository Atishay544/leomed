-- ============================================================================
-- Doctor / chemist activity requests with hierarchical approval.
--
-- An MR or manager raises a request for an activity on one doctor (direct cash
-- benefit, conference, gift, other) or one chemist (direct cash benefit,
-- display, flex board, light board, other), with a budget. The request is
-- approved one level at a time up the erp_users.reports_to chain — requester's
-- manager first, then that manager's manager, and so on — and the approval
-- that counts is an ADMIN's. Only then is the activity APPROVED, which is
-- what "saved against that doctor/chemist" means: the approved row, tied to
-- doctor_id / chemist_id, IS the record (listed on the Approved Activities
-- screen, filterable per doctor/chemist).
--
-- Routing rules (all enforced here, not just in the app):
--   - On submit, current_approver_id = the requester's nearest ACTIVE
--     ancestor in reports_to (inactive/removed managers are skipped, cycles
--     are guarded). No ancestor at all => NULL, which means "awaiting any
--     administrator".
--   - Only the current approver (or any ADMIN) may decide a pending request.
--     Approving as a non-admin moves it to that approver's own next ancestor;
--     approving as an ADMIN finalises it. Rejecting at any level ends it.
--   - ADMIN may act at any step (same convention as leave: admin is the
--     universal fallback, e.g. when a manager is on leave or the chain is
--     broken). An ADMIN raising a request has it approved immediately.
--   - Nobody reviews their own request, except through the admin rule above.
--
-- All writes go through the three SECURITY DEFINER functions below; the
-- tables carry no INSERT/UPDATE/DELETE grant for clients, so status,
-- routing and the approval trail can never be set directly.
--
-- Names (requester, target, awaiting approver) are denormalised snapshots:
-- erp_users_select deliberately hides a manager's row from the MR below
-- them, so embedding erp_users to show "Awaiting: <manager>" would silently
-- drop the row (the same trap fixed in 8b1092d).
-- ============================================================================

create table if not exists public.erp_activity_requests (
  id                   uuid primary key default gen_random_uuid(),
  requester_id         uuid not null references public.erp_users(id) on delete restrict,
  requester_name       text not null,
  target_type          text not null check (target_type in ('DOCTOR', 'CHEMIST')),
  doctor_id            uuid references public.erp_doctors(id) on delete restrict,
  chemist_id           uuid references public.erp_chemists(id) on delete restrict,
  target_name          text not null,
  activity_type        text not null,
  budget               numeric(12,2) not null default 0 check (budget >= 0),
  description          text,
  planned_date         date,
  status               text not null default 'PENDING'
                         check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  -- NULL while PENDING = awaiting any administrator; NULL once decided.
  current_approver_id  uuid references public.erp_users(id) on delete set null,
  awaiting_name        text,
  decided_by           uuid references public.erp_users(id) on delete set null,
  decided_by_name      text,
  decided_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint erp_activity_requests_target check (
    (target_type = 'DOCTOR'  and doctor_id  is not null and chemist_id is null) or
    (target_type = 'CHEMIST' and chemist_id is not null and doctor_id  is null)
  ),
  constraint erp_activity_requests_type check (
    (target_type = 'DOCTOR'  and activity_type in ('CASH_BENEFIT', 'CONFERENCE', 'GIFT', 'OTHER')) or
    (target_type = 'CHEMIST' and activity_type in ('CASH_BENEFIT', 'DISPLAY', 'FLEX_BOARD', 'LIGHT_BOARD', 'OTHER'))
  )
);

create index if not exists erp_activity_requests_requester_idx on public.erp_activity_requests (requester_id, created_at desc);
create index if not exists erp_activity_requests_approver_idx  on public.erp_activity_requests (current_approver_id) where status = 'PENDING';
create index if not exists erp_activity_requests_status_idx    on public.erp_activity_requests (status, created_at desc);
create index if not exists erp_activity_requests_doctor_idx    on public.erp_activity_requests (doctor_id)  where doctor_id  is not null;
create index if not exists erp_activity_requests_chemist_idx   on public.erp_activity_requests (chemist_id) where chemist_id is not null;

drop trigger if exists erp_activity_requests_touch on public.erp_activity_requests;
create trigger erp_activity_requests_touch before update on public.erp_activity_requests
  for each row execute function public.erp_touch_updated_at();

drop trigger if exists erp_activity_requests_audit on public.erp_activity_requests;
create trigger erp_activity_requests_audit
  after insert or update or delete on public.erp_activity_requests
  for each row execute function public.erp_audit_trigger();

-- The approval trail: one row per event (submitted, each level's decision,
-- cancellation), in order.
create table if not exists public.erp_activity_request_steps (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.erp_activity_requests(id) on delete cascade,
  actor_id     uuid references public.erp_users(id) on delete set null,
  actor_name   text not null,
  action       text not null check (action in ('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED')),
  remarks      text,
  created_at   timestamptz not null default now()
);

create index if not exists erp_activity_request_steps_request_idx
  on public.erp_activity_request_steps (request_id, created_at);

-- ─── Routing helper ─────────────────────────────────────────────────────────
-- Nearest ACTIVE ancestor of p_user_id along reports_to; NULL if there is none.
create or replace function public.erp_activity_next_approver(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with recursive chain as (
    select u.id, u.reports_to, u.active, array[p_user_id, u.id] as path, 1 as depth
      from public.erp_users u
     where u.id = (select reports_to from public.erp_users where id = p_user_id)
    union all
    select p.id, p.reports_to, p.active, c.path || p.id, c.depth + 1
      from public.erp_users p
      join chain c on p.id = c.reports_to
     where not (p.id = any(c.path))
  )
  select id from chain where active order by depth limit 1;
$$;

revoke all on function public.erp_activity_next_approver(uuid) from public;
grant execute on function public.erp_activity_next_approver(uuid) to authenticated;

-- ─── Raise ──────────────────────────────────────────────────────────────────
create or replace function public.erp_raise_activity_request(
  p_target_type   text,
  p_target_id     uuid,
  p_activity_type text,
  p_budget        numeric,
  p_description   text default null,
  p_planned_date  date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me        uuid := public.erp_current_user_id();
  v_me_name   text;
  v_role      public.erp_role;
  v_target    text;
  v_active    boolean;
  v_desc      text := nullif(trim(coalesce(p_description, '')), '');
  v_next      uuid;
  v_next_name text;
  v_id        uuid;
begin
  if v_me is null then
    raise exception 'You must be signed in as active staff to raise an activity request'
      using errcode = 'insufficient_privilege';
  end if;

  select name, role into v_me_name, v_role from public.erp_users where id = v_me;
  if v_role not in ('MR', 'MANAGER', 'ADMIN') then
    raise exception 'Only medical representatives and managers can raise an activity request'
      using errcode = 'insufficient_privilege';
  end if;

  if p_target_type not in ('DOCTOR', 'CHEMIST') then
    raise exception 'An activity request must be for a doctor or a chemist';
  end if;
  if p_budget is null or p_budget < 0 then
    raise exception 'Budget cannot be negative';
  end if;

  if p_target_type = 'DOCTOR' then
    if p_activity_type not in ('CASH_BENEFIT', 'CONFERENCE', 'GIFT', 'OTHER') then
      raise exception 'That activity type is not available for a doctor';
    end if;
    select doctor_name, active into v_target, v_active from public.erp_doctors where id = p_target_id;
    if v_target is null then raise exception 'Doctor not found'; end if;
  else
    if p_activity_type not in ('CASH_BENEFIT', 'DISPLAY', 'FLEX_BOARD', 'LIGHT_BOARD', 'OTHER') then
      raise exception 'That activity type is not available for a chemist';
    end if;
    select chemist_name, active into v_target, v_active from public.erp_chemists where id = p_target_id;
    if v_target is null then raise exception 'Chemist not found'; end if;
  end if;

  if not v_active then
    raise exception '% is inactive — reactivate them before raising an activity request', v_target;
  end if;

  if p_activity_type = 'OTHER' and v_desc is null then
    raise exception 'Describe the activity when the type is "Other"';
  end if;

  if v_role = 'ADMIN' then
    -- An administrator is the last approver anyway: record it as approved.
    insert into public.erp_activity_requests (
      requester_id, requester_name, target_type, doctor_id, chemist_id, target_name,
      activity_type, budget, description, planned_date,
      status, decided_by, decided_by_name, decided_at
    ) values (
      v_me, v_me_name, p_target_type,
      case when p_target_type = 'DOCTOR'  then p_target_id end,
      case when p_target_type = 'CHEMIST' then p_target_id end,
      v_target, p_activity_type, round(p_budget, 2), v_desc, p_planned_date,
      'APPROVED', v_me, v_me_name, now()
    ) returning id into v_id;

    insert into public.erp_activity_request_steps (request_id, actor_id, actor_name, action, remarks)
    values (v_id, v_me, v_me_name, 'SUBMITTED', null),
           (v_id, v_me, v_me_name, 'APPROVED', 'Raised by an administrator — approved automatically');

    return jsonb_build_object('request_id', v_id, 'status', 'APPROVED');
  end if;

  v_next := public.erp_activity_next_approver(v_me);
  if v_next is not null then
    select name into v_next_name from public.erp_users where id = v_next;
  end if;

  insert into public.erp_activity_requests (
    requester_id, requester_name, target_type, doctor_id, chemist_id, target_name,
    activity_type, budget, description, planned_date,
    current_approver_id, awaiting_name
  ) values (
    v_me, v_me_name, p_target_type,
    case when p_target_type = 'DOCTOR'  then p_target_id end,
    case when p_target_type = 'CHEMIST' then p_target_id end,
    v_target, p_activity_type, round(p_budget, 2), v_desc, p_planned_date,
    v_next, coalesce(v_next_name, 'Administrator')
  ) returning id into v_id;

  insert into public.erp_activity_request_steps (request_id, actor_id, actor_name, action)
  values (v_id, v_me, v_me_name, 'SUBMITTED');

  return jsonb_build_object('request_id', v_id, 'status', 'PENDING');
end;
$$;

-- ─── Review (approve / reject one level) ────────────────────────────────────
create or replace function public.erp_review_activity_request(
  p_request_id uuid,
  p_decision   text,
  p_remarks    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me        uuid := public.erp_current_user_id();
  v_me_name   text;
  v_row       public.erp_activity_requests%rowtype;
  v_is_admin  boolean := public.erp_is_admin();
  v_remarks   text := nullif(trim(coalesce(p_remarks, '')), '');
  v_next      uuid;
  v_next_name text;
begin
  if v_me is null then
    raise exception 'You must be signed in as active staff to review an activity request'
      using errcode = 'insufficient_privilege';
  end if;
  if p_decision not in ('APPROVE', 'REJECT') then
    raise exception 'A review must approve or reject the request';
  end if;

  select * into v_row from public.erp_activity_requests where id = p_request_id for update;
  if not found then
    raise exception 'Activity request not found';
  end if;
  if v_row.status <> 'PENDING' then
    raise exception 'This request has already been %', lower(v_row.status);
  end if;

  -- coalesce: current_approver_id is NULL while a request awaits "any
  -- administrator", and NULL = v_me is NULL, not false — without it this IF
  -- would silently not fire and let anyone approve an unassigned request.
  if not (v_is_admin or coalesce(v_row.current_approver_id = v_me, false)) then
    raise exception 'This request is not waiting on you for approval'
      using errcode = 'insufficient_privilege';
  end if;
  if v_row.requester_id = v_me and not v_is_admin then
    raise exception 'You cannot approve your own request'
      using errcode = 'insufficient_privilege';
  end if;
  if p_decision = 'REJECT' and v_remarks is null then
    raise exception 'Give a reason when rejecting a request';
  end if;

  select name into v_me_name from public.erp_users where id = v_me;

  if p_decision = 'REJECT' then
    update public.erp_activity_requests
       set status = 'REJECTED', current_approver_id = null, awaiting_name = null,
           decided_by = v_me, decided_by_name = v_me_name, decided_at = now()
     where id = p_request_id;
    insert into public.erp_activity_request_steps (request_id, actor_id, actor_name, action, remarks)
    values (p_request_id, v_me, v_me_name, 'REJECTED', v_remarks);
    return jsonb_build_object('request_id', p_request_id, 'status', 'REJECTED');
  end if;

  -- Approve. An administrator's approval is final; anyone else's only
  -- advances the request to their own next ancestor.
  if v_is_admin then
    update public.erp_activity_requests
       set status = 'APPROVED', current_approver_id = null, awaiting_name = null,
           decided_by = v_me, decided_by_name = v_me_name, decided_at = now()
     where id = p_request_id;
    insert into public.erp_activity_request_steps (request_id, actor_id, actor_name, action, remarks)
    values (p_request_id, v_me, v_me_name, 'APPROVED', v_remarks);
    return jsonb_build_object('request_id', p_request_id, 'status', 'APPROVED');
  end if;

  v_next := public.erp_activity_next_approver(v_me);
  if v_next is not null then
    select name into v_next_name from public.erp_users where id = v_next;
  end if;

  update public.erp_activity_requests
     set current_approver_id = v_next, awaiting_name = coalesce(v_next_name, 'Administrator')
   where id = p_request_id;
  insert into public.erp_activity_request_steps (request_id, actor_id, actor_name, action, remarks)
  values (p_request_id, v_me, v_me_name, 'APPROVED', v_remarks);

  return jsonb_build_object('request_id', p_request_id, 'status', 'PENDING', 'awaiting', coalesce(v_next_name, 'Administrator'));
end;
$$;

-- ─── Cancel (requester, while still pending) ────────────────────────────────
create or replace function public.erp_cancel_activity_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := public.erp_current_user_id();
  v_me_name text;
  v_row     public.erp_activity_requests%rowtype;
begin
  if v_me is null then
    raise exception 'You must be signed in as active staff' using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from public.erp_activity_requests where id = p_request_id for update;
  if not found then
    raise exception 'Activity request not found';
  end if;
  if v_row.requester_id <> v_me then
    raise exception 'Only the person who raised a request can cancel it'
      using errcode = 'insufficient_privilege';
  end if;
  if v_row.status <> 'PENDING' then
    raise exception 'This request is no longer pending, so it cannot be cancelled';
  end if;

  select name into v_me_name from public.erp_users where id = v_me;

  update public.erp_activity_requests
     set status = 'CANCELLED', current_approver_id = null, awaiting_name = null
   where id = p_request_id;
  insert into public.erp_activity_request_steps (request_id, actor_id, actor_name, action)
  values (p_request_id, v_me, v_me_name, 'CANCELLED');

  return jsonb_build_object('request_id', p_request_id, 'status', 'CANCELLED');
end;
$$;

revoke all on function public.erp_raise_activity_request(text, uuid, text, numeric, text, date) from public;
revoke all on function public.erp_review_activity_request(uuid, text, text) from public;
revoke all on function public.erp_cancel_activity_request(uuid) from public;
grant execute on function public.erp_raise_activity_request(text, uuid, text, numeric, text, date) to authenticated;
grant execute on function public.erp_review_activity_request(uuid, text, text) to authenticated;
grant execute on function public.erp_cancel_activity_request(uuid) to authenticated;

-- ─── Grants & RLS: read-only for clients ────────────────────────────────────
revoke all on public.erp_activity_requests      from anon;
revoke all on public.erp_activity_request_steps from anon;
grant select on public.erp_activity_requests      to authenticated;
grant select on public.erp_activity_request_steps to authenticated;

alter table public.erp_activity_requests      enable row level security;
alter table public.erp_activity_request_steps enable row level security;

-- Visible to: the requester, whoever it is currently waiting on, any
-- administrator, and anyone above the requester in the reporting chain (so a
-- manager can follow what their team's requests are doing after they've
-- approved them).
drop policy if exists erp_activity_requests_select on public.erp_activity_requests;
create policy erp_activity_requests_select on public.erp_activity_requests
  for select to authenticated
  using (
    requester_id = public.erp_current_user_id()
    or current_approver_id = public.erp_current_user_id()
    or public.erp_is_admin()
    or public.erp_is_in_my_org(requester_id)
  );

drop policy if exists erp_activity_request_steps_select on public.erp_activity_request_steps;
create policy erp_activity_request_steps_select on public.erp_activity_request_steps
  for select to authenticated
  using (
    exists (select 1 from public.erp_activity_requests r where r.id = request_id)
  );
