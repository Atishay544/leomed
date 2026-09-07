-- ============================================================================
-- LEOMED PHARMA ERP — ROLE CAPABILITY MATRIX TESTS
--
-- Complements erp_business_rules.sql (which tests individual business rules)
-- with a role-by-role sweep: for each of the five roles, confirm both what
-- they CAN do (their headline capabilities actually work) and what they
-- CANNOT do (a representative spread across every capability category —
-- masters, billing, inventory, pricing, HR management, administration).
--
-- Run against a database with all erp_ migrations applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/erp_role_capability_matrix.sql
-- Self-contained — does not depend on erp_business_rules.sql. One
-- transaction, rolled back at the end (no commit anywhere in this file), so
-- nothing here can ever persist regardless of outcome.
-- ============================================================================

begin;

set local client_min_messages to warning;

-- ─── Fixtures ───────────────────────────────────────────────────────────────

create temporary table t_ids (label text primary key, id uuid) on commit drop;
grant select on t_ids to authenticated;

do $$
declare
  v_auth_admin uuid := gen_random_uuid();
  v_auth_mr    uuid := gen_random_uuid();
  v_auth_acct  uuid := gen_random_uuid();
  v_auth_mgr   uuid := gen_random_uuid();
  v_auth_view  uuid := gen_random_uuid();
  v_admin uuid; v_mr uuid; v_acct uuid; v_mgr uuid; v_view uuid;
  v_doctor uuid; v_chemist uuid; v_distributor uuid; v_supplier uuid;
  v_product uuid; v_batch uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', v_auth_admin, 'authenticated', 'authenticated', 'rtest-admin@leomed.test', '', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_auth_mr,    'authenticated', 'authenticated', 'rtest-mr@leomed.test',    '', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_auth_acct,  'authenticated', 'authenticated', 'rtest-acct@leomed.test', '', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_auth_mgr,   'authenticated', 'authenticated', 'rtest-mgr@leomed.test',  '', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_auth_view,  'authenticated', 'authenticated', 'rtest-view@leomed.test', '', now(), now(), now());

  insert into public.erp_users (auth_user_id, name, email, role, mr_code)
  values (v_auth_admin, 'RTest Admin',      'rtest-admin@leomed.test', 'ADMIN', null) returning id into v_admin;
  insert into public.erp_users (auth_user_id, name, email, role, mr_code)
  values (v_auth_mr,    'RTest MR',         'rtest-mr@leomed.test',    'MR', 'RTMR01') returning id into v_mr;
  insert into public.erp_users (auth_user_id, name, email, role)
  values (v_auth_acct,  'RTest Accountant', 'rtest-acct@leomed.test',  'ACCOUNTANT') returning id into v_acct;
  insert into public.erp_users (auth_user_id, name, email, role)
  values (v_auth_mgr,   'RTest Manager',    'rtest-mgr@leomed.test',   'MANAGER') returning id into v_mgr;
  insert into public.erp_users (auth_user_id, name, email, role)
  values (v_auth_view,  'RTest Viewer',     'rtest-view@leomed.test',  'VIEWER') returning id into v_view;

  insert into public.erp_doctors (doctor_name, city, created_by)
  values ('Dr. RTest', 'Indore', v_admin) returning id into v_doctor;
  insert into public.erp_chemists (chemist_name, owner_name, city, created_by)
  values ('RTest Medical Store', 'RTest Owner', 'Indore', v_admin) returning id into v_chemist;
  insert into public.erp_distributors (distributor_name, city, created_by)
  values ('RTest Distributor', 'Indore', v_admin) returning id into v_distributor;
  insert into public.erp_suppliers (supplier_name, city, created_by)
  values ('RTest Supplier', 'Ahmedabad', v_admin) returning id into v_supplier;

  insert into public.erp_products (product_name, generic_name, unit, mrp, purchase_rate,
                                   sale_rate, gst_rate, min_stock_level, created_by)
  values ('RTest Product 200', 'RTestol', 'BOX', 200, 80, 160, 12, 10, v_admin)
  returning id into v_product;

  insert into public.erp_product_batches (product_id, batch_number, expiry_date,
                                          mrp, purchase_rate, sale_rate, created_by)
  values (v_product, 'RTEST-B1', current_date + 400, 200, 80, 160, v_admin)
  returning id into v_batch;

  insert into public.erp_inventory_transactions
    (product_id, batch_id, transaction_type, reference_type, quantity, unit_rate,
     transaction_date, remarks, created_by)
  values (v_product, v_batch, 'OPENING', 'OPENING', 500, 80, current_date, 'RTest opening stock', v_admin);

  -- A default pricing rule so this product is sellable to any customer type.
  insert into public.erp_pricing_rules (product_id, customer_type, calculation_basis, calculation_method, percentage, status, version, created_by)
  values (v_product, 'DISTRIBUTOR', 'MRP', 'MARGIN', 20, 'ACTIVE', 1, v_admin),
         (v_product, 'CHEMIST',     'MRP', 'MARGIN', 20, 'ACTIVE', 1, v_admin),
         (v_product, 'DOCTOR',      'MRP', 'MARGIN', 20, 'ACTIVE', 1, v_admin);

  insert into t_ids values
    ('auth_admin', v_auth_admin), ('auth_mr', v_auth_mr), ('auth_acct', v_auth_acct),
    ('auth_mgr', v_auth_mgr), ('auth_view', v_auth_view),
    ('admin', v_admin), ('mr', v_mr), ('acct', v_acct), ('mgr', v_mgr), ('view', v_view),
    ('doctor', v_doctor), ('chemist', v_chemist), ('distributor', v_distributor), ('supplier', v_supplier),
    ('product', v_product), ('batch', v_batch);
