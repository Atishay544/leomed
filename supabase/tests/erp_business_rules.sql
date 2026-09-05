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

do $$ begin raise notice 'All ERP business-rule tests passed.'; end $$;

rollback;
