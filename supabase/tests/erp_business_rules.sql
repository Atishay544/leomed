-- ============================================================================
-- LEOMED PHARMA ERP — BUSINESS RULE TESTS (spec §60)
--
-- Run against a database with all erp_ migrations applied:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/erp_business_rules.sql
--
-- Everything happens inside one transaction that is rolled back at the end, so
-- the database is left exactly as it was found. Any failed assertion aborts
-- the run with the message attached to it.
--
-- These test the RULES, not the screens: each one would still hold if the
-- entire Next.js app were replaced tomorrow.
-- ============================================================================

begin;

set local client_min_messages to warning;

-- ─── Fixtures ───────────────────────────────────────────────────────────────

create temporary table t_ids (label text primary key, id uuid) on commit drop;

-- The tests below deliberately SET LOCAL ROLE authenticated to exercise RLS
-- as each simulated user would see it (spec §36 — "prove the database
-- enforces this, not just the app"). Once that switch happens, Postgres
-- checks privileges as that role for real, even for objects this same
-- session created a moment earlier while still connected as the owner —
-- so pg_temp.id_of() needs an explicit grant to keep reading its own
-- lookup table after the switch.
grant select on t_ids to authenticated;

do $$
declare
  v_auth_admin uuid := gen_random_uuid();
  v_auth_mr1   uuid := gen_random_uuid();
  v_auth_mr2   uuid := gen_random_uuid();
  v_admin  uuid; v_mr1 uuid; v_mr2 uuid;
  v_doctor uuid; v_chemist uuid; v_supplier uuid; v_distributor uuid;
  v_product uuid; v_batch uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', v_auth_admin, 'authenticated', 'authenticated',
     'test-admin@leomed.test', '', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_auth_mr1, 'authenticated', 'authenticated',
     'test-mr1@leomed.test', '', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_auth_mr2, 'authenticated', 'authenticated',
     'test-mr2@leomed.test', '', now(), now(), now());

  insert into public.erp_users (auth_user_id, name, email, role, mr_code, territory)
  values (v_auth_admin, 'Test Admin', 'test-admin@leomed.test', 'ADMIN', null, null)
  returning id into v_admin;

  insert into public.erp_users (auth_user_id, name, email, role, mr_code, territory)
  values (v_auth_mr1, 'Test MR One', 'test-mr1@leomed.test', 'MR', 'TMR001', 'Test North')
  returning id into v_mr1;

  insert into public.erp_users (auth_user_id, name, email, role, mr_code, territory)
  values (v_auth_mr2, 'Test MR Two', 'test-mr2@leomed.test', 'MR', 'TMR002', 'Test South')
  returning id into v_mr2;

  insert into public.erp_doctors (doctor_name, specialization, city, created_by)
  values ('Dr. Test Subject', 'General Medicine', 'Indore', v_admin)
  returning id into v_doctor;

  insert into public.erp_chemists (chemist_name, owner_name, city, created_by)
  values ('Test Medical Store', 'Test Owner', 'Indore', v_admin)
  returning id into v_chemist;

  insert into public.erp_suppliers (supplier_name, city, created_by)
  values ('Test Supplier Ltd', 'Ahmedabad', v_admin)
  returning id into v_supplier;

  insert into public.erp_distributors (distributor_name, city, created_by)
  values ('Test Distributor', 'Indore', v_admin)
  returning id into v_distributor;

  insert into public.erp_products (product_name, generic_name, unit, mrp, purchase_rate,
                                   sale_rate, gst_rate, min_stock_level, created_by)
  values ('Testolol 50', 'Testolol', 'BOX', 100, 50, 75, 12, 10, v_admin)
  returning id into v_product;

  insert into public.erp_product_batches (product_id, batch_number, expiry_date,
                                          mrp, purchase_rate, sale_rate, created_by)
  values (v_product, 'TEST-B1', current_date + 400, 100, 50, 75, v_admin)
  returning id into v_batch;

  -- erp_save_sales_invoice() now resolves every rate server-side via the
  -- pricing engine (section 11) instead of trusting the item's sale_rate —
  -- so this fixture product needs a real default rule to be sellable at
  -- all. 25% margin off MRP 100 = 75, matching every sale_rate literally
  -- written throughout the sections below, so none of those figures need
  -- to change.
  insert into public.erp_pricing_rules (product_id, customer_type, calculation_basis, calculation_method, percentage, status, version, created_by)
  values (v_product, 'DISTRIBUTOR', 'MRP', 'MARGIN', 25, 'ACTIVE', 1, v_admin),
         (v_product, 'CHEMIST',     'MRP', 'MARGIN', 25, 'ACTIVE', 1, v_admin),
         (v_product, 'DOCTOR',      'MRP', 'MARGIN', 25, 'ACTIVE', 1, v_admin);

  insert into t_ids values
    ('auth_admin', v_auth_admin), ('auth_mr1', v_auth_mr1), ('auth_mr2', v_auth_mr2),
    ('admin', v_admin), ('mr1', v_mr1), ('mr2', v_mr2),
    ('doctor', v_doctor), ('chemist', v_chemist), ('supplier', v_supplier),
    ('distributor', v_distributor), ('product', v_product), ('batch', v_batch);
end $$;

create or replace function pg_temp.id_of(p_label text) returns uuid
language sql stable as $$ select id from t_ids where label = p_label $$;

-- ============================================================================
-- 1. DOCTORS AND VISITS
-- ============================================================================

-- A doctor belongs to the company, not to one MR (spec §10, §58).
do $$
begin
  assert not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'erp_doctors' and column_name = 'mr_id'
  ), 'erp_doctors must not have an mr_id column — doctors are not owned by a rep';

  assert not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'erp_chemists' and column_name = 'mr_id'
  ), 'erp_chemists must not have an mr_id column';
end $$;

-- Two different MRs can visit the same doctor, repeatedly (spec §17).
do $$
declare v_count integer;
begin
  insert into public.erp_doctor_visits (doctor_id, mr_id, visit_date, doctor_status, created_by)
  values
    (pg_temp.id_of('doctor'), pg_temp.id_of('mr1'), current_date,     'EXISTING', pg_temp.id_of('mr1')),
    (pg_temp.id_of('doctor'), pg_temp.id_of('mr2'), current_date,     'EXISTING', pg_temp.id_of('mr2')),
    (pg_temp.id_of('doctor'), pg_temp.id_of('mr1'), current_date - 1, 'EXISTING', pg_temp.id_of('mr1'));

  select count(*) into v_count
    from public.erp_doctor_visits where doctor_id = pg_temp.id_of('doctor');

  assert v_count = 3,
    format('Expected 3 visits to one doctor by two MRs, found %s', v_count);
end $$;

-- One visit covers many products (spec §19).
do $$
declare v_visit uuid; v_product2 uuid; v_count integer;
begin
  select id into v_visit from public.erp_doctor_visits
   where doctor_id = pg_temp.id_of('doctor') limit 1;

  insert into public.erp_products (product_name, unit, mrp, purchase_rate, sale_rate, gst_rate, created_by)
  values ('Testazole 20', 'BOX', 80, 40, 60, 12, pg_temp.id_of('admin'))
  returning id into v_product2;

  insert into public.erp_doctor_visit_products (visit_id, product_id, discussion_type)
  values (v_visit, pg_temp.id_of('product'), 'DETAILED'),
         (v_visit, v_product2,               'SAMPLE_GIVEN');

  select count(*) into v_count
    from public.erp_doctor_visit_products where visit_id = v_visit;

  assert v_count = 2, format('Expected 2 products on one visit, found %s', v_count);
end $$;

-- The same product cannot be recorded twice on one visit.
do $$
declare v_visit uuid; v_failed boolean := false;
begin
  select visit_id into v_visit from public.erp_doctor_visit_products limit 1;

  begin
    insert into public.erp_doctor_visit_products (visit_id, product_id, discussion_type)
    values (v_visit, pg_temp.id_of('product'), 'REMINDER');
  exception when unique_violation then
    v_failed := true;
  end;

  assert v_failed, 'The same product should not be recordable twice on one visit';
end $$;

-- ============================================================================
-- 2. NEW VS EXISTING DOCTOR (spec §18)
-- ============================================================================

do $$
declare v_visit uuid; v_doctor uuid; v_status public.erp_doctor_status;
begin
  insert into public.erp_doctor_visits (doctor_id, mr_id, visit_date, doctor_status, created_by)
  values (pg_temp.id_of('doctor'), pg_temp.id_of('mr1'), current_date, 'NEW', pg_temp.id_of('mr1'))
  returning id into v_visit;

  insert into public.erp_doctors (doctor_name, city, created_from_visit_id, created_by)
  values ('Dr. Brand New', 'Indore', v_visit, pg_temp.id_of('mr1'))
  returning id into v_doctor;

  update public.erp_doctor_visits set doctor_id = v_doctor where id = v_visit;

  select doctor_status into v_status from public.erp_doctor_visits where id = v_visit;
  assert v_status = 'NEW', 'A doctor created inside a visit must be recorded as NEW';

  assert (select created_from_visit_id from public.erp_doctors where id = v_doctor) = v_visit,
    'created_from_visit_id must point at the visit that created the doctor';

  assert (select created_from_visit_id from public.erp_doctors where id = pg_temp.id_of('doctor')) is null,
    'A doctor added from the master screen must have no originating visit';
end $$;

-- Deleting the originating visit must not delete or orphan the doctor.
do $$
declare v_visit uuid; v_doctor uuid;
begin
  select id, created_from_visit_id into v_doctor, v_visit
    from public.erp_doctors where created_from_visit_id is not null limit 1;

  delete from public.erp_doctor_visit_products where visit_id = v_visit;
  delete from public.erp_doctor_visits where id = v_visit;

  assert exists (select 1 from public.erp_doctors where id = v_doctor),
    'Deleting a visit must not delete the doctor it created';
  assert (select created_from_visit_id from public.erp_doctors where id = v_doctor) is null,
    'created_from_visit_id should be cleared, not left pointing at a deleted visit';
end $$;

-- ============================================================================
-- 3. FIELD ORDERS (spec §20, §22, §29)
-- ============================================================================

-- A field order is for a doctor OR a chemist, never both and never neither.
do $$
declare v_failed boolean := false;
begin
  begin
    insert into public.erp_field_orders
      (order_number, customer_type, doctor_id, chemist_id, mr_id, created_by)
    values ('FO/TEST/BOTH', 'DOCTOR', pg_temp.id_of('doctor'), pg_temp.id_of('chemist'),
            pg_temp.id_of('mr1'), pg_temp.id_of('mr1'));
  exception when check_violation then
    v_failed := true;
  end;
  assert v_failed, 'A field order must not carry both a doctor and a chemist';

  v_failed := false;
  begin
    insert into public.erp_field_orders (order_number, customer_type, mr_id, created_by)
    values ('FO/TEST/NEITHER', 'DOCTOR', pg_temp.id_of('mr1'), pg_temp.id_of('mr1'));
  exception when check_violation then
    v_failed := true;
  end;
  assert v_failed, 'A DOCTOR field order must name a doctor';
end $$;