end $$;

create or replace function pg_temp.id_of(p_label text) returns uuid
language sql stable as $$ select id from t_ids where label = p_label $$;

-- Helper: run one statement as a given simulated user, catching any error.
-- Keeps every test below to one line instead of six. Always prints WHY a
-- statement was refused (via RAISE WARNING, not suppressed by
-- client_min_messages=warning above) — useful for the negative tests
-- (confirms the refusal reason matches intent) and essential for diagnosing
-- a positive test that fails unexpectedly.
create or replace function pg_temp.as_user(p_auth_id uuid, p_sql text) returns boolean
language plpgsql as $$
declare v_msg text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_auth_id, 'role', 'authenticated')::text, true);
  begin
    execute p_sql;
    reset role;
    return true;   -- succeeded
  exception when others then
    get stacked diagnostics v_msg = message_text;
    reset role;
    raise warning 'as_user refused: % — sql: %', v_msg, p_sql;
    return false;  -- refused
  end;
end;
$$;

-- ============================================================================
-- 1. ADMIN — full access
-- ============================================================================

do $$
declare v_ok boolean; v_count int;
begin
  -- Can write the product master.
  v_ok := pg_temp.as_user(pg_temp.id_of('auth_admin'),
    format('update public.erp_products set product_name = ''RTest Product 200 (admin-edited)'' where id = %L', pg_temp.id_of('product')));
  assert v_ok, 'ADMIN must be able to edit the product master';

  -- Can see negotiated pricing / schemes directly (admin-only table).
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.erp_pricing_rules where product_id = pg_temp.id_of('product');
  reset role;
  assert v_count = 3, format('ADMIN must see all 3 default pricing rules directly, saw %s', v_count);

  -- Can manage another user's role.
  v_ok := pg_temp.as_user(pg_temp.id_of('auth_admin'),
    format('update public.erp_users set department = ''Sales'' where id = %L', pg_temp.id_of('mr')));
  assert v_ok, 'ADMIN must be able to manage staff records';

  -- Can raise a sales invoice.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);
  perform public.erp_save_sales_invoice(jsonb_build_object(
    'distributor_id', pg_temp.id_of('distributor'), 'invoice_date', current_date,
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', pg_temp.id_of('product'), 'batch_id', pg_temp.id_of('batch'), 'quantity', 1, 'gst_rate', 12
    ))
  ));
  reset role;

  -- Excluded from self-service attendance (admins don't clock in).
  v_ok := pg_temp.as_user(pg_temp.id_of('auth_admin'), 'select public.erp_attendance_check_in(null, null, null)');
  assert not v_ok, 'ADMIN must be refused at attendance check-in — admins do not clock in';
end $$;

-- ============================================================================
-- 2. MR — field work and own HR only, nothing about company money
-- ============================================================================

do $$
declare v_ok boolean;
begin
  -- Can record a doctor visit under their own name.
  v_ok := pg_temp.as_user(pg_temp.id_of('auth_mr'), format(
    'insert into public.erp_doctor_visits (doctor_id, mr_id, visit_date, doctor_status, created_by) values (%L, %L, current_date, ''EXISTING'', %L)',
    pg_temp.id_of('doctor'), pg_temp.id_of('mr'), pg_temp.id_of('mr')));
  assert v_ok, 'MR must be able to record their own doctor visit';

  -- Can check in.
  v_ok := pg_temp.as_user(pg_temp.id_of('auth_mr'), 'select public.erp_attendance_check_in(22.71, 75.85, 12)');
  assert v_ok, 'MR must be able to check in';

  -- Cannot read sales invoices at all.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id_of('auth_mr'), 'role', 'authenticated')::text, true);
  perform 1 from public.erp_sales_invoices limit 1;
  assert not found, 'MR must not read any sales invoice';
  reset role;

  -- Cannot see pricing rules directly.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id_of('auth_mr'), 'role', 'authenticated')::text, true);
  perform 1 from public.erp_pricing_rules limit 1;
  assert not found, 'MR must not read pricing rules directly';
  reset role;

  -- erp_explain_price must give MR the filtered (non-admin) shape too —
  -- defense in depth even though the MR app never calls this.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id_of('auth_mr'), 'role', 'authenticated')::text, true);
  assert not (public.erp_explain_price(pg_temp.id_of('product'), 'DISTRIBUTOR', pg_temp.id_of('distributor'), null, null, current_date, 0) ? 'percentage'),
    'MR must never see margin percentage from erp_explain_price';
  reset role;

  -- Cannot adjust inventory.
  v_ok := pg_temp.as_user(pg_temp.id_of('auth_mr'), format(
    'select public.erp_adjust_inventory(%L, ''DAMAGE'', 1, ''should be refused'')', pg_temp.id_of('batch')));
  assert not v_ok, 'MR must not be able to adjust inventory';

  -- Cannot manage staff.
  v_ok := pg_temp.as_user(pg_temp.id_of('auth_mr'), format(
    'update public.erp_users set role = ''ADMIN'' where id = %L', pg_temp.id_of('mr')));
  assert not v_ok, 'MR must not be able to promote themselves';
