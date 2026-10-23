-- ============================================================================
-- LEOMED PHARMA ERP — DOCTOR/CHEMIST ACTIVITY REQUEST TESTS
-- (20261025000001_activity_requests.sql)
--
-- Chain used throughout:   MR -> Manager 1 -> Manager 2 -> Admin
-- plus an "orphan" MR with no reports_to at all (awaiting-any-admin case).
--
-- Run in Supabase Studio's SQL Editor with "Run without RLS" (see the note in
-- erp_role_capability_matrix.sql: the script role-switches itself, so RLS is
-- still genuinely exercised), or:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/erp_activity_requests.sql
-- One transaction, rolled back at the end — nothing here can persist.
-- ============================================================================

begin;

set local client_min_messages to warning;

create temporary table t_ids (label text primary key, id uuid) on commit drop;
grant select on t_ids to authenticated;

do $$
declare
  v_auth_admin uuid := gen_random_uuid();
  v_auth_mgr2  uuid := gen_random_uuid();
  v_auth_mgr1  uuid := gen_random_uuid();
  v_auth_mr    uuid := gen_random_uuid();
  v_auth_orph  uuid := gen_random_uuid();
  v_auth_acct  uuid := gen_random_uuid();
  v_admin uuid; v_mgr2 uuid; v_mgr1 uuid; v_mr uuid; v_orph uuid; v_acct uuid;
  v_doctor uuid; v_chemist uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', v_auth_admin, 'authenticated', 'authenticated', 'atest-admin@leomed.test', '', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_auth_mgr2,  'authenticated', 'authenticated', 'atest-mgr2@leomed.test',  '', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_auth_mgr1,  'authenticated', 'authenticated', 'atest-mgr1@leomed.test',  '', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_auth_mr,    'authenticated', 'authenticated', 'atest-mr@leomed.test',    '', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_auth_orph,  'authenticated', 'authenticated', 'atest-orph@leomed.test',  '', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_auth_acct,  'authenticated', 'authenticated', 'atest-acct@leomed.test',  '', now(), now(), now());

  insert into public.erp_users (auth_user_id, name, email, role) values (v_auth_admin, 'ATest Admin', 'atest-admin@leomed.test', 'ADMIN') returning id into v_admin;
  insert into public.erp_users (auth_user_id, name, email, role) values (v_auth_mgr2,  'ATest Manager 2', 'atest-mgr2@leomed.test', 'MANAGER') returning id into v_mgr2;
  insert into public.erp_users (auth_user_id, name, email, role) values (v_auth_mgr1,  'ATest Manager 1', 'atest-mgr1@leomed.test', 'MANAGER') returning id into v_mgr1;
  insert into public.erp_users (auth_user_id, name, email, role, mr_code) values (v_auth_mr,   'ATest MR', 'atest-mr@leomed.test', 'MR', 'ATMR01') returning id into v_mr;
  insert into public.erp_users (auth_user_id, name, email, role, mr_code) values (v_auth_orph, 'ATest Orphan MR', 'atest-orph@leomed.test', 'MR', 'ATMR02') returning id into v_orph;
  insert into public.erp_users (auth_user_id, name, email, role) values (v_auth_acct, 'ATest Accountant', 'atest-acct@leomed.test', 'ACCOUNTANT') returning id into v_acct;

  -- reports_to changes need an authenticated admin in the JWT claims.
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth_admin, 'role', 'authenticated')::text, true);
  update public.erp_users set reports_to = v_admin where id = v_mgr2;
  update public.erp_users set reports_to = v_mgr2  where id = v_mgr1;
  update public.erp_users set reports_to = v_mgr1  where id = v_mr;
  perform set_config('request.jwt.claims', 'null', true);

  insert into public.erp_doctors (doctor_name, city, created_by) values ('Dr. ATest', 'Indore', v_admin) returning id into v_doctor;
  insert into public.erp_chemists (chemist_name, owner_name, city, created_by) values ('ATest Medical', 'Owner', 'Indore', v_admin) returning id into v_chemist;

  insert into t_ids values
    ('auth_admin', v_auth_admin), ('auth_mgr2', v_auth_mgr2), ('auth_mgr1', v_auth_mgr1),
    ('auth_mr', v_auth_mr), ('auth_orph', v_auth_orph), ('auth_acct', v_auth_acct),
    ('admin', v_admin), ('mgr2', v_mgr2), ('mgr1', v_mgr1), ('mr', v_mr), ('orph', v_orph), ('acct', v_acct),
    ('doctor', v_doctor), ('chemist', v_chemist);
