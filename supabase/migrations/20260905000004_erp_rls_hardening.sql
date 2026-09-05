-- ============================================================================
-- LEOMED PHARMA ERP — 11 · RLS & GRANT HARDENING (pre-PR review findings)
--
-- The review that preceded this migration found a systemic gap: several
-- operational tables were given a BLANKET `update` grant (every column) to
-- `authenticated`, and their RLS UPDATE policy either had no `with check` at
-- all, or a `with check` that only re-verified row ownership (`mr_id = me`)
-- without restricting which COLUMNS an owner may change.
--
-- Postgres RLS cannot compare OLD vs NEW values inside a policy expression —
-- only a trigger can do that — so "you may edit your own row, but not its
-- status/owner/identity columns" cannot be expressed as a `with check` alone.
-- The fix used throughout this codebase for exactly this shape of problem
-- (see erp_product_batches.current_quantity, the invoice money columns, and
-- erp_users' role/active/mr_code) is a COLUMN-SCOPED GRANT: give
-- `authenticated` UPDATE on only the columns an owner may legitimately touch
-- directly, and route anything else through a SECURITY DEFINER function that
-- performs its own check. This migration applies that same fix everywhere it
-- was missing.
--
-- Concretely, before this migration, an MR who owns a field order (within the
-- 24h edit window) could PATCH `erp_field_orders` directly via PostgREST and
-- set `status` to FULFILLED themselves — the one thing spec §3 reserves for
-- ADMIN/MANAGER — because the UPDATE policy had no `with check` at all. The
-- same gap let `estimated_value` (meant to be trigger-derived from line items
-- only) be overwritten directly, and let ownership columns (`mr_id`,
-- `doctor_id`, `chemist_id`) be reassigned. Equivalent gaps existed on doctor
-- and chemist visits, visit products, field order items, and follow-ups.
-- ============================================================================

-- ─── Field orders ────────────────────────────────────────────────────────────
-- An owning MR may correct their own paperwork (the book number, the date, a
-- note) within the edit window. They may not touch status, the derived value,
-- or who/what the order is about — those require deleting and recreating, or
-- (for status) the dedicated function below.

revoke update on public.erp_field_orders from authenticated;
grant update (order_book_number, order_date, remarks, updated_by)
  on public.erp_field_orders to authenticated;

drop policy if exists erp_field_orders_update on public.erp_field_orders;
create policy erp_field_orders_update on public.erp_field_orders
  for update to authenticated
  using (
    public.erp_can_read_all_field()
    or (mr_id = public.erp_current_user_id() and public.erp_within_edit_window(created_at))
  )
  with check (
    public.erp_can_read_all_field()
    or (mr_id = public.erp_current_user_id() and public.erp_within_edit_window(created_at))
  );

-- erp_set_field_order_status() is now the ONLY path that can change `status`,
-- because the column above is no longer in the direct grant. It must
-- therefore perform its own authorization — SECURITY INVOKER relying on RLS
-- was exactly the gap this migration closes.
create or replace function public.erp_set_field_order_status(
  p_order_id uuid,
  p_status   public.erp_field_order_status,
  p_remarks  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.erp_can_read_all_field() then
    raise exception 'Only an administrator or manager may change a field order''s status'
      using errcode = 'insufficient_privilege';
  end if;

  update public.erp_field_orders
     set status     = p_status,
         remarks    = coalesce(nullif(trim(coalesce(p_remarks, '')), ''), remarks),
         updated_by = public.erp_current_user_id()
   where id = p_order_id;

  if not found then
    raise exception 'Field order not found';
  end if;
end;
$$;

-- ─── Field order items ───────────────────────────────────────────────────────
-- A line's quantity, rate or discount may be corrected; which order or which
-- product it belongs to may not be changed after the fact (delete and
-- re-add instead — the existing delete policy already governs that).

revoke update on public.erp_field_order_items from authenticated;
grant update (quantity, unit, unit_rate, discount_percent, remarks)
  on public.erp_field_order_items to authenticated;

drop policy if exists erp_field_order_items_update on public.erp_field_order_items;
create policy erp_field_order_items_update on public.erp_field_order_items
  for update to authenticated
  using (exists (
    select 1 from public.erp_field_orders o
     where o.id = field_order_id
       and (public.erp_is_admin()
            or (o.mr_id = public.erp_current_user_id() and public.erp_within_edit_window(o.created_at)))
  ))
  with check (exists (
    select 1 from public.erp_field_orders o
     where o.id = field_order_id
       and (public.erp_is_admin()
            or (o.mr_id = public.erp_current_user_id() and public.erp_within_edit_window(o.created_at)))
  ));

-- ─── Doctor & chemist visits ─────────────────────────────────────────────────
-- The visit's narrative (purpose, discussion, timing, follow-up) may be
-- corrected by its owner. `doctor_id`/`chemist_id` and `doctor_status` are
-- historical record — spec §2 requires doctor_status to reflect the workflow
-- at the moment the visit was filed, not something editable afterwards.

revoke update on public.erp_doctor_visits from authenticated;
grant update (
  visit_date, visit_time, purpose, discussion, remarks,
  follow_up_required, follow_up_date, latitude, longitude, updated_by
) on public.erp_doctor_visits to authenticated;

revoke update on public.erp_chemist_visits from authenticated;
grant update (
  visit_date, visit_time, purpose, discussion, remarks,
  follow_up_required, follow_up_date, latitude, longitude, updated_by
) on public.erp_chemist_visits to authenticated;

-- ─── Products discussed on a doctor visit ───────────────────────────────────
-- How a product was discussed, and the sample count, may be corrected. Which
-- visit or product the row is about may not — remove the line and add the
-- right one instead (spec §3 "no WITH CHECK at all" gap closed here).

revoke update on public.erp_doctor_visit_products from authenticated;
grant update (discussion_type, sample_quantity, remarks)
  on public.erp_doctor_visit_products to authenticated;

drop policy if exists erp_visit_products_update on public.erp_doctor_visit_products;
create policy erp_visit_products_update on public.erp_doctor_visit_products
  for update to authenticated
  using (exists (
    select 1 from public.erp_doctor_visits v
     where v.id = visit_id
       and (public.erp_is_admin()
            or (v.mr_id = public.erp_current_user_id() and public.erp_within_edit_window(v.created_at)))
  ))
  with check (exists (
    select 1 from public.erp_doctor_visits v
     where v.id = visit_id
       and (public.erp_is_admin()
            or (v.mr_id = public.erp_current_user_id() and public.erp_within_edit_window(v.created_at)))
  ));

-- ─── Follow-ups ──────────────────────────────────────────────────────────────
-- Closing or rescheduling a follow-up is the normal workflow (no edit window
-- here, unchanged). Which customer or MR it is attached to is not editable.

revoke update on public.erp_followups from authenticated;
grant update (followup_date, description, priority, status, completed_at, updated_by)
  on public.erp_followups to authenticated;

-- ─── Doctor / chemist masters ────────────────────────────────────────────────
-- An MR who created a record may correct its details within the edit window.
-- `active`, the code, and the "created from this visit" back-reference are
-- administrative and are excluded from the direct grant entirely — closing
-- the gap where a non-admin could deactivate a shared master record via a
-- direct PATCH even though the UI only ever offers that control to an admin.

revoke update on public.erp_doctors from authenticated;
grant update (
  doctor_name, specialization, qualification, phone, email, address,
  city, area, territory, clinic_name, notes, updated_by
) on public.erp_doctors to authenticated;

revoke update on public.erp_chemists from authenticated;
grant update (
  chemist_name, owner_name, phone, email, address, city, area, territory,
  gst_number, drug_license_number, notes, updated_by
) on public.erp_chemists to authenticated;

-- Deactivating a doctor or chemist is an administrative act on a shared
-- record, not a byproduct of "may create customers" — that capability lets an
-- MR add new doctors/chemists, not retire ones other reps depend on.
create or replace function public.erp_set_doctor_active(p_doctor uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may activate or deactivate a doctor'
      using errcode = 'insufficient_privilege';
  end if;

  update public.erp_doctors set active = p_active, updated_by = public.erp_current_user_id()
   where id = p_doctor;

  if not found then
    raise exception 'Doctor not found';
  end if;
end;
$$;

create or replace function public.erp_set_chemist_active(p_chemist uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may activate or deactivate a chemist'
      using errcode = 'insufficient_privilege';
  end if;

  update public.erp_chemists set active = p_active, updated_by = public.erp_current_user_id()
   where id = p_chemist;

  if not found then
    raise exception 'Chemist not found';
  end if;
end;
$$;

revoke all on function public.erp_set_doctor_active(uuid, boolean)  from public;
revoke all on function public.erp_set_chemist_active(uuid, boolean) from public;
grant execute on function public.erp_set_doctor_active(uuid, boolean)  to authenticated;
grant execute on function public.erp_set_chemist_active(uuid, boolean) to authenticated;

-- ─── Payments & receipts ─────────────────────────────────────────────────────
-- An accountant may correct the details of a payment they can see. Which
-- invoice it is against is not editable — reassigning it away from an invoice
-- silently understated that invoice's balance, because the sync trigger only
-- ever recomputed the NEW invoice, not the one the payment moved off of (see
-- the trigger fix below, kept as defence in depth even though the column is
-- no longer directly writable).

revoke update on public.erp_purchase_payments from authenticated;
grant update (payment_date, amount, payment_method, reference_number, remarks)
  on public.erp_purchase_payments to authenticated;

revoke update on public.erp_sales_receipts from authenticated;
grant update (receipt_date, amount, payment_method, reference_number, remarks)
  on public.erp_sales_receipts to authenticated;

create or replace function public.erp_sync_purchase_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.erp_purchase_invoices
     set amount_paid = (
           select coalesce(sum(amount), 0) from public.erp_purchase_payments
            where purchase_invoice_id = new.purchase_invoice_id
         )
   where id = new.purchase_invoice_id;

  -- On UPDATE, if the invoice this payment belongs to actually changed, the
  -- invoice it moved OFF also has a stale total until this recomputes it too.
  if tg_op = 'UPDATE' and old.purchase_invoice_id is distinct from new.purchase_invoice_id then
    update public.erp_purchase_invoices
       set amount_paid = (
             select coalesce(sum(amount), 0) from public.erp_purchase_payments
              where purchase_invoice_id = old.purchase_invoice_id
           )
     where id = old.purchase_invoice_id;
  end if;

  return null;
end;
$$;

create or replace function public.erp_sync_sales_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.erp_sales_invoices
     set amount_paid = (
           select coalesce(sum(amount), 0) from public.erp_sales_receipts
            where sales_invoice_id = new.sales_invoice_id
         )
   where id = new.sales_invoice_id;

  if tg_op = 'UPDATE' and old.sales_invoice_id is distinct from new.sales_invoice_id then
    update public.erp_sales_invoices
       set amount_paid = (
             select coalesce(sum(amount), 0) from public.erp_sales_receipts
              where sales_invoice_id = old.sales_invoice_id
           )
     where id = old.sales_invoice_id;
  end if;

  return null;
end;
$$;

-- The DELETE-only branch (removing a payment entirely) still needs a plain
-- recompute keyed off OLD, which the two updates above don't cover since
-- tg_op = 'DELETE' has no NEW row. Re-declared as one trigger function each
-- would duplicate branches unnecessarily, so DELETE keeps its own tiny path.
create or replace function public.erp_sync_purchase_paid_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.erp_purchase_invoices
     set amount_paid = (
           select coalesce(sum(amount), 0) from public.erp_purchase_payments
            where purchase_invoice_id = old.purchase_invoice_id
         )
   where id = old.purchase_invoice_id;
  return null;
end;
$$;

create or replace function public.erp_sync_sales_received_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.erp_sales_invoices
     set amount_paid = (
           select coalesce(sum(amount), 0) from public.erp_sales_receipts
            where sales_invoice_id = old.sales_invoice_id
         )
   where id = old.sales_invoice_id;
  return null;
end;
$$;

drop trigger if exists erp_purchase_payments_sync on public.erp_purchase_payments;
create trigger erp_purchase_payments_sync
  after insert or update on public.erp_purchase_payments
  for each row execute function public.erp_sync_purchase_paid();

drop trigger if exists erp_purchase_payments_sync_delete on public.erp_purchase_payments;
create trigger erp_purchase_payments_sync_delete
  after delete on public.erp_purchase_payments
  for each row execute function public.erp_sync_purchase_paid_on_delete();

drop trigger if exists erp_sales_receipts_sync on public.erp_sales_receipts;
create trigger erp_sales_receipts_sync
  after insert or update on public.erp_sales_receipts
  for each row execute function public.erp_sync_sales_received();

drop trigger if exists erp_sales_receipts_sync_delete on public.erp_sales_receipts;
create trigger erp_sales_receipts_sync_delete
  after delete on public.erp_sales_receipts
  for each row execute function public.erp_sync_sales_received_on_delete();

-- ─── Reconciliation functions must check their own authorization ───────────
-- Both bypass RLS by design (SECURITY DEFINER, needed to see every row for
-- the health check). Without an internal check, "authenticated" was broad
-- enough to leak company invoice numbers and payment totals to an MR, who
-- must never read billing (spec §5, §36). erp_reconcile_batch_quantities()
-- exposes nothing an MR cannot already see via erp_product_batches, but the
-- check is added anyway for consistency with every other DEFINER function.
--
-- auth.role() = 'service_role' is let through explicitly: the dev seed
-- script (scripts/erp-seed.js) calls both of these as its final verification
-- step using the service-role key, which carries no erp_users row for
-- auth.uid() to match — erp_can_read_billing()/erp_is_staff() would reject
-- it otherwise, breaking the exact safety check the seed script runs to
-- prove the ledgers are healthy.

create or replace function public.erp_reconcile_invoice_payments()
returns table (
  invoice_kind   text,
  invoice_id     uuid,
  invoice_number text,
  cached_paid    numeric,
  ledger_paid    numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (auth.role() = 'service_role' or public.erp_can_read_billing()) then
    raise exception 'Only an administrator, accountant or manager may run this check'
      using errcode = 'insufficient_privilege';
  end if;

  return query
    select 'PURCHASE', i.id, i.invoice_number, i.amount_paid,
           coalesce(sum(p.amount), 0)
      from public.erp_purchase_invoices i
      left join public.erp_purchase_payments p on p.purchase_invoice_id = i.id
     group by i.id, i.invoice_number, i.amount_paid
    having i.amount_paid <> coalesce(sum(p.amount), 0)

    union all

    select 'SALES', i.id, i.invoice_number, i.amount_paid,
           coalesce(sum(r.amount), 0)
      from public.erp_sales_invoices i
      left join public.erp_sales_receipts r on r.sales_invoice_id = i.id
     group by i.id, i.invoice_number, i.amount_paid
    having i.amount_paid <> coalesce(sum(r.amount), 0);
end;
$$;

create or replace function public.erp_reconcile_batch_quantities()
returns table (
  batch_id        uuid,
  product_name    text,
  batch_number    text,
  cached_quantity integer,
  ledger_quantity bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (auth.role() = 'service_role' or public.erp_is_staff()) then
    raise exception 'Staff access required' using errcode = 'insufficient_privilege';
  end if;

  return query
    select b.id, p.product_name, b.batch_number, b.current_quantity,
           coalesce(sum(t.quantity), 0)::bigint
      from public.erp_product_batches b
      join public.erp_products p on p.id = b.product_id
      left join public.erp_inventory_transactions t on t.batch_id = b.id
     group by b.id, p.product_name, b.batch_number, b.current_quantity
    having b.current_quantity <> coalesce(sum(t.quantity), 0);
end;
$$;

-- ─── Product master vs. trade partners: one capability, two RLS answers ─────
-- The application's `masters.write` capability was granted to both ADMIN and
-- ACCOUNTANT, and used to gate BOTH "edit a distributor/supplier" (where the
-- database agrees — erp_can_write_billing() already includes ACCOUNTANT) AND
-- "edit a product" (where erp_products' RLS has only ever allowed ADMIN). An
-- accountant reached the Edit/Deactivate Product UI, submitted successfully
-- past the application check, and had the write silently dropped by RLS —
-- reported as saved because the update wasn't checking rows-affected either.
--
-- The database side of that mismatch cannot be fixed here (erp_products
-- being admin-only is correct — spec §13, "only admins may define products").
-- The fix is application-side: lib/erp/permissions.ts gets a dedicated
-- `products.write` capability that only ADMIN holds, and the product screens
-- and actions switch to it. Recorded here so the reasoning travels with the
-- migration that prompted it.

comment on table public.erp_products is
  'Pharma SKU master. UPDATE is intentionally erp_is_admin()-only — see lib/erp/permissions.ts "products.write", which must not be granted to ACCOUNTANT even though ACCOUNTANT holds the broader "masters.write" used for distributors/suppliers.';