end $$;

-- ============================================================================
-- 3. ACCOUNTANT — billing and inventory, no field-force or HR administration
-- ============================================================================

do $$
declare v_ok boolean; v_invoice uuid; v_leave uuid; v_leave_type uuid;
begin
  -- Can raise a purchase invoice. invoice_number is required by this RPC
  -- (unlike sales invoices, it does not auto-generate one) — verified
  -- against the function's own body before writing this call.
  v_ok := pg_temp.as_user(pg_temp.id_of('auth_acct'), format(
    'select public.erp_save_purchase_invoice(jsonb_build_object(''invoice_number'', ''RTEST-PINV-1'', ''supplier_id'', %L, ''invoice_date'', current_date, ''items'', jsonb_build_array(jsonb_build_object(''product_id'', %L, ''batch_number'', ''RTEST-P1'', ''expiry_date'', (current_date + 400)::text, ''quantity'', 10, ''purchase_rate'', 80, ''mrp'', 200, ''sale_rate'', 160, ''gst_rate'', 12))))',
    pg_temp.id_of('supplier'), pg_temp.id_of('product')));
  assert v_ok, 'ACCOUNTANT must be able to raise a purchase invoice';

  -- Can raise a sales invoice direct to a chemist (no distributor involved).
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id_of('auth_acct'), 'role', 'authenticated')::text, true);
  perform public.erp_save_sales_invoice(jsonb_build_object(
    'chemist_id', pg_temp.id_of('chemist'), 'invoice_date', current_date,
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', pg_temp.id_of('product'), 'batch_id', pg_temp.id_of('batch'), 'quantity', 1, 'gst_rate', 12
    ))
  ));
  reset role;

  -- Can adjust inventory.
  v_ok := pg_temp.as_user(pg_temp.id_of('auth_acct'), format(
    'select public.erp_adjust_inventory(%L, ''OPENING'', 5, ''RTest opening correction'')', pg_temp.id_of('batch')));
  assert v_ok, 'ACCOUNTANT must be able to adjust inventory';

  -- Cannot write the product master. erp_products' UPDATE policy silently
  -- matches zero rows for a non-admin rather than raising (same as the
  -- erp_users self-promotion path minus its trigger) — as_user alone can't
  -- tell "refused" from "matched nothing" here, so check row_count directly.
  declare v_rows int; begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id_of('auth_acct'), 'role', 'authenticated')::text, true);
    update public.erp_products set product_name = 'Tampered by accountant' where id = pg_temp.id_of('product');
    get diagnostics v_rows = row_count;
    reset role;
    assert v_rows = 0, format('ACCOUNTANT must not be able to edit the product master — %s row(s) updated', v_rows);
  end;

  -- Cannot manage staff or targets.
  v_ok := pg_temp.as_user(pg_temp.id_of('auth_acct'), format(
    'update public.erp_users set role = ''ADMIN'' where id = %L', pg_temp.id_of('acct')));
  assert not v_ok, 'ACCOUNTANT must not be able to promote themselves';

  -- Cannot approve someone else's leave (no leave.manage).
  select id into v_leave_type from public.erp_leave_types limit 1;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id_of('auth_mr'), 'role', 'authenticated')::text, true);
  insert into public.erp_leave_requests (employee_id, leave_type_id, from_date, to_date, reason)
  values (pg_temp.id_of('mr'), v_leave_type, current_date + 120, current_date + 120, 'RTest leave')
  returning id into v_leave;
  reset role;

  v_ok := pg_temp.as_user(pg_temp.id_of('auth_acct'), format(
    'select public.erp_review_leave_request(%L, ''APPROVED'', ''trying'')', v_leave));
  assert not v_ok, 'ACCOUNTANT must not be able to approve another employee''s leave';

  -- Sees only the rupee figure from erp_explain_price, never the margin.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id_of('auth_acct'), 'role', 'authenticated')::text, true);
  assert not (public.erp_explain_price(pg_temp.id_of('product'), 'CHEMIST', null, pg_temp.id_of('chemist'), null, current_date, 0) ? 'pricing_rule_id'),
    'ACCOUNTANT must never see which pricing rule was used';
  reset role;