end $$;

create or replace function pg_temp.id_of(p_label text) returns uuid
language sql stable as $$ select id from t_ids where label = p_label $$;

-- Run one statement as a simulated user; true = succeeded, false = refused
-- (the reason is printed as a WARNING either way it fails).
create or replace function pg_temp.as_user(p_auth_id uuid, p_sql text) returns boolean
language plpgsql as $$
declare v_msg text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_auth_id, 'role', 'authenticated')::text, true);
  begin
    execute p_sql;
    reset role;
    return true;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    reset role;
    raise warning 'as_user refused: % — sql: %', v_msg, p_sql;
    return false;
  end;
end;
$$;

-- Raise a request as a user and remember its id under a label.
create or replace function pg_temp.raise_as(p_auth text, p_label text, p_target text, p_target_id uuid,
                                            p_type text, p_budget numeric, p_desc text default null) returns boolean
language plpgsql as $$
declare v_msg text; v_res jsonb; v_auth uuid := pg_temp.id_of(p_auth);
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  begin
    v_res := public.erp_raise_activity_request(p_target, p_target_id, p_type, p_budget, p_desc, null);
    reset role;
    insert into t_ids values (p_label, (v_res ->> 'request_id')::uuid);
    return true;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    reset role;
    raise warning 'raise_as refused: %', v_msg;
    return false;
  end;
end;
$$;

-- ============================================================================
-- 1. Raising — validation and initial routing
-- ============================================================================

do $$
declare v_ok boolean; v_status text; v_appr uuid;
begin
  v_ok := pg_temp.raise_as('auth_mr', 'req1', 'DOCTOR', pg_temp.id_of('doctor'), 'CASH_BENEFIT', 5000, 'Annual CME support');
  assert v_ok, 'an MR must be able to raise a doctor cash-benefit request';

  select status, current_approver_id into v_status, v_appr from public.erp_activity_requests where id = pg_temp.id_of('req1');
  assert v_status = 'PENDING', 'a new request must be PENDING';
  assert v_appr = pg_temp.id_of('mgr1'), 'a new request must go to the requester''s direct manager first';

  assert not pg_temp.raise_as('auth_mr', 'x', 'DOCTOR', pg_temp.id_of('doctor'), 'DISPLAY', 100),
    'DISPLAY is a chemist-only activity — must be refused for a doctor';
  assert not pg_temp.raise_as('auth_mr', 'x', 'CHEMIST', pg_temp.id_of('chemist'), 'GIFT', 100),
    'GIFT is a doctor-only activity — must be refused for a chemist';
  assert not pg_temp.raise_as('auth_mr', 'x', 'DOCTOR', pg_temp.id_of('doctor'), 'GIFT', -1),
    'a negative budget must be refused';
  assert not pg_temp.raise_as('auth_mr', 'x', 'DOCTOR', pg_temp.id_of('doctor'), 'OTHER', 100),
    'type OTHER with no description must be refused';
  assert pg_temp.raise_as('auth_mr', 'x2', 'CHEMIST', pg_temp.id_of('chemist'), 'FLEX_BOARD', 2500),
    'a chemist flex-board request must be accepted';
  assert not pg_temp.raise_as('auth_acct', 'x', 'DOCTOR', pg_temp.id_of('doctor'), 'GIFT', 100),
    'an ACCOUNTANT must not be able to raise an activity request';
end $$;

-- ============================================================================
-- 2. The full chain: MR -> Manager 1 -> Manager 2 -> Admin
-- ============================================================================