-- Q2: a field order carries many priced products, and its ESTIMATED value is
-- derived from them — quantity x rate, less any discount.
do $$
declare v_order uuid; v_value numeric; v_line numeric;
begin
  insert into public.erp_field_orders
    (order_number, customer_type, doctor_id, mr_id, order_book_number, created_by)
  values ('FO/TEST/00001', 'DOCTOR', pg_temp.id_of('doctor'), pg_temp.id_of('mr1'),
          'OB-001', pg_temp.id_of('mr1'))
  returning id into v_order;

  insert into public.erp_field_order_items
    (field_order_id, product_id, quantity, unit_rate, discount_percent)
  values (v_order, pg_temp.id_of('product'), 20, 75, 0),
         (v_order, (select id from public.erp_products where product_name = 'Testazole 20'), 10, 60, 10);

  select line_value into v_line
    from public.erp_field_order_items
   where field_order_id = v_order and discount_percent = 10;
  assert v_line = 540, format('10 x 60 less 10%% should be 540, got %s', v_line);

  select estimated_value into v_value from public.erp_field_orders where id = v_order;
  assert v_value = 2040,
    format('Order value should be (20*75) + (10*60*0.9) = 2040, got %s', v_value);
end $$;

-- A discount outside 0–100% is not a discount.
do $$
declare v_order uuid; v_failed boolean := false;
begin
  select id into v_order from public.erp_field_orders where order_number = 'FO/TEST/00001';

  begin
    insert into public.erp_field_order_items
      (field_order_id, product_id, quantity, unit_rate, discount_percent)
    values (v_order, pg_temp.id_of('product'), 1, 100, 150);
  exception when check_violation then
    v_failed := true;
  end;
  assert v_failed, 'A discount above 100%% must be refused';
end $$;

-- THE central rule (Q2): a priced field order still creates no sale, no stock
-- movement and nothing to collect.
do $$
declare v_sales integer; v_ledger integer; v_qty integer; v_receipts integer;
begin
  select current_quantity into v_qty from public.erp_product_batches where id = pg_temp.id_of('batch');

  select count(*) into v_sales    from public.erp_sales_invoices;
  select count(*) into v_ledger   from public.erp_inventory_transactions;
  select count(*) into v_receipts from public.erp_sales_receipts;

  assert v_sales = 0,
    'Recording field orders must not create any sales invoice (spec §29)';
  assert v_ledger = 0,
    'Recording field orders must not create any inventory transaction';
  assert v_receipts = 0,
    'Recording field orders must not create anything receivable (Q2)';
  assert coalesce(v_qty, 0) = 0,
    'Field orders must not change stock on hand';

  -- No structural link exists either.
  assert not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'erp_field_orders'
       and column_name like '%sales_invoice%'
  ), 'erp_field_orders must have no reference to a sales invoice';

  assert not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'erp_field_orders'
       and column_name in ('amount_paid', 'payment_status', 'batch_id')
  ), 'erp_field_orders must carry no payment or stock columns';
end $$;

-- The physical order-book number repeats across MRs but not within one.
do $$
declare v_failed boolean := false;
begin
  -- Same book number, different MR: allowed.
  insert into public.erp_field_orders
    (order_number, customer_type, doctor_id, mr_id, order_book_number, created_by)
  values ('FO/TEST/00002', 'DOCTOR', pg_temp.id_of('doctor'), pg_temp.id_of('mr2'),
          'OB-001', pg_temp.id_of('mr2'));

  -- Same book number, same MR: rejected.
  begin
    insert into public.erp_field_orders
      (order_number, customer_type, doctor_id, mr_id, order_book_number, created_by)
    values ('FO/TEST/00003', 'DOCTOR', pg_temp.id_of('doctor'), pg_temp.id_of('mr1'),
            'OB-001', pg_temp.id_of('mr1'));
  exception when unique_violation then
    v_failed := true;
  end;

  assert v_failed, 'One MR must not reuse the same order-book number twice';
end $$;

-- ============================================================================
-- 4. INVENTORY (spec §15, §16, §53)
-- ============================================================================

-- Stock in raises the batch quantity; stock out lowers it.
do $$
declare v_qty integer;
begin
  insert into public.erp_inventory_transactions
    (product_id, batch_id, transaction_type, reference_type, quantity, unit_rate,
     transaction_date, remarks, created_by)
  values (pg_temp.id_of('product'), pg_temp.id_of('batch'), 'PURCHASE', 'PURCHASE_INVOICE',
          100, 50, current_date, 'Test purchase', pg_temp.id_of('admin'));

  select current_quantity into v_qty from public.erp_product_batches where id = pg_temp.id_of('batch');
  assert v_qty = 100, format('Purchase should raise stock to 100, got %s', v_qty);

  insert into public.erp_inventory_transactions
    (product_id, batch_id, transaction_type, reference_type, quantity, unit_rate,
     transaction_date, remarks, created_by)
  values (pg_temp.id_of('product'), pg_temp.id_of('batch'), 'SALE', 'SALES_INVOICE',
          -30, 75, current_date, 'Test sale', pg_temp.id_of('admin'));

  select current_quantity into v_qty from public.erp_product_batches where id = pg_temp.id_of('batch');
  assert v_qty = 70, format('Sale of 30 should leave 70, got %s', v_qty);
end $$;

-- A sale return puts stock back.
do $$
declare v_qty integer;
begin
  insert into public.erp_inventory_transactions
    (product_id, batch_id, transaction_type, reference_type, quantity,
     transaction_date, remarks, created_by)
  values (pg_temp.id_of('product'), pg_temp.id_of('batch'), 'SALE_RETURN', 'ADJUSTMENT',
          10, current_date, 'Test return', pg_temp.id_of('admin'));

  select current_quantity into v_qty from public.erp_product_batches where id = pg_temp.id_of('batch');
  assert v_qty = 80, format('Return of 10 should restore stock to 80, got %s', v_qty);
end $$;

-- Direction is a property of the transaction type, not a free choice.
do $$
declare v_failed boolean := false;
begin
  begin
    insert into public.erp_inventory_transactions
      (product_id, batch_id, transaction_type, reference_type, quantity,
       transaction_date, created_by)
    values (pg_temp.id_of('product'), pg_temp.id_of('batch'), 'PURCHASE', 'PURCHASE_INVOICE',
            -5, current_date, pg_temp.id_of('admin'));
  exception when check_violation then
    v_failed := true;
  end;
  assert v_failed, 'A PURCHASE must not carry a negative quantity';
end $$;

-- Stock cannot go negative.
do $$
declare v_failed boolean := false; v_qty integer;
begin
  begin
    insert into public.erp_inventory_transactions
      (product_id, batch_id, transaction_type, reference_type, quantity,
       transaction_date, created_by)
    values (pg_temp.id_of('product'), pg_temp.id_of('batch'), 'SALE', 'SALES_INVOICE',
            -1000, current_date, pg_temp.id_of('admin'));
  exception when others then
    v_failed := true;
  end;

  assert v_failed, 'Selling more than the batch holds must be refused';

  select current_quantity into v_qty from public.erp_product_batches where id = pg_temp.id_of('batch');
  assert v_qty = 80, format('A refused sale must leave stock untouched at 80, got %s', v_qty);
end $$;

-- Manual movements must state a reason.
do $$
declare v_failed boolean := false;
begin
  begin
    insert into public.erp_inventory_transactions
      (product_id, batch_id, transaction_type, reference_type, quantity,
       transaction_date, created_by)
    values (pg_temp.id_of('product'), pg_temp.id_of('batch'), 'DAMAGE', 'ADJUSTMENT',
            -5, current_date, pg_temp.id_of('admin'));
  exception when check_violation then
    v_failed := true;
  end;
  assert v_failed, 'A damage write-off without a reason must be refused';
end $$;

-- The ledger is append-only.
do $$
declare v_failed boolean := false; v_txn uuid;
begin
  select id into v_txn from public.erp_inventory_transactions limit 1;

  begin
    update public.erp_inventory_transactions set quantity = 999 where id = v_txn;
  exception when others then
    v_failed := true;
  end;
  assert v_failed, 'Inventory history must not be editable';

  v_failed := false;
  begin
    delete from public.erp_inventory_transactions where id = v_txn;
  exception when others then
    v_failed := true;
  end;
  assert v_failed, 'Inventory history must not be deletable';
end $$;

-- The cached quantity agrees with the ledger. Run as staff: the function now
-- checks its own authorization (pre-PR hardening), so the bare test
-- connection — neither `authenticated` nor `service_role` — must impersonate
-- someone the function actually accepts.
do $$
declare v_bad integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);

  select count(*) into v_bad from public.erp_reconcile_batch_quantities();

  reset role;
  assert v_bad = 0, format('%s batches disagree with the ledger', v_bad);
end $$;

-- An MR CAN also run this one: it summarizes batch quantities, which RLS
-- already lets every active staff member read directly from
-- erp_product_batches, so the function adds no new exposure. Only the
-- invoice-payment check below is billing-only.
do $$
declare v_failed boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr1'), 'role', 'authenticated')::text, true);

  begin
    perform public.erp_reconcile_batch_quantities();
  exception when others then
    v_failed := true;
  end;

  reset role;
  assert not v_failed, 'An MR should be able to run the stock reconciliation check — it reads nothing they cannot already see';
end $$;

-- ============================================================================
-- 5. BILLING (spec §35, §52)
-- ============================================================================

-- One supplier cannot have the same invoice number twice.
do $$
declare v_failed boolean := false;
begin
  insert into public.erp_purchase_invoices (invoice_number, supplier_id, invoice_date, created_by)
  values ('SUP/001', pg_temp.id_of('supplier'), current_date, pg_temp.id_of('admin'));

  begin
    insert into public.erp_purchase_invoices (invoice_number, supplier_id, invoice_date, created_by)
    values ('SUP/001', pg_temp.id_of('supplier'), current_date, pg_temp.id_of('admin'));
  exception when unique_violation then
    v_failed := true;
  end;

  assert v_failed, 'A duplicate invoice number for one supplier must be rejected';
end $$;

-- Our own sales invoice numbers are unique across the company.
do $$
declare v_failed boolean := false;
begin
  insert into public.erp_sales_invoices (invoice_number, distributor_id, invoice_date, created_by)
  values ('INV/TEST/1', pg_temp.id_of('distributor'), current_date, pg_temp.id_of('admin'));

  begin
    insert into public.erp_sales_invoices (invoice_number, distributor_id, invoice_date, created_by)
    values ('INV/TEST/1', pg_temp.id_of('distributor'), current_date, pg_temp.id_of('admin'));
  exception when unique_violation then
    v_failed := true;
  end;

  assert v_failed, 'A duplicate sales invoice number must be rejected';
end $$;

-- A sales invoice bills exactly one of distributor / chemist / doctor.
do $$
declare v_failed boolean := false;
begin
  insert into public.erp_sales_invoices (invoice_number, doctor_id, invoice_date, created_by)
  values ('INV/TEST/DOCTOR', pg_temp.id_of('doctor'), current_date, pg_temp.id_of('admin'));

  begin
    insert into public.erp_sales_invoices (invoice_number, distributor_id, doctor_id, invoice_date, created_by)
    values ('INV/TEST/BOTH', pg_temp.id_of('distributor'), pg_temp.id_of('doctor'), current_date, pg_temp.id_of('admin'));
  exception when check_violation then
    v_failed := true;
  end;
  assert v_failed, 'A sales invoice must not bill both a distributor and a doctor at once';

  v_failed := false;
  begin
    insert into public.erp_sales_invoices (invoice_number, invoice_date, created_by)
    values ('INV/TEST/NEITHER', current_date, pg_temp.id_of('admin'));
  exception when check_violation then
    v_failed := true;
  end;
  assert v_failed, 'A sales invoice must bill someone — distributor, chemist or doctor';
end $$;