end $$;

-- ============================================================================
-- 4. MANAGER — reads the whole field force and the money, writes almost none
--    of it. (Previously untested — this role had zero coverage.)
-- ============================================================================

do $$
declare v_ok boolean; v_sales int; v_purchases int; v_visits int; v_order uuid;
begin
  -- Can read sales and purchase invoices (billing.*.read).
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id_of('auth_mgr'), 'role', 'authenticated')::text, true);
  select count(*) into v_sales     from public.erp_sales_invoices;
  select count(*) into v_purchases from public.erp_purchase_invoices;
  reset role;
  assert v_sales > 0,     'MANAGER must be able to read sales invoices';
  assert v_purchases > 0, 'MANAGER must be able to read purchase invoices';

  -- Can read every MR's visits (visits.read.all), not just their own.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id_of('auth_mgr'), 'role', 'authenticated')::text, true);
  select count(*) into v_visits from public.erp_doctor_visits where mr_id = pg_temp.id_of('mr');
  reset role;
  assert v_visits > 0, 'MANAGER must be able to read an MR''s visits, not just their own';

  -- Can change a field order's fulfilment status (orders.manage_status).
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id_of('auth_mr'), 'role', 'authenticated')::text, true);
  insert into public.erp_field_orders (order_number, customer_type, doctor_id, mr_id, created_by)
  values ('RTEST-FO-1', 'DOCTOR', pg_temp.id_of('doctor'), pg_temp.id_of('mr'), pg_temp.id_of('mr'))
  returning id into v_order;
  reset role;

  v_ok := pg_temp.as_user(pg_temp.id_of('auth_mgr'), format(
    'select public.erp_set_field_order_status(%L, ''FULFILLED'', null)', v_order));
  assert v_ok, 'MANAGER must be able to change a field order''s status';

  -- Reports (reports.read.all) are enforced by the app layer, not by a
  -- dedicated DB check — erp_dashboard_summary() is SECURITY INVOKER with
  -- no internal privilege check, so it can't distinguish roles at the RPC
  -- level; every role that can call it at all sees data scoped by the same
  -- table RLS already exercised above (MANAGER seeing another MR's visits).
  -- Nothing further to assert here.

  -- Cannot write a sales or purchase invoice (read-only on billing).
  v_ok := pg_temp.as_user(pg_temp.id_of('auth_mgr'), format(
    'select public.erp_save_sales_invoice(jsonb_build_object(''chemist_id'', %L, ''invoice_date'', current_date, ''items'', jsonb_build_array(jsonb_build_object(''product_id'', %L, ''batch_id'', %L, ''quantity'', 1, ''gst_rate'', 12))))',
    pg_temp.id_of('chemist'), pg_temp.id_of('product'), pg_temp.id_of('batch')));
  assert not v_ok, 'MANAGER must not be able to raise a sales invoice';

  -- Cannot adjust inventory.
  v_ok := pg_temp.as_user(pg_temp.id_of('auth_mgr'), format(
    'select public.erp_adjust_inventory(%L, ''DAMAGE'', 1, ''should be refused'')', pg_temp.id_of('batch')));
  assert not v_ok, 'MANAGER must not be able to adjust inventory';

  -- Cannot see pricing rules directly, nor the margin behind a price.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id_of('auth_mgr'), 'role', 'authenticated')::text, true);
  perform 1 from public.erp_pricing_rules limit 1;
  assert not found, 'MANAGER must not read pricing rules directly';
  reset role;

  -- Cannot manage staff, payroll, or targets.
  v_ok := pg_temp.as_user(pg_temp.id_of('auth_mgr'), format(
    'update public.erp_users set role = ''ADMIN'' where id = %L', pg_temp.id_of('mgr')));
  assert not v_ok, 'MANAGER must not be able to promote themselves';

  v_ok := pg_temp.as_user(pg_temp.id_of('auth_mgr'), format(
    'select public.erp_finalize_payroll(gen_random_uuid())'));
  assert not v_ok, 'MANAGER must not be able to touch payroll';