do $$
declare v_ok boolean; v_status text; v_appr uuid; v_steps int;
begin
  assert not pg_temp.as_user(pg_temp.id_of('auth_mgr2'),
    format('select public.erp_review_activity_request(%L, ''APPROVE'', null)', pg_temp.id_of('req1'))),
    'Manager 2 must NOT be able to approve before Manager 1 has';
  assert not pg_temp.as_user(pg_temp.id_of('auth_mr'),
    format('select public.erp_review_activity_request(%L, ''APPROVE'', null)', pg_temp.id_of('req1'))),
    'the requester must NOT be able to approve their own request';

  assert pg_temp.as_user(pg_temp.id_of('auth_mgr1'),
    format('select public.erp_review_activity_request(%L, ''APPROVE'', ''ok'')', pg_temp.id_of('req1'))),
    'Manager 1 (the current approver) must be able to approve';
  select status, current_approver_id into v_status, v_appr from public.erp_activity_requests where id = pg_temp.id_of('req1');
  assert v_status = 'PENDING' and v_appr = pg_temp.id_of('mgr2'),
    'after Manager 1 approves, the request must be pending on Manager 2';

  assert not pg_temp.as_user(pg_temp.id_of('auth_mgr1'),
    format('select public.erp_review_activity_request(%L, ''APPROVE'', null)', pg_temp.id_of('req1'))),
    'Manager 1 must not be able to approve a second time';

  assert pg_temp.as_user(pg_temp.id_of('auth_mgr2'),
    format('select public.erp_review_activity_request(%L, ''APPROVE'', null)', pg_temp.id_of('req1'))),
    'Manager 2 must be able to approve once it is their turn';
  select status, current_approver_id into v_status, v_appr from public.erp_activity_requests where id = pg_temp.id_of('req1');
  assert v_status = 'PENDING' and v_appr = pg_temp.id_of('admin'),
    'after Manager 2 approves, the request must be pending on the Admin — NOT yet approved';

  assert pg_temp.as_user(pg_temp.id_of('auth_admin'),
    format('select public.erp_review_activity_request(%L, ''APPROVE'', null)', pg_temp.id_of('req1'))),
    'Admin must be able to give the final approval';
  select status, current_approver_id into v_status, v_appr from public.erp_activity_requests where id = pg_temp.id_of('req1');
  assert v_status = 'APPROVED' and v_appr is null, 'the admin''s approval must finalise the request';

  select count(*) into v_steps from public.erp_activity_request_steps where request_id = pg_temp.id_of('req1');
  assert v_steps = 4, format('expected 4 trail rows (submitted + 3 approvals), saw %s', v_steps);

  assert not pg_temp.as_user(pg_temp.id_of('auth_admin'),
    format('select public.erp_review_activity_request(%L, ''REJECT'', ''late'')', pg_temp.id_of('req1'))),
    'an already-approved request must not be reviewable again';
end $$;

-- ============================================================================
-- 3. Rejection, cancellation, orphan routing, admin-raised
-- ============================================================================