-- ── Q6: payment history is the source of truth ──
-- Worked through with the exact figures from the brief: a ₹2,00,000 invoice
-- settled by receipts of 50,000 / 75,000 / 25,000 must read
-- Received 1,50,000 · Balance 50,000 · PARTIALLY_PAID.
do $$
declare
  v_invoice uuid;
  v_status  public.erp_payment_status;
  v_paid    numeric;
begin
  select id into v_invoice from public.erp_sales_invoices where invoice_number = 'INV/TEST/1';
  update public.erp_sales_invoices set grand_total = 200000 where id = v_invoice;

  select payment_status into v_status from public.erp_sales_invoices where id = v_invoice;
  assert v_status = 'UNPAID', format('No receipts should read UNPAID, got %s', v_status);

  insert into public.erp_sales_receipts (sales_invoice_id, receipt_date, amount, payment_method, created_by)
  values (v_invoice, current_date, 50000, 'BANK_TRANSFER', pg_temp.id_of('admin')),
         (v_invoice, current_date, 75000, 'CHEQUE',        pg_temp.id_of('admin')),
         (v_invoice, current_date, 25000, 'UPI',           pg_temp.id_of('admin'));

  select amount_paid, payment_status into v_paid, v_status
    from public.erp_sales_invoices where id = v_invoice;

  assert v_paid = 150000, format('Three receipts should total 150000, got %s', v_paid);
  assert v_status = 'PARTIALLY_PAID',
    format('Part settled should read PARTIALLY_PAID, got %s', v_status);
  assert (select count(*) from public.erp_sales_receipts where sales_invoice_id = v_invoice) = 3,
    'All three receipts must be kept, not collapsed into one figure';

  -- Settling the rest closes it.
  insert into public.erp_sales_receipts (sales_invoice_id, receipt_date, amount, payment_method, created_by)
  values (v_invoice, current_date, 50000, 'CASH', pg_temp.id_of('admin'));

  select amount_paid, payment_status into v_paid, v_status
    from public.erp_sales_invoices where id = v_invoice;
  assert v_paid = 200000, format('Fully settled should total 200000, got %s', v_paid);
  assert v_status = 'PAID', format('Fully settled should read PAID, got %s', v_status);
end $$;

-- Removing a receipt puts the balance back.
do $$
declare v_invoice uuid; v_paid numeric; v_status public.erp_payment_status; v_receipt uuid;
begin
  select id into v_invoice from public.erp_sales_invoices where invoice_number = 'INV/TEST/1';

  select id into v_receipt from public.erp_sales_receipts
   where sales_invoice_id = v_invoice and amount = 50000 and payment_method = 'CASH';

  delete from public.erp_sales_receipts where id = v_receipt;

  select amount_paid, payment_status into v_paid, v_status
    from public.erp_sales_invoices where id = v_invoice;
  assert v_paid = 150000, format('Removing a 50000 receipt should leave 150000, got %s', v_paid);
  assert v_status = 'PARTIALLY_PAID', 'Status must follow the balance back down';
end $$;

-- An invoice cannot be paid more than it is worth.
do $$
declare v_invoice uuid; v_failed boolean := false; v_paid numeric;
begin
  select id into v_invoice from public.erp_sales_invoices where invoice_number = 'INV/TEST/1';

  begin
    insert into public.erp_sales_receipts (sales_invoice_id, receipt_date, amount, payment_method, created_by)
    values (v_invoice, current_date, 100000, 'CASH', pg_temp.id_of('admin'));
  exception when others then
    v_failed := true;
  end;

  assert v_failed, 'A receipt taking the total past the invoice value must be refused';

  select amount_paid into v_paid from public.erp_sales_invoices where id = v_invoice;
  assert v_paid = 150000, format('A refused receipt must leave the balance alone, got %s', v_paid);
end $$;

-- The same rules hold on the purchase side.
do $$
declare v_invoice uuid; v_paid numeric; v_status public.erp_payment_status; v_failed boolean := false;
begin
  select id into v_invoice from public.erp_purchase_invoices where invoice_number = 'SUP/001';
  update public.erp_purchase_invoices set grand_total = 100000 where id = v_invoice;

  insert into public.erp_purchase_payments (purchase_invoice_id, payment_date, amount, payment_method, created_by)
  values (v_invoice, current_date, 40000, 'BANK_TRANSFER', pg_temp.id_of('admin')),
         (v_invoice, current_date, 30000, 'CHEQUE',        pg_temp.id_of('admin'));

  select amount_paid, payment_status into v_paid, v_status
    from public.erp_purchase_invoices where id = v_invoice;

  assert v_paid = 70000, format('40000 + 30000 should total 70000, got %s', v_paid);
  assert v_status = 'PARTIALLY_PAID',
    format('70000 of 100000 should read PARTIALLY_PAID, got %s', v_status);

  begin
    insert into public.erp_purchase_payments (purchase_invoice_id, payment_date, amount, payment_method, created_by)
    values (v_invoice, current_date, 40000, 'CASH', pg_temp.id_of('admin'));
  exception when others then
    v_failed := true;
  end;
  assert v_failed, 'A payment exceeding the purchase invoice balance must be refused';
end $$;

-- A payment must be for a positive amount.
do $$
declare v_invoice uuid; v_failed boolean := false;
begin
  select id into v_invoice from public.erp_purchase_invoices where invoice_number = 'SUP/001';

  begin
    insert into public.erp_purchase_payments (purchase_invoice_id, payment_date, amount, payment_method, created_by)
    values (v_invoice, current_date, 0, 'CASH', pg_temp.id_of('admin'));
  exception when check_violation then
    v_failed := true;
  end;
  assert v_failed, 'A zero-value payment must be refused';
end $$;

-- Expiry and quantity constraints hold.
do $$
declare v_failed boolean := false;
begin
  begin
    insert into public.erp_product_batches (product_id, batch_number, manufacturing_date,
                                            expiry_date, created_by)
    values (pg_temp.id_of('product'), 'TEST-BAD', current_date, current_date - 1, pg_temp.id_of('admin'));
  exception when check_violation then
    v_failed := true;
  end;
  assert v_failed, 'A batch cannot expire before it was made';

  v_failed := false;
  begin
    insert into public.erp_field_order_items (field_order_id, product_id, quantity)
    select id, pg_temp.id_of('product'), 0 from public.erp_field_orders limit 1;
  exception when check_violation then
    v_failed := true;
  end;
  assert v_failed, 'An order line must be for more than zero units';
end $$;

-- ============================================================================
-- 6. DOCUMENT NUMBERING (spec §22)
-- ============================================================================

do $$
declare v_a text; v_b text;
begin
  v_a := public.erp_next_document_number('test_kind', 'TST');
  v_b := public.erp_next_document_number('test_kind', 'TST');

  assert v_a <> v_b, 'Consecutive document numbers must differ';
  assert v_a like 'TST/%', format('Number should carry its prefix, got %s', v_a);
  assert right(v_b, 5)::integer = right(v_a, 5)::integer + 1,
    format('Numbers should increment: %s then %s', v_a, v_b);
end $$;

-- ============================================================================
-- 7. ROW LEVEL SECURITY (spec §36)
-- Executed as `authenticated` with a forged-looking JWT claim, which is exactly
-- what a request from the browser looks like to PostgREST.
-- ============================================================================

-- An MR sees their own visits and nobody else's.
do $$
declare v_visible integer; v_total integer;
begin
  select count(*) into v_total from public.erp_doctor_visits;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr1'), 'role', 'authenticated')::text, true);

  select count(*) into v_visible from public.erp_doctor_visits;

  reset role;

  assert v_visible < v_total,
    format('MR1 should not see all %s visits, but saw %s', v_total, v_visible);
  assert v_visible > 0, 'MR1 should still see their own visits';
end $$;

-- An MR cannot file a visit under another MR's name.
do $$
declare v_failed boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr1'), 'role', 'authenticated')::text, true);

  begin
    insert into public.erp_doctor_visits (doctor_id, mr_id, visit_date, doctor_status, created_by)
    values (pg_temp.id_of('doctor'), pg_temp.id_of('mr2'), current_date, 'EXISTING', pg_temp.id_of('mr2'));
  exception when others then
    v_failed := true;
  end;

  reset role;
  assert v_failed, 'An MR must not be able to record a visit under another MR';
end $$;

-- An MR cannot see company invoices at all.
do $$
declare v_sales integer; v_purchases integer; v_ledger integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr1'), 'role', 'authenticated')::text, true);

  select count(*) into v_sales     from public.erp_sales_invoices;
  select count(*) into v_purchases from public.erp_purchase_invoices;
  select count(*) into v_ledger    from public.erp_inventory_transactions;

  reset role;

  assert v_sales = 0,     format('An MR must not read sales invoices, saw %s', v_sales);
  assert v_purchases = 0, format('An MR must not read purchase invoices, saw %s', v_purchases);
  assert v_ledger = 0,    format('An MR must not read the inventory ledger, saw %s', v_ledger);
end $$;

-- An MR cannot write inventory by any route.
do $$
declare v_failed boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr1'), 'role', 'authenticated')::text, true);

  begin
    insert into public.erp_inventory_transactions
      (product_id, batch_id, transaction_type, reference_type, quantity,
       transaction_date, remarks, created_by)
    values (pg_temp.id_of('product'), pg_temp.id_of('batch'), 'ADJUSTMENT_IN', 'ADJUSTMENT',
            50, current_date, 'should not be allowed', pg_temp.id_of('mr1'));
  exception when others then
    v_failed := true;
  end;

  reset role;
  assert v_failed, 'An MR must not be able to write the inventory ledger';
end $$;

-- An MR cannot change the product master.
do $$
declare v_failed boolean := false; v_rows integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr1'), 'role', 'authenticated')::text, true);

  begin
    update public.erp_products set sale_rate = 1 where id = pg_temp.id_of('product');
    get diagnostics v_rows = row_count;
    -- RLS silently matches no rows rather than raising, so zero updates is the
    -- expected outcome here.
    v_failed := (v_rows = 0);
  exception when others then
    v_failed := true;
  end;

  reset role;
  assert v_failed, 'An MR must not be able to reprice a product';
end $$;

-- An MR cannot promote themselves.
do $$
declare v_failed boolean := false; v_role public.erp_role;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr1'), 'role', 'authenticated')::text, true);

  begin
    update public.erp_users set role = 'ADMIN' where auth_user_id = pg_temp.id_of('auth_mr1');
  exception when others then
    v_failed := true;
  end;

  reset role;

  select role into v_role from public.erp_users where auth_user_id = pg_temp.id_of('auth_mr1');
  assert v_role = 'MR',
    format('An MR must not be able to make themselves an admin (role is now %s)', v_role);
end $$;

-- An MR cannot see or touch payment records (Q6).
do $$
declare v_payments integer; v_receipts integer; v_failed boolean := false; v_invoice uuid;
begin
  select id into v_invoice from public.erp_sales_invoices where invoice_number = 'INV/TEST/1';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr1'), 'role', 'authenticated')::text, true);

  select count(*) into v_payments from public.erp_purchase_payments;
  select count(*) into v_receipts from public.erp_sales_receipts;

  begin
    insert into public.erp_sales_receipts (sales_invoice_id, receipt_date, amount, payment_method, created_by)
    values (v_invoice, current_date, 1, 'CASH', pg_temp.id_of('mr1'));
  exception when others then
    v_failed := true;
  end;

  reset role;

  assert v_payments = 0, format('An MR must not read supplier payments, saw %s', v_payments);
  assert v_receipts = 0, format('An MR must not read distributor receipts, saw %s', v_receipts);
  assert v_failed,       'An MR must not be able to record a payment';
end $$;

