-- ============================================================================
-- CLEAR TEST DATA — staff (except admin), doctors, chemists, sales invoices,
-- purchase invoices, and everything that depends on them.
--
-- RUN THIS IN THE SUPABASE SQL EDITOR. IT IS IRREVERSIBLE.
-- Take a backup first (Supabase Dashboard -> Database -> Backups) if you
-- have not already — this permanently deletes production rows.
--
-- What this does, and why it's not just 5 DELETE statements:
--
--   1. erp_doctor_visits.mr_id/doctor_id, erp_chemist_visits.mr_id/
--      chemist_id, erp_field_orders.mr_id/doctor_id/chemist_id, and
--      erp_followups.mr_id are all ON DELETE RESTRICT — Postgres refuses to
--      delete a staff member, doctor or chemist while any of these still
--      point at them. So visits/orders/follow-ups are cleared FIRST.
--
--   2. erp_inventory_transactions (the stock ledger) is deliberately
--      APPEND-ONLY — a trigger blocks any UPDATE or DELETE on it outright
--      ("post a reversing transaction instead of editing history"). So a
--      sales/purchase invoice can't just be deleted out from under its
--      stock movements; this calls the existing, purpose-built
--      erp_delete_sales_invoice()/erp_delete_purchase_invoice() functions,
--      which post a correcting SALE_RETURN/PURCHASE_RETURN entry (so
--      erp_product_batches.current_quantity stays mathematically correct)
--      before removing the invoice. Net effect: product stock ends up
--      exactly where it was before the test invoices, but the ledger
--      itself will show the original entries AND their reversals — it can
--      never be emptied to zero rows, that's the schema's own design, not
--      a limitation of this script. Both functions also refuse to run if
--      a payment/receipt is still recorded against the invoice, so those
--      are removed first.
--
--   3. Both invoice-deletion functions check erp_is_admin() internally
--      (auth.uid()-based, independent of RLS), which only resolves to true
--      inside an authenticated session — never true for this script's own
--      plain SQL-editor connection. So this sets request.jwt.claims to an
--      actual admin's id for just that part, the same trick
--      erp_role_capability_matrix.sql's fixtures already use.
--
--   4. Deletes staff via auth.users, not erp_users directly — erp_users.
--      auth_user_id -> auth.users is ON DELETE CASCADE, so removing the
--      login removes the staff record (and, via erp_users' own cascades,
--      their attendance/leave/payroll/targets/etc.) in one step, rather
--      than leaving an orphaned login that can still authenticate but has
--      no staff profile.
--
-- What this deliberately does NOT touch: products, distributors,
-- suppliers, territories/areas (their mr_id just goes null — reassign
-- once you have real MRs again), offer letters (reports_to/
-- converted_employee_id just go null), and erp_audit_logs (the point of
-- an audit log is that it survives the thing it recorded).
-- ============================================================================

begin;

do $$
declare
  v_admin_auth_id uuid;
  v_count         integer;
  v_invoice       record;
begin
  select auth_user_id into v_admin_auth_id
    from public.erp_users
   where role = 'ADMIN' and active
   order by created_at
   limit 1;

  if v_admin_auth_id is null then
    raise exception 'No active ADMIN found in erp_users — refusing to run (the invoice-deletion functions require one).';
  end if;

  -- ─── 1. Field activity: orders, visits, follow-ups ────────────────────────
  -- (erp_field_order_items / erp_doctor_visit_products cascade automatically)

  delete from public.erp_field_orders;
  get diagnostics v_count = row_count;
  raise notice 'Deleted % field order(s)', v_count;

  delete from public.erp_doctor_visits;
  get diagnostics v_count = row_count;
  raise notice 'Deleted % doctor visit(s)', v_count;

  delete from public.erp_chemist_visits;
  get diagnostics v_count = row_count;
  raise notice 'Deleted % chemist visit(s)', v_count;

  delete from public.erp_followups;
  get diagnostics v_count = row_count;
  raise notice 'Deleted % follow-up(s)', v_count;

  -- ─── 2. Purchase and sales invoices, properly reversed through the ledger ─

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_auth_id, 'role', 'authenticated')::text, true);

  delete from public.erp_purchase_payments;
  get diagnostics v_count = row_count;
  raise notice 'Deleted % purchase payment(s)', v_count;

  delete from public.erp_sales_receipts;
  get diagnostics v_count = row_count;
  raise notice 'Deleted % sales receipt(s)', v_count;

  v_count := 0;
  for v_invoice in select id from public.erp_purchase_invoices loop
    perform public.erp_delete_purchase_invoice(v_invoice.id);
    v_count := v_count + 1;
  end loop;
  raise notice 'Deleted % purchase invoice(s)', v_count;

  v_count := 0;
  for v_invoice in select id from public.erp_sales_invoices loop
    perform public.erp_delete_sales_invoice(v_invoice.id);
    v_count := v_count + 1;
  end loop;
  raise notice 'Deleted % sales invoice(s)', v_count;

  perform set_config('request.jwt.claims', 'null', true);

  -- ─── 3. Doctors and chemists (now nothing RESTRICT-references them) ──────
  -- erp_pricing_rules/erp_scheme_customers rows scoped to these doctors/
  -- chemists cascade away with them — those were doctor/chemist-specific
  -- overrides, not general product pricing.

  delete from public.erp_doctors;
  get diagnostics v_count = row_count;
  raise notice 'Deleted % doctor(s)', v_count;

  delete from public.erp_chemists;
  get diagnostics v_count = row_count;
  raise notice 'Deleted % chemist(s)', v_count;

  -- ─── 4. Staff, except admin — via auth.users so the login goes too ───────
  -- Cascades through erp_users' own FKs: attendance, leave (requests/
  -- balances/accrual state), payroll (records/salary), expenses, targets,
  -- incentive tiers/settings, travel allowance/days, mr_attendance_targets.
  -- Everywhere else (created_by/updated_by audit columns, offer_letters.
  -- reports_to/converted_employee_id, territories/areas.mr_id,
  -- erp_audit_logs.user_id) just goes null, per the schema's own design.

  delete from auth.users
   where id in (select auth_user_id from public.erp_users where role <> 'ADMIN');
  get diagnostics v_count = row_count;
  raise notice 'Deleted % non-admin staff login(s) (and their erp_users row, via cascade)', v_count;

end $$;

commit;

-- ─── Sanity check — run separately afterward if you want to confirm stock
-- wasn't left inconsistent by the invoice reversals above (should return
-- zero rows; see erp_reconcile_batch_quantities()'s own definition for
-- what a mismatch here would mean).
-- select * from public.erp_reconcile_batch_quantities();