end $$;

-- ============================================================================
-- 5. VIEWER — read-only observer/audit role, writes nowhere.
--    (Previously untested — this role had zero coverage.)
-- ============================================================================

do $$
declare v_ok boolean; v_count int;
begin
  -- Can read the product/doctor/chemist masters.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id_of('auth_view'), 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.erp_products where id = pg_temp.id_of('product');
  reset role;
  assert v_count = 1, 'VIEWER must be able to read the product master';

  -- Can read every MR's visits and orders (their whole reason to exist).
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id_of('auth_view'), 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.erp_doctor_visits where mr_id = pg_temp.id_of('mr');
  reset role;
  assert v_count > 0, 'VIEWER must be able to read an MR''s visits';

  -- Cannot write anything — try the cheapest possible write, a doctor visit.
  v_ok := pg_temp.as_user(pg_temp.id_of('auth_view'), format(
    'insert into public.erp_doctor_visits (doctor_id, mr_id, visit_date, doctor_status, created_by) values (%L, %L, current_date, ''EXISTING'', %L)',
    pg_temp.id_of('doctor'), pg_temp.id_of('mr'), pg_temp.id_of('mr')));
  assert not v_ok, 'VIEWER must not be able to record a visit';

  -- Cannot read purchase/sales invoices or the inventory ledger — VIEWER
  -- holds no billing.* or inventory.* capability at all, unlike MANAGER.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id_of('auth_view'), 'role', 'authenticated')::text, true);
  perform 1 from public.erp_sales_invoices limit 1;
  assert not found, 'VIEWER must not read sales invoices';
  perform 1 from public.erp_purchase_invoices limit 1;
  assert not found, 'VIEWER must not read purchase invoices';
  perform 1 from public.erp_inventory_transactions limit 1;
  assert not found, 'VIEWER must not read the inventory ledger';
  reset role;