-- An admin sees everything.
do $$
declare v_visits integer; v_sales integer; v_receipts integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);

  select count(*) into v_visits   from public.erp_doctor_visits;
  select count(*) into v_sales    from public.erp_sales_invoices;
  select count(*) into v_receipts from public.erp_sales_receipts;

  reset role;

  assert v_visits > 0,   'An admin should see the whole field force''s visits';
  assert v_sales > 0,    'An admin should see company sales invoices';
  assert v_receipts > 0, 'An admin should see the payment history';
end $$;

-- ============================================================================
-- 8. EXPIRED STOCK (Q9)
-- Blocked by default; an override needs the business switch, an administrator,
-- and a written reason, and leaves an audit record.
-- ============================================================================

-- The recorded override cannot be incomplete.
do $$
declare v_invoice uuid; v_failed boolean := false;
begin
  select id into v_invoice from public.erp_sales_invoices where invoice_number = 'INV/TEST/1';

  begin
    update public.erp_sales_invoices
       set expired_sale_override = true,
           expired_sale_reason = null,
           expired_sale_approved_by = null,
           expired_sale_approved_at = null
     where id = v_invoice;
  exception when check_violation then
    v_failed := true;
  end;

  assert v_failed, 'An expired-sale override with no reason or approver must be refused';
end $$;

-- Selling an expired batch is refused while the business switch is off.
do $$
declare
  v_batch  uuid;
  v_failed boolean := false;
  v_before integer;
  v_after  integer;
begin
  -- A batch that expired yesterday, with stock in it.
  insert into public.erp_product_batches
    (product_id, batch_number, expiry_date, mrp, purchase_rate, sale_rate, created_by)
  values (pg_temp.id_of('product'), 'TEST-EXPIRED', current_date - 1, 100, 50, 75,
          pg_temp.id_of('admin'))
  returning id into v_batch;

  insert into public.erp_inventory_transactions
    (product_id, batch_id, transaction_type, reference_type, quantity, transaction_date,
     remarks, created_by)
  values (pg_temp.id_of('product'), v_batch, 'OPENING', 'OPENING', 50, current_date,
          'Expired-batch test stock', pg_temp.id_of('admin'));

  update public.erp_settings set allow_expired_sale = false where id = 1;

  select count(*) into v_before from public.erp_sales_invoices;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);

  begin
    perform public.erp_save_sales_invoice(jsonb_build_object(
      'distributor_id', pg_temp.id_of('distributor'),
      'invoice_date',   current_date,
      'items', jsonb_build_array(jsonb_build_object(
        'product_id', pg_temp.id_of('product'),
        'batch_id',   v_batch,
        'quantity',   1,
        'sale_rate',  75,
        'gst_rate',   12
      ))
    ));
  exception when others then
    v_failed := true;
  end;

  reset role;

  select count(*) into v_after from public.erp_sales_invoices;

  assert v_failed, 'Selling an expired batch must be refused while expired sales are switched off';
  assert v_after = v_before,
    'A refused expired sale must leave no invoice behind — the whole transaction rolls back';
end $$;

-- With the switch on, an administrator must still give a reason.
do $$
declare v_batch uuid; v_failed boolean := false;
begin
  select id into v_batch from public.erp_product_batches where batch_number = 'TEST-EXPIRED';
  update public.erp_settings set allow_expired_sale = true where id = 1;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);

  begin
    perform public.erp_save_sales_invoice(jsonb_build_object(
      'distributor_id', pg_temp.id_of('distributor'),
      'invoice_date',   current_date,
      'items', jsonb_build_array(jsonb_build_object(
        'product_id', pg_temp.id_of('product'),
        'batch_id',   v_batch,
        'quantity',   1,
        'sale_rate',  75,
        'gst_rate',   12
      ))
    ));
  exception when others then
    v_failed := true;
  end;

  reset role;
  assert v_failed, 'An expired sale without a written reason must be refused even for an admin';
end $$;

-- With the switch on, a reason, and an administrator: allowed, recorded, audited.
do $$
declare
  v_batch    uuid;
  v_result   jsonb;
  v_invoice  uuid;
  v_override boolean;
  v_reason   text;
  v_approver uuid;
  v_audited  integer;
begin
  select id into v_batch from public.erp_product_batches where batch_number = 'TEST-EXPIRED';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);

  v_result := public.erp_save_sales_invoice(jsonb_build_object(
    'distributor_id',      pg_temp.id_of('distributor'),
    'invoice_date',        current_date,
    'expired_sale_reason', 'Distributor accepted short-dated stock for export at a discount.',
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', pg_temp.id_of('product'),
      'batch_id',   v_batch,
      'quantity',   2,
      'sale_rate',  75,
      'gst_rate',   12
    ))
  ));

  reset role;

  v_invoice := (v_result->>'invoice_id')::uuid;

  select expired_sale_override, expired_sale_reason, expired_sale_approved_by
    into v_override, v_reason, v_approver
    from public.erp_sales_invoices where id = v_invoice;

  assert v_override, 'An authorised expired sale must be flagged on the invoice';
  assert v_reason is not null, 'The reason must be stored on the invoice';
  assert v_approver = pg_temp.id_of('admin'), 'The approving administrator must be recorded';
  assert (select expired_sale_approved_at from public.erp_sales_invoices where id = v_invoice) is not null,
    'The time of approval must be recorded';

  select count(*) into v_audited
    from public.erp_audit_logs
   where action = 'EXPIRED_SALE_OVERRIDE' and record_id = v_invoice;
  assert v_audited = 1, format('The override must leave exactly one audit record, found %s', v_audited);
end $$;

-- A non-administrator cannot authorise it even with the switch on.
do $$
declare v_batch uuid; v_failed boolean := false; v_auth_acct uuid; v_acct uuid;
begin
  select id into v_batch from public.erp_product_batches where batch_number = 'TEST-EXPIRED';

  v_auth_acct := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_auth_acct, 'authenticated', 'authenticated',
          'test-acct@leomed.test', '', now(), now(), now());

  insert into public.erp_users (auth_user_id, name, email, role)
  values (v_auth_acct, 'Test Accountant', 'test-acct@leomed.test', 'ACCOUNTANT')
  returning id into v_acct;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_auth_acct, 'role', 'authenticated')::text, true);

  begin
    perform public.erp_save_sales_invoice(jsonb_build_object(
      'distributor_id',      pg_temp.id_of('distributor'),
      'invoice_date',        current_date,
      'expired_sale_reason', 'Trying to authorise without being an administrator.',
      'items', jsonb_build_array(jsonb_build_object(
        'product_id', pg_temp.id_of('product'),
        'batch_id',   v_batch,
        'quantity',   1,
        'sale_rate',  75,
        'gst_rate',   12
      ))
    ));
  exception when others then
    v_failed := true;
  end;

  reset role;
  assert v_failed, 'Only an administrator may authorise selling expired stock';
end $$;

-- Selling in-date stock is unaffected by any of the above.
do $$
declare v_result jsonb; v_override boolean;
begin
  update public.erp_settings set allow_expired_sale = false where id = 1;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);

  v_result := public.erp_save_sales_invoice(jsonb_build_object(
    'distributor_id', pg_temp.id_of('distributor'),
    'invoice_date',   current_date,
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', pg_temp.id_of('product'),
      'batch_id',   pg_temp.id_of('batch'),
      'quantity',   5,
      'sale_rate',  75,
      'gst_rate',   12
    ))
  ));

  reset role;

  select expired_sale_override into v_override
    from public.erp_sales_invoices where id = (v_result->>'invoice_id')::uuid;

  assert not v_override, 'An ordinary sale must not be flagged as an expired-stock override';
  assert (v_result->>'grand_total')::numeric = 420,
    format('5 x 75 plus 12%% GST should be 420, got %s', v_result->>'grand_total');
end $$;

-- Invoice caches agree with their payment histories. Run as staff, since the
-- function now checks its own authorization (pre-PR hardening).
do $$
declare v_bad integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);

  select count(*) into v_bad from public.erp_reconcile_invoice_payments();

  reset role;
  assert v_bad = 0, format('%s invoices disagree with their payment history', v_bad);
end $$;

-- Unlike the stock check, this one is real financial data. An MR must not
-- be able to run it — it would otherwise leak every invoice number and
-- payment total in the company, which RLS elsewhere goes out of its way to
-- keep from them (spec §5, §36).
do $$
declare v_failed boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr1'), 'role', 'authenticated')::text, true);

  begin
    perform public.erp_reconcile_invoice_payments();
  exception when others then
    v_failed := true;
  end;

  reset role;
  assert v_failed, 'An MR must not be able to read company-wide invoice payment data';
end $$;

-- ============================================================================
-- 9. RLS HARDENING REGRESSION TESTS (pre-PR review findings)
--
-- Each of these reproduces a gap the review found and this branch fixed:
-- a blanket column grant plus a missing or incomplete WITH CHECK let an
-- owning MR change a column direct-table access was never meant to expose.
-- ============================================================================

-- An MR must not be able to set their own field order's status directly —
-- neither via a raw PATCH nor via the RPC that used to trust RLS alone.
-- Spec §3/§26: only admin/manager may move a field order through its
-- fulfilment statuses.
do $$
declare v_order uuid; v_failed boolean := false; v_status public.erp_field_order_status;
begin
  select id into v_order from public.erp_field_orders where order_number = 'FO/TEST/00001';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr1'), 'role', 'authenticated')::text, true);

  -- Direct table PATCH.
  begin
    update public.erp_field_orders set status = 'FULFILLED' where id = v_order;
  exception when others then
    v_failed := true;
  end;

  reset role;
  select status into v_status from public.erp_field_orders where id = v_order;
  assert v_status <> 'FULFILLED',
    'An MR must not be able to change a field order''s status via direct UPDATE';

  -- The RPC an admin would legitimately use for this.
  v_failed := false;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr1'), 'role', 'authenticated')::text, true);

  begin
    perform public.erp_set_field_order_status(v_order, 'FULFILLED', null);
  exception when others then
    v_failed := true;
  end;

  reset role;
  assert v_failed, 'An MR must not be able to change a field order''s status via the RPC either';

  -- An admin still can, through the same RPC. Impersonated explicitly: the
  -- function's internal check reads auth.uid(), which is null on the bare
  -- test connection, so calling it unscoped would fail for the wrong reason.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);

  perform public.erp_set_field_order_status(v_order, 'FULFILLED', null);

  reset role;
  select status into v_status from public.erp_field_orders where id = v_order;
  assert v_status = 'FULFILLED', 'An admin must still be able to set field order status';
end $$;

-- estimated_value is derived from line items and must not be settable by a
-- direct UPDATE, by anyone — it is meant to be as fixed as a generated
-- column. Run as `authenticated` (admin): the column is absent from the
-- grant entirely, so even an admin cannot write it directly — only the
-- item-sync trigger may. A superuser test connection would bypass the grant
-- and prove nothing, so this must be role-scoped like the others.
do $$
declare v_order uuid; v_before numeric; v_after numeric; v_failed boolean := false;
begin
  select id, estimated_value into v_order, v_before
    from public.erp_field_orders where order_number = 'FO/TEST/00001';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);

  begin
    update public.erp_field_orders set estimated_value = 999999 where id = v_order;
  exception when others then
    v_failed := true;
  end;

  reset role;

  select estimated_value into v_after from public.erp_field_orders where id = v_order;
  assert v_failed and v_after = v_before,
    format('estimated_value must not be directly writable by anyone — was %s, attempted overwrite to 999999, now %s',
           v_before, v_after);
end $$;