do $$
declare v_status text; v_appr uuid; v_awaiting text;
begin
  -- Reject needs a reason, and ends the request at any level.
  assert not pg_temp.as_user(pg_temp.id_of('auth_mgr1'),
    format('select public.erp_review_activity_request(%L, ''REJECT'', null)', pg_temp.id_of('x2'))),
    'rejecting without a reason must be refused';
  assert pg_temp.as_user(pg_temp.id_of('auth_mgr1'),
    format('select public.erp_review_activity_request(%L, ''REJECT'', ''over budget'')', pg_temp.id_of('x2'))),
    'rejecting with a reason must work';
  select status into v_status from public.erp_activity_requests where id = pg_temp.id_of('x2');
  assert v_status = 'REJECTED', 'a rejection must end the request';

  -- Cancel: only the requester, only while pending.
  assert pg_temp.raise_as('auth_mr', 'req3', 'DOCTOR', pg_temp.id_of('doctor'), 'GIFT', 800);
  assert not pg_temp.as_user(pg_temp.id_of('auth_mgr1'),
    format('select public.erp_cancel_activity_request(%L)', pg_temp.id_of('req3'))),
    'someone other than the requester must not be able to cancel';
  assert pg_temp.as_user(pg_temp.id_of('auth_mr'),
    format('select public.erp_cancel_activity_request(%L)', pg_temp.id_of('req3'))),
    'the requester must be able to cancel while pending';
  assert not pg_temp.as_user(pg_temp.id_of('auth_mr'),
    format('select public.erp_cancel_activity_request(%L)', pg_temp.id_of('req3'))),
    'a cancelled request must not be cancellable again';

  -- No reporting line at all => awaiting any admin; no manager may act on it.
  assert pg_temp.raise_as('auth_orph', 'req4', 'DOCTOR', pg_temp.id_of('doctor'), 'GIFT', 300);
  select current_approver_id, awaiting_name into v_appr, v_awaiting from public.erp_activity_requests where id = pg_temp.id_of('req4');
  assert v_appr is null and v_awaiting = 'Administrator', 'an MR with no manager must route to "Administrator"';
  assert not pg_temp.as_user(pg_temp.id_of('auth_mgr1'),
    format('select public.erp_review_activity_request(%L, ''APPROVE'', null)', pg_temp.id_of('req4'))),
    'a manager outside the chain must not approve';
  assert pg_temp.as_user(pg_temp.id_of('auth_admin'),
    format('select public.erp_review_activity_request(%L, ''APPROVE'', null)', pg_temp.id_of('req4'))),
    'an admin can approve any pending request';

  -- Admin raising is approved immediately.
  assert pg_temp.raise_as('auth_admin', 'req5', 'CHEMIST', pg_temp.id_of('chemist'), 'LIGHT_BOARD', 9000);
  select status into v_status from public.erp_activity_requests where id = pg_temp.id_of('req5');
  assert v_status = 'APPROVED', 'a request raised by an admin must be approved immediately';
end $$;

-- ============================================================================
-- 4. Inactive managers are skipped
-- ============================================================================

do $$
declare v_appr uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);
  update public.erp_users set active = false where id = pg_temp.id_of('mgr1');
  perform set_config('request.jwt.claims', 'null', true);

  -- The MR's own session needs an active row, so raise as the orphan's
  -- sibling is not possible here — check the routing helper directly instead.
  v_appr := public.erp_activity_next_approver(pg_temp.id_of('mr'));
  assert v_appr = pg_temp.id_of('mgr2'), 'an inactive manager must be skipped in favour of the next one up';

  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);
  update public.erp_users set active = true where id = pg_temp.id_of('mgr1');
  perform set_config('request.jwt.claims', 'null', true);
end $$;

-- ============================================================================
-- 5. Visibility and write lockdown
-- ============================================================================

do $$
declare v_count int;
begin
  -- The orphan MR must not see the other MR's requests.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id_of('auth_orph'), 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.erp_activity_requests where requester_id = pg_temp.id_of('mr');
  reset role;
  assert v_count = 0, format('an unrelated MR must not see another MR''s requests, saw %s', v_count);

  -- A manager above the requester sees their requests.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id_of('auth_mgr2'), 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.erp_activity_requests where requester_id = pg_temp.id_of('mr');
  reset role;
  assert v_count >= 1, 'a manager above the requester must see their requests';

  -- No direct writes at all.
  assert not pg_temp.as_user(pg_temp.id_of('auth_mr'),
    format('update public.erp_activity_requests set status = ''APPROVED'' where id = %L', pg_temp.id_of('req4'))),
    'clients must not be able to update a request directly';
  assert not pg_temp.as_user(pg_temp.id_of('auth_mr'),
    format($f$insert into public.erp_activity_requests (requester_id, requester_name, target_type, doctor_id, target_name, activity_type, status)
              values (%L, 'x', 'DOCTOR', %L, 'x', 'GIFT', 'APPROVED')$f$, pg_temp.id_of('mr'), pg_temp.id_of('doctor'))),
    'clients must not be able to insert a request directly';
end $$;

do $$ begin raise warning 'All ERP activity-request tests passed.'; end $$;

rollback;