end $$;

-- ============================================================================
-- 6. KNOWN FINDINGS — reported via NOTICE, not asserted, so the whole run
--    always completes and reports everything in one pass even where the
--    outcome is expected to reveal a real gap rather than confirm one.
--
-- (a) erp_attendance_check_in() only explicitly excludes ADMIN by role; it
--     does not check that the caller is a role the app considers "does
--     attendance" at all. The Next.js server action enforces
--     attendance.checkin before ever calling this RPC, but the RPC itself
--     does not — so a direct PostgREST call with e.g. a VIEWER's own valid
--     session token reaches this far purely because RLS/grants allow it,
--     contradicting this codebase's own stated principle (permissions.ts's
--     file header) that hiding an action in the app layer is not the same
--     as the database refusing it.
--
-- (b) RLS on erp_product_batches is row-level only ("is this person staff
--     at all"), with no column-level restriction, so purchase_rate (landing
--     cost) is reachable by any staff role through a direct query, not just
--     through the app's own listBatches() (which only chooses not to ask
--     for that column when the caller lacks inventory.valuation). This does
--     not contradict masters/batches/page.tsx's fix earlier this project —
--     that fix stops the APP from ever showing or fetching it needlessly —
--     but the protection is not enforced at the database for a client that
--     queries the table directly.
-- ============================================================================

do $$
declare v_ok boolean; v_cost numeric; v_reachable boolean;
begin
  v_ok := pg_temp.as_user(pg_temp.id_of('auth_view'), 'select public.erp_attendance_check_in(22.71, 75.85, 12)');
  if v_ok then
    raise warning 'FINDING (a): erp_attendance_check_in() let a VIEWER check in — the RPC has no attendance.checkin-equivalent check of its own, only the Next.js action does. See comment above.';
  else
    raise warning 'erp_attendance_check_in() correctly refused a VIEWER — already guarded at the database, no action needed.';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id_of('auth_mr'), 'role', 'authenticated')::text, true);
  begin
    select purchase_rate into v_cost from public.erp_product_batches where id = pg_temp.id_of('batch');
    v_reachable := v_cost is not null;
  exception when others then
    v_reachable := false;
  end;
  reset role;

  if v_reachable then
    raise warning 'FINDING (b): an MR can read erp_product_batches.purchase_rate (%) directly. RLS on this table is row-level only (erp_is_staff()); there is no column-level restriction. If landing cost must never reach a non-admin role even via a direct query, this needs a masking view or a column-privilege redesign — worth a deliberate decision, not a silent patch.', v_cost;
  else
    raise warning 'erp_product_batches.purchase_rate is NOT reachable by an MR — already column-restricted at the database, no action needed.';
  end if;
end $$;

-- ============================================================================

do $$ begin raise warning 'All ERP role-capability-matrix tests passed.'; end $$;

rollback;