-- An MR must not be able to reassign a field order to a different MR, doctor
-- or chemist via direct UPDATE — only the columns a correction plausibly
-- needs (book number, date, remarks) are in the grant.
do $$
declare v_order uuid; v_failed boolean := false;
begin
  select id into v_order from public.erp_field_orders where order_number = 'FO/TEST/00001';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr1'), 'role', 'authenticated')::text, true);

  begin
    update public.erp_field_orders set mr_id = pg_temp.id_of('mr2') where id = v_order;
  exception when others then
    v_failed := true;
  end;

  reset role;
  assert v_failed, 'An MR must not be able to reassign a field order to another MR';
end $$;

-- A field order item's product/order cannot be reassigned; quantity/rate can.
do $$
declare v_item uuid; v_order uuid; v_other_order uuid; v_failed boolean := false;
begin
  select id, field_order_id into v_item, v_order
    from public.erp_field_order_items where field_order_id = (
      select id from public.erp_field_orders where order_number = 'FO/TEST/00001'
    ) limit 1;

  select id into v_other_order from public.erp_field_orders where order_number = 'FO/TEST/00002';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr1'), 'role', 'authenticated')::text, true);

  begin
    update public.erp_field_order_items set field_order_id = v_other_order where id = v_item;
  exception when others then
    v_failed := true;
  end;

  reset role;
  assert v_failed, 'A field order line must not be reassignable to a different order';
end $$;

-- A doctor's active flag is administrative — an MR who created the doctor
-- must not be able to flip it, neither directly nor through the action's
-- underlying RPC.
do $$
declare v_doctor uuid; v_failed boolean := false; v_active boolean;
begin
  insert into public.erp_doctors (doctor_name, city, created_by)
  values ('Dr. Hardening Test', 'Indore', pg_temp.id_of('mr1'))
  returning id into v_doctor;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr1'), 'role', 'authenticated')::text, true);

  begin
    update public.erp_doctors set active = false where id = v_doctor;
  exception when others then
    v_failed := true;
  end;

  reset role;
  select active into v_active from public.erp_doctors where id = v_doctor;
  assert v_active, 'An MR must not be able to deactivate a doctor via direct UPDATE, even one they created';

  v_failed := false;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr1'), 'role', 'authenticated')::text, true);

  begin
    perform public.erp_set_doctor_active(v_doctor, false);
  exception when others then
    v_failed := true;
  end;

  reset role;
  assert v_failed, 'An MR must not be able to deactivate a doctor via erp_set_doctor_active either';

  -- An admin still can, impersonated explicitly for the same reason as above.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);

  perform public.erp_set_doctor_active(v_doctor, false);

  reset role;
  select active into v_active from public.erp_doctors where id = v_doctor;
  assert not v_active, 'An admin must still be able to deactivate a doctor';
end $$;

-- Reassigning a payment to a different invoice must not be possible. Run as
-- `authenticated` (an admin) — the column grant, not RLS, is what blocks
-- this, and a superuser test connection would bypass a grant check entirely,
-- proving nothing.
do $$
declare
  v_payment  uuid;
  v_inv_a    uuid;
  v_inv_b    uuid;
  v_failed   boolean := false;
begin
  select id into v_inv_a from public.erp_purchase_invoices where invoice_number = 'SUP/001';

  insert into public.erp_purchase_invoices (invoice_number, supplier_id, invoice_date, created_by)
  values ('SUP/002', pg_temp.id_of('supplier'), current_date, pg_temp.id_of('admin'))
  returning id into v_inv_b;
  update public.erp_purchase_invoices set grand_total = 50000 where id = v_inv_b;

  select id into v_payment from public.erp_purchase_payments
   where purchase_invoice_id = v_inv_a limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);

  begin
    update public.erp_purchase_payments set purchase_invoice_id = v_inv_b where id = v_payment;
  exception when others then
    v_failed := true;
  end;

  reset role;
  assert v_failed, 'A payment must not be reassignable to a different invoice, even by an admin, via direct UPDATE';
end $$;

-- The product/accountant capability split: RLS must still refuse an
-- accountant's product edit even though the application now uses a
-- dedicated capability to stop them reaching the form in the first place —
-- this proves the database itself, not just the UI, draws the line.
do $$
declare v_auth_acct2 uuid; v_acct2 uuid; v_failed boolean := false; v_name text;
begin
  select id into v_acct2 from public.erp_users where email = 'test-acct@leomed.test';

  if v_acct2 is null then
    v_auth_acct2 := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', v_auth_acct2, 'authenticated', 'authenticated',
            'test-acct@leomed.test', '', now(), now(), now());

    insert into public.erp_users (auth_user_id, name, email, role)
    values (v_auth_acct2, 'Test Accountant', 'test-acct@leomed.test', 'ACCOUNTANT')
    returning id into v_acct2;
  else
    select auth_user_id into v_auth_acct2 from public.erp_users where id = v_acct2;
  end if;

  select product_name into v_name from public.erp_products where id = pg_temp.id_of('product');

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_auth_acct2, 'role', 'authenticated')::text, true);

  begin
    update public.erp_products set product_name = 'Tampered by accountant' where id = pg_temp.id_of('product');
  exception when others then
    v_failed := true;
  end;

  reset role;

  assert (
    v_failed
    or (select product_name from public.erp_products where id = pg_temp.id_of('product')) = v_name
  ), 'An accountant must not be able to edit the product master, whether refused outright or filtered by RLS';
end $$;

-- ============================================================================
-- 10. HR: ATTENDANCE, LEAVE, PAYROLL & EXPENSES
--
-- The most important business rule in this module, tested directly: an MR's
-- attendance is gated by check-in/out + GPS + doctor/chemist visit counts;
-- every other non-admin employee is gated by check-in/out + GPS ONLY, never
-- visits; an admin needs no attendance record at all.
-- ============================================================================

do $$
declare
  v_acct      uuid;
  v_auth_acct uuid;
begin
  select id, auth_user_id into v_acct, v_auth_acct
    from public.erp_users where email = 'test-acct@leomed.test';
  insert into t_ids values ('hr_acct', v_acct), ('auth_hr_acct', v_auth_acct)
    on conflict (label) do nothing;

  -- Deterministic regardless of which real calendar weekday the suite runs
  -- on: these three must never accidentally land on their own week-off day
  -- while today's check-in/out tests run.
  update public.erp_users set week_off_days = '{}'
   where id in (pg_temp.id_of('mr1'), pg_temp.id_of('mr2'), v_acct);
end $$;

-- ── Admin needs no attendance record at all ──
do $$
declare v_failed boolean := false; v_message text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);

  begin
    perform public.erp_attendance_check_in(null, null, null);
  exception when others then
    v_failed := true;
    get stacked diagnostics v_message = message_text;
  end;

  reset role;
  assert v_failed and v_message ilike '%do not require attendance%',
    'An administrator must be refused at check-in, not silently recorded';
end $$;

-- ── Duplicate check-in prevented ──
do $$
declare v_failed boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr1'), 'role', 'authenticated')::text, true);

  perform public.erp_attendance_check_in(22.71, 75.85, 12);

  begin
    perform public.erp_attendance_check_in(22.71, 75.85, 12);
  exception when others then
    v_failed := true;
  end;

  reset role;
  assert v_failed, 'A second check-in on the same day must be rejected';
end $$;

-- ── Checked in, not out yet: an exception for review, not a guess ──
do $$
declare v_att uuid; v_status public.erp_attendance_status; v_remarks text;
begin
  select id, attendance_status, remarks into v_att, v_status, v_remarks
    from public.erp_attendance where employee_id = pg_temp.id_of('mr1') and date = current_date;

  assert v_status = 'PENDING_REVIEW' and v_remarks ilike '%Missing check-out%',
    format('An open check-in with no check-out must be PENDING_REVIEW, got %s / %s', v_status, v_remarks);
end $$;

-- ── Individual MR target overrides the global default ──
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);

  insert into public.erp_mr_attendance_targets (mr_id, required_doctor_visits, required_chemist_visits)
  values (pg_temp.id_of('mr1'), 1, 0);

  reset role;
end $$;

-- Backdate mr1's check-in by 9 hours (the public API only ever stamps
-- now(), by design — this is test setup, not something the app exposes) and
-- complete the day. mr1 already has one doctor visit today from fixtures,
-- which now exactly meets their overridden target.
do $$
declare v_status public.erp_attendance_status; v_doc int; v_req_doc int;
begin
  update public.erp_attendance set check_in_time = check_in_time - interval '9 hours'
   where employee_id = pg_temp.id_of('mr1') and date = current_date;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr1'), 'role', 'authenticated')::text, true);
  perform public.erp_attendance_check_out(22.71, 75.85, 12);
  reset role;

  select attendance_status, doctor_visit_count, required_doctor_visits
    into v_status, v_doc, v_req_doc
    from public.erp_attendance where employee_id = pg_temp.id_of('mr1') and date = current_date;

  assert v_status = 'PRESENT' and v_doc >= v_req_doc,
    format('mr1 met their overridden target (%s/%s doctor visits) and worked a full day — expected PRESENT, got %s', v_doc, v_req_doc, v_status);
end $$;

-- ── MR below the (global default) target: an exception, never an automatic
-- absence — a doctor may simply have been unavailable ──
do $$
declare v_status public.erp_attendance_status; v_remarks text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr2'), 'role', 'authenticated')::text, true);
  perform public.erp_attendance_check_in(22.71, 75.85, 12);
  reset role;

  update public.erp_attendance set check_in_time = check_in_time - interval '9 hours'
   where employee_id = pg_temp.id_of('mr2') and date = current_date;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr2'), 'role', 'authenticated')::text, true);
  perform public.erp_attendance_check_out(22.71, 75.85, 12);
  reset role;

  select attendance_status, remarks into v_status, v_remarks
    from public.erp_attendance where employee_id = pg_temp.id_of('mr2') and date = current_date;

  assert v_status = 'PRESENT_WITH_EXCEPTION' and v_remarks ilike '%below target%',
    format('mr2 worked a full day but is short of the global visit target — expected PRESENT_WITH_EXCEPTION, got %s', v_status);
end $$;

-- ── A non-MR employee is NEVER evaluated against a visit target — the most
-- important rule in this module ──
do $$
declare v_status public.erp_attendance_status; v_req_doc int; v_req_chem int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_hr_acct'), 'role', 'authenticated')::text, true);
  perform public.erp_attendance_check_in(22.71, 75.85, 12);
  reset role;

  update public.erp_attendance set check_in_time = check_in_time - interval '9 hours'
   where employee_id = pg_temp.id_of('hr_acct') and date = current_date;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_hr_acct'), 'role', 'authenticated')::text, true);
  perform public.erp_attendance_check_out(22.71, 75.85, 12);
  reset role;

  select attendance_status, required_doctor_visits, required_chemist_visits
    into v_status, v_req_doc, v_req_chem
    from public.erp_attendance where employee_id = pg_temp.id_of('hr_acct') and date = current_date;

  assert v_status = 'PRESENT' and v_req_doc is null and v_req_chem is null,
    format('An accountant with zero visits and a full day must be PRESENT with no visit requirement recorded, got %s (req %s/%s)', v_status, v_req_doc, v_req_chem);
end $$;

-- ── No check-in, no leave, no holiday, not a week-off → ABSENT ──
do $$
declare v_date date; v_status public.erp_attendance_status;
begin
  v_date := case when extract(dow from current_date - 10) = 0 then current_date - 11 else current_date - 10 end;

  perform public.erp_process_daily_attendance(v_date);

  select attendance_status into v_status
    from public.erp_attendance where employee_id = pg_temp.id_of('mr2') and date = v_date;

  assert v_status = 'ABSENT', format('No check-in and no excuse must be ABSENT, got %s', v_status);
end $$;

-- ── Holiday takes precedence ──
do $$
declare v_date date := current_date + 60; v_status public.erp_attendance_status;
begin
  insert into public.erp_holidays (holiday_date, name, created_by)
  values (v_date, 'Test Holiday', pg_temp.id_of('admin'));

  perform public.erp_process_daily_attendance(v_date);

  select attendance_status into v_status
    from public.erp_attendance where employee_id = pg_temp.id_of('mr1') and date = v_date;

  assert v_status = 'HOLIDAY', format('A configured holiday must read HOLIDAY, got %s', v_status);
end $$;

-- ── Weekly off, for an employee with no override (the company default) ──
do $$
declare
  v_office  uuid;
  v_auth    uuid := gen_random_uuid();
  v_sunday  date := (date_trunc('week', current_date) - interval '1 day')::date;
  v_status  public.erp_attendance_status;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_auth, 'authenticated', 'authenticated',
          'test-office@leomed.test', '', now(), now(), now());

  insert into public.erp_users (auth_user_id, name, email, role)
  values (v_auth, 'Test Office Employee', 'test-office@leomed.test', 'VIEWER')
  returning id into v_office;

  perform public.erp_process_daily_attendance(v_sunday);

  select attendance_status into v_status
    from public.erp_attendance where employee_id = v_office and date = v_sunday;

  assert v_status = 'WEEK_OFF', format('Sunday with the company default week-off must read WEEK_OFF, got %s', v_status);
end $$;

-- ── Admin manual correction: ABSENT → PRESENT with a reason, and it sticks
-- through the next automatic run ──
do $$
declare
  v_date date;
  v_att   uuid;
  v_status public.erp_attendance_status;
  v_failed boolean := false;
begin
  v_date := case when extract(dow from current_date - 10) = 0 then current_date - 11 else current_date - 10 end;
  select id into v_att from public.erp_attendance where employee_id = pg_temp.id_of('mr2') and date = v_date;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr1'), 'role', 'authenticated')::text, true);
  begin
    perform public.erp_admin_correct_attendance(v_att, 'PRESENT', null, null, 'Trying to self-approve');
  exception when others then
    v_failed := true;
  end;
  reset role;
  assert v_failed, 'A non-admin must not be able to correct attendance';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);

  v_failed := false;
  begin
    perform public.erp_admin_correct_attendance(v_att, 'PRESENT', null, null, '');
  exception when others then
    v_failed := true;
  end;
  assert v_failed, 'A correction with no reason must be rejected';

  perform public.erp_admin_correct_attendance(v_att, 'PRESENT', null, null,
    'Forgot to check in. Confirmed field work with the distributor.');
  reset role;

  select attendance_status into v_status from public.erp_attendance where id = v_att;
  assert v_status = 'PRESENT', format('Admin correction ABSENT -> PRESENT did not take, got %s', v_status);

  -- The automatic job must never silently revert a human decision.
  perform public.erp_process_daily_attendance(v_date);
  select attendance_status into v_status from public.erp_attendance where id = v_att;
  assert v_status = 'PRESENT', 'A manually-corrected day must survive the next automatic recalculation';
end $$;

-- ── Leave: apply, approve, sync to attendance, no self-approval, RLS scoping ──
do $$
declare
  v_leave_type uuid;
  v_leave      uuid;
  v_from       date := current_date + 90;
  v_to         date := current_date + 91;
  v_failed     boolean := false;
  v_status     public.erp_attendance_status;
begin
  select id into v_leave_type from public.erp_leave_types where name = 'Casual Leave';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr2'), 'role', 'authenticated')::text, true);

  insert into public.erp_leave_requests (employee_id, leave_type_id, from_date, to_date, reason)
  values (pg_temp.id_of('mr2'), v_leave_type, v_from, v_to, 'Family function')
  returning id into v_leave;

  -- An employee must never approve their own leave.
  begin
    perform public.erp_review_leave_request(v_leave, 'APPROVED', null);
  exception when others then
    v_failed := true;
  end;
  reset role;
  assert v_failed, 'An employee must not be able to approve their own leave request';

  -- mr1 must not see mr2's leave request at all.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr1'), 'role', 'authenticated')::text, true);
  assert (select count(*) from public.erp_leave_requests where id = v_leave) = 0,
    'An employee must not see another employee''s leave request';
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);
  perform public.erp_review_leave_request(v_leave, 'APPROVED', 'Approved — noted');
  reset role;

  select attendance_status into v_status
    from public.erp_attendance where employee_id = pg_temp.id_of('mr2') and date = v_from;
  assert v_status = 'LEAVE', format('Approving leave must stamp the covered dates LEAVE, got %s', v_status);

  select attendance_status into v_status
    from public.erp_attendance where employee_id = pg_temp.id_of('mr2') and date = v_to;
  assert v_status = 'LEAVE', 'Both days of a two-day approved leave must read LEAVE';
end $$;

-- Self-service cancel of one's own still-pending request.
do $$
declare v_leave_type uuid; v_leave uuid; v_status public.erp_leave_status;
begin
  select id into v_leave_type from public.erp_leave_types where name = 'Sick Leave';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr1'), 'role', 'authenticated')::text, true);

  insert into public.erp_leave_requests (employee_id, leave_type_id, from_date, to_date)
  values (pg_temp.id_of('mr1'), v_leave_type, current_date + 100, current_date + 100)
  returning id into v_leave;

  update public.erp_leave_requests set status = 'CANCELLED' where id = v_leave;
  reset role;

  select status into v_status from public.erp_leave_requests where id = v_leave;
  assert v_status = 'CANCELLED', 'An employee must be able to cancel their own still-pending leave request';
end $$;

-- ── Payroll: calculation, incentives, finalization lock, historical
-- snapshot immutability ──
do $$
declare
  v_period_id  uuid;
  v_record_id  uuid;
  v_days       int;
  v_net_before numeric;
  v_net_after  numeric;
  v_status     public.erp_payroll_status;
  v_failed     boolean := false;
  v_fixed_snap numeric;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);

  insert into public.erp_employee_salary (employee_id, fixed_salary, basic_salary, gross_salary)
  values (pg_temp.id_of('mr1'), 30000, 15000, 30000)
  on conflict (employee_id) do update set fixed_salary = 30000;

  perform public.erp_generate_payroll_period(extract(year from current_date)::int, extract(month from current_date)::int);
  reset role;

  select id into v_period_id from public.erp_payroll_periods
   where period_year = extract(year from current_date)::int and period_month = extract(month from current_date)::int;
  select id, working_days, net_salary into v_record_id, v_days, v_net_before
    from public.erp_payroll_records where payroll_period_id = v_period_id and employee_id = pg_temp.id_of('mr1');

  -- mr1 has exactly one PRESENT day in this calendar month within this test
  -- run (today), so the prorated fixed salary is fixed_salary/days_in_month * 1.
  assert v_net_before = round(30000::numeric / v_days, 2),
    format('Prorated net salary before incentives: expected %s, got %s', round(30000::numeric / v_days, 2), v_net_before);

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);
  perform public.erp_add_payroll_item(v_record_id, 'INCENTIVE', 'Sales incentive', 5000);
  reset role;

  select net_salary into v_net_after from public.erp_payroll_records where id = v_record_id;
  assert v_net_after = v_net_before + 5000,
    format('An incentive must add straight to net salary without touching the fixed salary: expected %s, got %s', v_net_before + 5000, v_net_after);

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);
  perform public.erp_finalize_payroll(v_period_id);

  -- A finalized payroll must refuse further items.
  begin
    perform public.erp_add_payroll_item(v_record_id, 'DEDUCTION', 'Late fine', 100);
  exception when others then
    v_failed := true;
  end;
  reset role;
  assert v_failed, 'A finalized payroll must reject new incentive/deduction items until reopened';

  select status into v_status from public.erp_payroll_periods where id = v_period_id;
  assert v_status = 'FINALIZED', format('Expected FINALIZED, got %s', v_status);

  -- Reopening requires a reason.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);
  v_failed := false;
  begin
    perform public.erp_reopen_payroll(v_period_id, '');
  exception when others then
    v_failed := true;
  end;
  assert v_failed, 'Reopening a finalized payroll without a reason must be rejected';

  perform public.erp_reopen_payroll(v_period_id, 'Recording a late incentive');
  perform public.erp_finalize_payroll(v_period_id);
  perform public.erp_mark_payroll_paid(v_period_id);
  reset role;

  select status into v_status from public.erp_payroll_periods where id = v_period_id;
  assert v_status = 'PAID', format('Expected PAID, got %s', v_status);

  -- Historical snapshot: a later salary change must not rewrite this payslip.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);
  update public.erp_employee_salary set fixed_salary = 99999 where employee_id = pg_temp.id_of('mr1');

  v_failed := false;
  begin
    perform public.erp_generate_payroll_period(extract(year from current_date)::int, extract(month from current_date)::int);
  exception when others then
    v_failed := true;
  end;
  reset role;
  assert v_failed, 'Regenerating a PAID payroll period must be refused, not silently overwritten';

  select fixed_salary into v_fixed_snap from public.erp_payroll_records where id = v_record_id;
  assert v_fixed_snap = 30000,
    format('A finalized/paid payslip must keep the salary that was in effect when it was calculated, got %s', v_fixed_snap);
end $$;

-- ── Expenses: submit, no self-approval, RLS scoping, admin sees all ──
do $$
declare
  v_expense uuid;
  v_failed  boolean := false;
  v_status  public.erp_expense_status;
  v_seen_by_admin int;
  v_seen_by_mr1   int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr2'), 'role', 'authenticated')::text, true);

  insert into public.erp_expenses (expense_date, category, employee_id, amount, description, payment_mode)
  values (current_date, 'TRAVEL', pg_temp.id_of('mr2'), 850, 'Auto fare to distributor visit', 'CASH')
  returning id into v_expense;

  begin
    perform public.erp_review_expense(v_expense, 'APPROVED', null);
  exception when others then
    v_failed := true;
  end;
  reset role;
  assert v_failed, 'An employee must not be able to approve their own expense';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_mr1'), 'role', 'authenticated')::text, true);
  select count(*) into v_seen_by_mr1 from public.erp_expenses where id = v_expense;
  reset role;
  assert v_seen_by_mr1 = 0, 'An employee must not see another employee''s expense';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);
  select count(*) into v_seen_by_admin from public.erp_expenses where id = v_expense;
  perform public.erp_review_expense(v_expense, 'APPROVED', 'Reasonable, approved');
  reset role;

  assert v_seen_by_admin = 1, 'An admin must see every employee''s expenses';

  select status into v_status from public.erp_expenses where id = v_expense;
  assert v_status = 'APPROVED', format('Expected APPROVED, got %s', v_status);
end $$;

-- ============================================================================
-- 11. PRICING ENGINE — MARGINS, NEGOTIATED PRICING & SCHEMES
--     (Master pricing-engine spec: default/negotiated/scheme priority,
--     PTR-basis distributor margin, historical immutability, RBAC, overlap
--     prevention.)
-- ============================================================================

-- Fixtures: a dedicated priced product (the shared 'product' fixture was
-- created before this engine existed and has zero retailer/distributor
-- price, which is not a useful base for margin arithmetic), its own batch,
-- a second product to prove negotiated pricing doesn't leak across
-- products, and a second chemist to prove it doesn't leak across customers.
create temporary table t_pricing_ids (label text primary key, id uuid) on commit drop;
grant select on t_pricing_ids to authenticated;

do $$
declare
  v_product1 uuid; v_product2 uuid; v_batch1 uuid;
  v_chemist2 uuid;
begin
  insert into public.erp_products (product_name, generic_name, unit, mrp, purchase_rate,
                                   sale_rate, gst_rate, min_stock_level, created_by)
  values ('Pricetest 500', 'Pricetestol', 'BOX', 500, 200, 400, 12, 10, pg_temp.id_of('admin'))
  returning id into v_product1;

  insert into public.erp_products (product_name, generic_name, unit, mrp, purchase_rate,
                                   sale_rate, gst_rate, min_stock_level, created_by)
  values ('Pricetest 200', 'Pricetestol Two', 'BOX', 200, 80, 160, 12, 10, pg_temp.id_of('admin'))
  returning id into v_product2;

  insert into public.erp_product_batches (product_id, batch_number, expiry_date,
                                          mrp, purchase_rate, sale_rate, created_by)
  values (v_product1, 'PRICE-B1', current_date + 400, 500, 200, 400, pg_temp.id_of('admin'))
  returning id into v_batch1;

  insert into public.erp_inventory_transactions
    (product_id, batch_id, transaction_type, reference_type, quantity, unit_rate,
     transaction_date, remarks, created_by)
  values (v_product1, v_batch1, 'OPENING', 'OPENING', 1000, 200, current_date,
          'Pricing-test opening stock', pg_temp.id_of('admin'));

  insert into public.erp_chemists (chemist_name, owner_name, city, created_by)
  values ('Test Medical Store Two', 'Test Owner Two', 'Indore', pg_temp.id_of('admin'))
  returning id into v_chemist2;

  -- Default rules, exactly what erp_set_product_default_price()/saveProduct()
  -- would create: chemist margin off MRP, distributor margin off PTR (not
  -- MRP — this is the bug the pricing-engine migration fixed).
  insert into public.erp_pricing_rules (product_id, customer_type, calculation_basis, calculation_method, percentage, status, version, created_by)
  values (v_product1, 'CHEMIST',     'MRP', 'MARGIN', 20, 'ACTIVE', 1, pg_temp.id_of('admin')),
         (v_product1, 'DISTRIBUTOR', 'PTR', 'MARGIN', 10, 'ACTIVE', 1, pg_temp.id_of('admin')),
         (v_product1, 'DOCTOR',      'MRP', 'MARGIN', 15, 'ACTIVE', 1, pg_temp.id_of('admin')),
         (v_product2, 'CHEMIST',     'MRP', 'MARGIN', 25, 'ACTIVE', 1, pg_temp.id_of('admin'));

  insert into t_pricing_ids values
    ('product1', v_product1), ('product2', v_product2), ('batch1', v_batch1), ('chemist2', v_chemist2);
end $$;

create or replace function pg_temp.pid_of(p_label text) returns uuid
language sql stable as $$ select id from t_pricing_ids where label = p_label $$;

-- Test 1: default retailer (chemist) margin is a percentage of MRP.
-- 500 * (1 - 20/100) = 400.
do $$
declare v_price jsonb;
begin
  v_price := public.erp_resolve_selling_price(
    pg_temp.pid_of('product1'), 'CHEMIST', null, pg_temp.id_of('chemist'), null, current_date);

  assert (v_price->>'source') = 'DEFAULT', format('Expected DEFAULT, got %s', v_price->>'source');
  assert (v_price->>'selling_rate')::numeric = 400,
    format('Default chemist rate should be 400 (20%% off MRP 500), got %s', v_price->>'selling_rate');
end $$;

-- Test 2 (CRITICAL): default distributor margin is a percentage of PTR
-- (the retailer default price, 400), NOT of MRP. 400 * (1 - 10/100) = 360.
-- If this were wrongly computed off MRP it would read 450, not 360.
do $$
declare v_price jsonb;
begin
  v_price := public.erp_resolve_selling_price(
    pg_temp.pid_of('product1'), 'DISTRIBUTOR', pg_temp.id_of('distributor'), null, null, current_date);

  assert (v_price->>'selling_rate')::numeric = 360,
    format('Distributor rate should be 360 (10%% off PTR 400), got %s', v_price->>'selling_rate');
  assert (v_price->>'selling_rate')::numeric <> 450,
    'Distributor margin must never be computed as a percentage of MRP';
end $$;

-- Test 3: a negotiated rule overrides the default for its own customer only.
-- 500 * (1 - 30/100) = 350 for the negotiated chemist; the second chemist,
-- with no negotiated rule of their own, still gets the 400 default.
do $$
declare v_price jsonb;
begin
  insert into public.erp_pricing_rules
    (product_id, chemist_id, customer_type, calculation_basis, calculation_method, percentage, status, version, created_by)
  values (pg_temp.pid_of('product1'), pg_temp.id_of('chemist'), 'CHEMIST', 'MRP', 'MARGIN', 30, 'ACTIVE', 1, pg_temp.id_of('admin'));

  v_price := public.erp_resolve_selling_price(
    pg_temp.pid_of('product1'), 'CHEMIST', null, pg_temp.id_of('chemist'), null, current_date);
  assert (v_price->>'source') = 'NEGOTIATED', format('Expected NEGOTIATED, got %s', v_price->>'source');
  assert (v_price->>'selling_rate')::numeric = 350,
    format('Negotiated chemist rate should be 350, got %s', v_price->>'selling_rate');

  v_price := public.erp_resolve_selling_price(
    pg_temp.pid_of('product1'), 'CHEMIST', null, pg_temp.pid_of('chemist2'), null, current_date);
  assert (v_price->>'source') = 'DEFAULT', 'A different chemist with no negotiated rule must still get the default';
  assert (v_price->>'selling_rate')::numeric = 400,
    format('The untouched chemist should still see 400, got %s', v_price->>'selling_rate');
end $$;

-- Test 4: a negotiated rule is scoped to its own product too — the same
-- chemist's negotiated 350 on product1 must not leak onto product2.
do $$
declare v_price jsonb;
begin
  v_price := public.erp_resolve_selling_price(
    pg_temp.pid_of('product2'), 'CHEMIST', null, pg_temp.id_of('chemist'), null, current_date);
  assert (v_price->>'source') = 'DEFAULT',
    'A negotiated rule on one product must not apply to a different product for the same customer';
  assert (v_price->>'selling_rate')::numeric = 150,
    format('product2''s own default (25%% off MRP 200 = 150) should apply, got %s', v_price->>'selling_rate');
end $$;

-- Test 5: an expired negotiated rule must not apply — falls back to default.
do $$
declare v_price jsonb;
begin
  insert into public.erp_pricing_rules
    (product_id, doctor_id, customer_type, calculation_basis, calculation_method, percentage,
     effective_from, effective_to, status, version, created_by)
  values (pg_temp.pid_of('product1'), pg_temp.id_of('doctor'), 'DOCTOR', 'MRP', 'MARGIN', 40,
          current_date - 60, current_date - 30, 'ACTIVE', 1, pg_temp.id_of('admin'));

  v_price := public.erp_resolve_selling_price(
    pg_temp.pid_of('product1'), 'DOCTOR', null, null, pg_temp.id_of('doctor'), current_date);
  assert (v_price->>'source') = 'DEFAULT', 'An expired negotiated rule must not be selected';
  assert (v_price->>'selling_rate')::numeric = 425,
    format('Should fall back to the 15%% default doctor rate (425), got %s', v_price->>'selling_rate');
end $$;

-- Test 6: a future-dated negotiated rule must not apply early.
do $$
declare v_price jsonb;
begin
  insert into public.erp_pricing_rules
    (product_id, doctor_id, customer_type, calculation_basis, calculation_method, percentage,
     effective_from, status, version, created_by)
  values (pg_temp.pid_of('product1'), pg_temp.id_of('doctor'), 'DOCTOR', 'MRP', 'MARGIN', 5,
          current_date + 30, 'ACTIVE', 1, pg_temp.id_of('admin'));

  v_price := public.erp_resolve_selling_price(
    pg_temp.pid_of('product1'), 'DOCTOR', null, null, pg_temp.id_of('doctor'), current_date);
  assert (v_price->>'source') = 'DEFAULT', 'A not-yet-effective negotiated rule must not apply today';
  assert (v_price->>'selling_rate')::numeric = 425,
    format('Should still be the 15%% default doctor rate (425), got %s', v_price->>'selling_rate');
end $$;

-- Test 7 & 8: historical invoice immutability — raising an invoice snapshots
-- the rate, margin and rule/version actually applied; a later change to the
-- default margin, or to the product's GST rate, must never rewrite it.
do $$
declare
  v_result   jsonb;
  v_invoice  uuid;
  v_item     record;
  v_rule_id  uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);

  v_result := public.erp_save_sales_invoice(jsonb_build_object(
    'chemist_id',   pg_temp.pid_of('chemist2'),
    'invoice_date', current_date,
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', pg_temp.pid_of('product1'),
      'batch_id',   pg_temp.pid_of('batch1'),
      'quantity',   10,
      'gst_rate',   12
    ))
  ));
  reset role;

  v_invoice := (v_result->>'invoice_id')::uuid;
  select * into v_item from public.erp_sales_invoice_items where sales_invoice_id = v_invoice;

  assert v_item.sale_rate = 400, format('Chemist2 should be billed the 400 default, got %s', v_item.sale_rate);
  assert v_item.margin_amount = 100, format('Margin should be MRP 500 - rate 400 = 100, got %s', v_item.margin_amount);
  assert v_item.gst_rate = 12, format('GST on the line should be 12, got %s', v_item.gst_rate);
  v_rule_id := v_item.pricing_rule_id;
  assert v_rule_id is not null, 'The invoice line must snapshot which pricing rule produced its rate';

  -- Change the default margin AND the product's GST rate after the fact.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);
  perform public.erp_set_product_default_price(pg_temp.pid_of('product1'), 'CHEMIST', 'MRP', 'MARGIN', 50);
  update public.erp_products set gst_rate = 18 where id = pg_temp.pid_of('product1');
  reset role;

  select * into v_item from public.erp_sales_invoice_items where sales_invoice_id = v_invoice;
  assert v_item.sale_rate = 400, 'A historical invoice line must keep its original rate after the default margin changes';
  assert v_item.margin_amount = 100, 'A historical invoice line must keep its original margin after the default margin changes';
  assert v_item.gst_rate = 12, 'A historical invoice line must keep its original GST%% after the product''s GST rate changes';
  assert v_item.pricing_rule_id = v_rule_id, 'A historical invoice line must keep pointing at the exact rule version it was billed under';

  assert (select status from public.erp_pricing_rules where id = v_rule_id) = 'INACTIVE',
    'The superseded default rule must be retired (INACTIVE), never deleted — the old invoice still points to it';
end $$;

-- Test 9: Buy-X-Get-Y free quantity — floor(paid/buy) * free, at several
-- paid-quantity levels, company-wide for CHEMIST on product2.
do $$
declare v_free jsonb;
begin
  insert into public.erp_schemes
    (scheme_name, scheme_type, product_id, customer_type, buy_quantity, free_quantity,
     effective_from, status, version, created_by)
  values ('Buy 10 Get 2 — product2 chemists', 'FREE_QUANTITY', pg_temp.pid_of('product2'), 'CHEMIST',
          10, 2, current_date, 'ACTIVE', 1, pg_temp.id_of('admin'));

  v_free := public.erp_resolve_free_quantity(pg_temp.pid_of('product2'), 'CHEMIST', null, pg_temp.id_of('chemist'), null, 9, current_date);
  assert (v_free->>'free_quantity')::integer = 0, format('9 paid should earn 0 free, got %s', v_free->>'free_quantity');

  v_free := public.erp_resolve_free_quantity(pg_temp.pid_of('product2'), 'CHEMIST', null, pg_temp.id_of('chemist'), null, 20, current_date);
  assert (v_free->>'free_quantity')::integer = 4, format('20 paid should earn floor(20/10)*2=4 free, got %s', v_free->>'free_quantity');

  v_free := public.erp_resolve_free_quantity(pg_temp.pid_of('product2'), 'CHEMIST', null, pg_temp.id_of('chemist'), null, 25, current_date);
  assert (v_free->>'free_quantity')::integer = 4, format('25 paid should earn floor(25/10)*2=4 free, got %s', v_free->>'free_quantity');
end $$;

-- Test 10: negotiated margin and a free-quantity scheme are independent
-- axes and both apply together on the same invoice line (never stacked
-- against each other, but never mutually exclusive either).
do $$
declare
  v_result  jsonb;
  v_invoice uuid;
  v_item    record;
  v_batch2  uuid;
begin
  -- Give chemist2 their own negotiated rate on product2 (200 * (1-10/100) = 180)...
  insert into public.erp_pricing_rules
    (product_id, chemist_id, customer_type, calculation_basis, calculation_method, percentage, status, version, created_by)
  values (pg_temp.pid_of('product2'), pg_temp.pid_of('chemist2'), 'CHEMIST', 'MRP', 'MARGIN', 10, 'ACTIVE', 1, pg_temp.id_of('admin'));

  -- ...on top of some stock to sell it from.
  insert into public.erp_product_batches (product_id, batch_number, expiry_date, mrp, purchase_rate, sale_rate, created_by)
  values (pg_temp.pid_of('product2'), 'PRICE-B2', current_date + 400, 200, 80, 160, pg_temp.id_of('admin'))
  returning id into v_batch2;

  insert into public.erp_inventory_transactions
    (product_id, batch_id, transaction_type, reference_type, quantity, unit_rate, transaction_date, remarks, created_by)
  values (pg_temp.pid_of('product2'), v_batch2, 'OPENING', 'OPENING', 100, 80, current_date, 'product2 stock', pg_temp.id_of('admin'));

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);

  v_result := public.erp_save_sales_invoice(jsonb_build_object(
    'chemist_id',   pg_temp.pid_of('chemist2'),
    'invoice_date', current_date,
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', pg_temp.pid_of('product2'),
      'batch_id',   v_batch2,
      'quantity',   20,
      'gst_rate',   12
    ))
  ));
  reset role;

  v_invoice := (v_result->>'invoice_id')::uuid;
  select * into v_item from public.erp_sales_invoice_items where sales_invoice_id = v_invoice;

  assert v_item.sale_rate = 180, format('Negotiated rate (10%% off MRP 200) should still apply, got %s', v_item.sale_rate);
  assert v_item.quantity = 20, 'Paid quantity must stay exactly what was ordered';
  assert v_item.free_quantity = 4, format('The Buy 10 Get 2 scheme should still add 4 free units on top, got %s', v_item.free_quantity);
  assert v_item.pricing_rule_id is not null and v_item.margin_scheme_id is null,
    'This line is priced by a negotiated RULE, not a margin scheme — margin_scheme_id must stay null';
  assert v_item.free_scheme_id is not null, 'The free units must be traced back to the scheme that granted them';
end $$;

-- Test 11: stock validation must count paid + free quantity together —
-- an oversell hiding behind free units must still be refused.
do $$
declare v_batch uuid; v_failed boolean := false; v_before integer;
begin
  select id into v_batch from public.erp_product_batches where batch_number = 'PRICE-B2';
  select current_quantity into v_before from public.erp_product_batches where id = v_batch;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);

  begin
    -- Ask for the entire remaining stock as the PAID quantity — the same
    -- Buy 10 Get 2 scheme still adds free units on top, which must push the
    -- true requirement (paid + free) past what the batch actually holds.
    perform public.erp_save_sales_invoice(jsonb_build_object(
      'chemist_id',   pg_temp.pid_of('chemist2'),
      'invoice_date', current_date,
      'items', jsonb_build_array(jsonb_build_object(
        'product_id', pg_temp.pid_of('product2'),
        'batch_id',   v_batch,
        'quantity',   v_before,
        'gst_rate',   12
      ))
    ));
  exception when others then
    v_failed := true;
  end;
  reset role;

  assert v_failed, 'Selling the entire remaining stock as "paid" while a scheme also grants free units on top must be refused';
  assert (select current_quantity from public.erp_product_batches where id = v_batch) = v_before,
    'A refused oversell must leave stock exactly where it was';
end $$;

-- Test 12: RBAC — an accountant gets a rupee figure to bill, never the
-- margin percentage, pricing_rule_id, scheme name or landing cost. This
-- must hold at the function layer itself, not merely in what the UI shows.
do $$
declare
  v_auth_acct uuid; v_acct uuid;
  v_explain   jsonb;
  v_direct    integer;
begin
  select id into v_acct from public.erp_users where email = 'test-pricing-acct@leomed.test';
  if v_acct is null then
    v_auth_acct := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', v_auth_acct, 'authenticated', 'authenticated',
            'test-pricing-acct@leomed.test', '', now(), now(), now());
    insert into public.erp_users (auth_user_id, name, email, role)
    values (v_auth_acct, 'Test Pricing Accountant', 'test-pricing-acct@leomed.test', 'ACCOUNTANT')
    returning id into v_acct;
  else
    select auth_user_id into v_auth_acct from public.erp_users where id = v_acct;
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_auth_acct, 'role', 'authenticated')::text, true);

  v_explain := public.erp_explain_price(
    pg_temp.pid_of('product1'), 'CHEMIST', null, pg_temp.pid_of('chemist2'), null, current_date, 0);

  select count(*) into v_direct from public.erp_pricing_rules where product_id = pg_temp.pid_of('product1');
  reset role;

  assert v_explain ? 'selling_rate' and v_explain ? 'mrp' and v_explain ? 'gst_rate',
    'An accountant must still get the rupee figures needed to bill';
  assert not (v_explain ? 'percentage'),        'An accountant must never see the margin percentage';
  assert not (v_explain ? 'pricing_rule_id'),   'An accountant must never see which pricing rule was used';
  assert not (v_explain ? 'calculation_basis'), 'An accountant must never see the calculation basis';
  assert not (v_explain ? 'scheme_name'),       'An accountant must never see the scheme name';
  assert not (v_explain ? 'source'),            'An accountant must never see whether it was DEFAULT/NEGOTIATED/SCHEME';

  assert v_direct = 0,
    'An accountant querying erp_pricing_rules directly must see nothing — RLS enforces this at the table, not just the resolver';

  -- The same question from an admin gets the full explanation.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);
  v_explain := public.erp_explain_price(
    pg_temp.pid_of('product1'), 'CHEMIST', null, pg_temp.pid_of('chemist2'), null, current_date, 0);
  reset role;

  assert v_explain ? 'percentage' and v_explain ? 'pricing_rule_id' and v_explain ? 'source',
    'An administrator must see the full pricing explanation';
end $$;

-- Test 13: a client-submitted sale_rate is completely ignored — the server
-- always recomputes and bills the resolved rate, never what was posted.
do $$
declare v_result jsonb; v_invoice uuid; v_rate numeric;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id_of('auth_admin'), 'role', 'authenticated')::text, true);

  v_result := public.erp_save_sales_invoice(jsonb_build_object(
    'chemist_id',   pg_temp.pid_of('chemist2'),
    'invoice_date', current_date,
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', pg_temp.pid_of('product1'),
      'batch_id',   pg_temp.pid_of('batch1'),
      'quantity',   1,
      'sale_rate',  1,
      'gst_rate',   12
    ))
  ));
  reset role;

  v_invoice := (v_result->>'invoice_id')::uuid;
  select sale_rate into v_rate from public.erp_sales_invoice_items where sales_invoice_id = v_invoice;
  -- product1's default chemist margin was changed to 50% in tests 7/8
  -- (500 * (1 - 50/100) = 250) — that change is real and expected to stick;
  -- what this test proves is that the forged "1" never reaches the invoice.
  assert v_rate = 250, format('A forged sale_rate of 1 must be ignored and the resolved 250 billed instead, got %s', v_rate);
end $$;

-- Test 14: overlapping ACTIVE rules/schemes for the same scope are refused,
-- not silently resolved by picking one — the admin must retire the old one
-- first (spec — "never silently choose one").
do $$
declare v_failed boolean := false;
begin
  begin
    insert into public.erp_pricing_rules (product_id, customer_type, calculation_basis, calculation_method, percentage, status, version, created_by)
    values (pg_temp.pid_of('product1'), 'CHEMIST', 'MRP', 'MARGIN', 99, 'ACTIVE', 2, pg_temp.id_of('admin'));
  exception when others then
    v_failed := true;
  end;
  assert v_failed, 'A second ACTIVE default chemist rule for the same product must be refused while one is already active';

  v_failed := false;
  begin
    insert into public.erp_schemes (scheme_name, scheme_type, product_id, customer_type, calculation_basis, calculation_method, percentage, effective_from, status, version, created_by)
    values ('Conflicting margin scheme', 'PERCENTAGE_MARGIN', pg_temp.pid_of('product1'), 'CHEMIST', 'MRP', 'MARGIN', 5, current_date, 'ACTIVE', 1, pg_temp.id_of('admin'));

    insert into public.erp_schemes (scheme_name, scheme_type, product_id, customer_type, calculation_basis, calculation_method, percentage, effective_from, status, version, created_by)
    values ('Second conflicting margin scheme', 'PERCENTAGE_MARGIN', pg_temp.pid_of('product1'), 'CHEMIST', 'MRP', 'MARGIN', 8, current_date, 'ACTIVE', 1, pg_temp.id_of('admin'));
  exception when others then
    v_failed := true;
  end;
  assert v_failed, 'Two company-wide ACTIVE percentage-margin schemes for the same product and customer type, with overlapping dates, must be refused';
end $$;

-- Test 15: only an administrator may set default prices or manage schemes —
-- an accountant is refused even though they can raise invoices.
do $$
declare v_acct uuid; v_auth_acct uuid; v_failed boolean := false;
begin
  select id, auth_user_id into v_acct, v_auth_acct from public.erp_users where email = 'test-pricing-acct@leomed.test';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_auth_acct, 'role', 'authenticated')::text, true);

  begin
    perform public.erp_set_product_default_price(pg_temp.pid_of('product1'), 'CHEMIST', 'MRP', 'MARGIN', 1);
  exception when others then
    v_failed := true;
  end;
  assert v_failed, 'An accountant must not be able to change a product''s default pricing rule';

  v_failed := false;
  begin
    perform public.erp_save_scheme(jsonb_build_object(
      'scheme_name', 'Accountant scheme', 'scheme_type', 'FREE_QUANTITY',
      'product_id', pg_temp.pid_of('product1'), 'buy_quantity', 1, 'free_quantity', 1,
      'effective_from', current_date, 'status', 'ACTIVE'
    ));
  exception when others then
    v_failed := true;
  end;
  reset role;
  assert v_failed, 'An accountant must not be able to create or activate a scheme';
end $$;

-- ============================================================================

do $$ begin raise notice 'All ERP business-rule tests passed.'; end $$;

rollback;
