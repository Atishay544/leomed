-- ============================================================================
-- LEOMED PHARMA ERP — 8 · PAYMENT TRACKING (confirmed decision Q6)
--
-- Replaces the single `amount_paid` column as the source of truth with a full
-- transaction history on both sides of the business:
--
--   erp_purchase_payments   money Leomed pays suppliers
--   erp_sales_receipts      money distributors pay Leomed
--
-- One invoice can have many payments. Balance and status are DERIVED from
-- those rows, never typed in.
--
-- `amount_paid` survives as a trigger-maintained cache of SUM(payments) — the
-- same pattern erp_product_batches.current_quantity already uses for the
-- inventory ledger. That keeps every existing report and dashboard query
-- working unchanged while making the transaction history authoritative. The
-- column's UPDATE grant is revoked below, so nothing can write it directly.
--
-- Deliberately NOT included (Q6 is explicit): no double-entry, no general
-- ledger, no trial balance, no P&L, no balance sheet. The shape below leaves
-- room for all of that later without reworking what is here.
-- ============================================================================

-- ─── PARTIAL → PARTIALLY_PAID ───────────────────────────────────────────────
-- Guarded so this migration is safe whether or not the earlier ones have
-- already been applied to this database.

do $$
begin
  if exists (
    select 1 from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'erp_payment_status' and e.enumlabel = 'PARTIAL'
  ) then
    alter type public.erp_payment_status rename value 'PARTIAL' to 'PARTIALLY_PAID';
  end if;
end $$;

-- ─── How the money moved ────────────────────────────────────────────────────

do $$ begin
  create type public.erp_payment_method as enum (
    'CASH', 'CHEQUE', 'BANK_TRANSFER', 'UPI', 'CARD', 'CREDIT_NOTE', 'OTHER'
  );
exception when duplicate_object then null; end $$;

-- ─── Purchase payments — money Leomed owes suppliers ────────────────────────

create table if not exists public.erp_purchase_payments (
  id                  uuid primary key default gen_random_uuid(),
  purchase_invoice_id uuid not null references public.erp_purchase_invoices(id) on delete cascade,
  payment_date        date not null default current_date,
  amount              numeric(14,2) not null check (amount > 0),
  payment_method      public.erp_payment_method not null default 'BANK_TRANSFER',
  reference_number    text,
  remarks             text,
  created_by          uuid references public.erp_users(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index if not exists erp_purchase_payments_invoice_idx
  on public.erp_purchase_payments (purchase_invoice_id, payment_date desc);
create index if not exists erp_purchase_payments_date_idx
  on public.erp_purchase_payments (payment_date desc);

-- ─── Sales receipts — money distributors owe Leomed ─────────────────────────

create table if not exists public.erp_sales_receipts (
  id               uuid primary key default gen_random_uuid(),
  sales_invoice_id uuid not null references public.erp_sales_invoices(id) on delete cascade,
  receipt_date     date not null default current_date,
  amount           numeric(14,2) not null check (amount > 0),
  payment_method   public.erp_payment_method not null default 'BANK_TRANSFER',
  reference_number text,
  remarks          text,
  created_by       uuid references public.erp_users(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists erp_sales_receipts_invoice_idx
  on public.erp_sales_receipts (sales_invoice_id, receipt_date desc);
create index if not exists erp_sales_receipts_date_idx
  on public.erp_sales_receipts (receipt_date desc);

-- ─── Nothing may be paid twice over ─────────────────────────────────────────
-- Q6: prevent payments exceeding the invoice, until an explicit
-- admin-approved overpayment workflow exists. The invoice row is locked first
-- so two concurrent payments cannot both pass the check against the same
-- balance and jointly overshoot it.

create or replace function public.erp_check_purchase_payment_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric(14,2);
  v_paid  numeric(14,2);
  v_number text;
begin
  select grand_total, invoice_number into v_total, v_number
    from public.erp_purchase_invoices
   where id = new.purchase_invoice_id
     for update;

  if not found then
    raise exception 'Purchase invoice % does not exist', new.purchase_invoice_id
      using errcode = 'foreign_key_violation';
  end if;

  select coalesce(sum(amount), 0) into v_paid
    from public.erp_purchase_payments
   where purchase_invoice_id = new.purchase_invoice_id
     and id <> new.id;

  if v_paid + new.amount > v_total then
    raise exception
      'Payment of % would exceed invoice % — total %, already paid %, balance %',
      to_char(new.amount, 'FM999999990.00'), v_number,
      to_char(v_total, 'FM999999990.00'), to_char(v_paid, 'FM999999990.00'),
      to_char(v_total - v_paid, 'FM999999990.00')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create or replace function public.erp_check_sales_receipt_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric(14,2);
  v_paid  numeric(14,2);
  v_number text;
begin
  select grand_total, invoice_number into v_total, v_number
    from public.erp_sales_invoices
   where id = new.sales_invoice_id
     for update;

  if not found then
    raise exception 'Sales invoice % does not exist', new.sales_invoice_id
      using errcode = 'foreign_key_violation';
  end if;

  select coalesce(sum(amount), 0) into v_paid
    from public.erp_sales_receipts
   where sales_invoice_id = new.sales_invoice_id
     and id <> new.id;

  if v_paid + new.amount > v_total then
    raise exception
      'Receipt of % would exceed invoice % — total %, already received %, balance %',
      to_char(new.amount, 'FM999999990.00'), v_number,
      to_char(v_total, 'FM999999990.00'), to_char(v_paid, 'FM999999990.00'),
      to_char(v_total - v_paid, 'FM999999990.00')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists erp_purchase_payments_check on public.erp_purchase_payments;
create trigger erp_purchase_payments_check
  before insert or update on public.erp_purchase_payments
  for each row execute function public.erp_check_purchase_payment_total();

drop trigger if exists erp_sales_receipts_check on public.erp_sales_receipts;
create trigger erp_sales_receipts_check
  before insert or update on public.erp_sales_receipts
  for each row execute function public.erp_check_sales_receipt_total();

-- ─── Roll the history up onto the invoice ───────────────────────────────────

create or replace function public.erp_sync_purchase_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_invoice uuid;
begin
  v_invoice := coalesce(new.purchase_invoice_id, old.purchase_invoice_id);

  update public.erp_purchase_invoices
     set amount_paid = (
           select coalesce(sum(amount), 0)
             from public.erp_purchase_payments
            where purchase_invoice_id = v_invoice
         )
   where id = v_invoice;

  return null;
end;
$$;

create or replace function public.erp_sync_sales_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_invoice uuid;
begin
  v_invoice := coalesce(new.sales_invoice_id, old.sales_invoice_id);

  update public.erp_sales_invoices
     set amount_paid = (
           select coalesce(sum(amount), 0)
             from public.erp_sales_receipts
            where sales_invoice_id = v_invoice
         )
   where id = v_invoice;

  return null;
end;
$$;

drop trigger if exists erp_purchase_payments_sync on public.erp_purchase_payments;
create trigger erp_purchase_payments_sync
  after insert or update or delete on public.erp_purchase_payments
  for each row execute function public.erp_sync_purchase_paid();

drop trigger if exists erp_sales_receipts_sync on public.erp_sales_receipts;
create trigger erp_sales_receipts_sync
  after insert or update or delete on public.erp_sales_receipts
  for each row execute function public.erp_sync_sales_received();

-- ─── Status follows the money ───────────────────────────────────────────────
-- Recreated because the enum label it referenced has been renamed.

create or replace function public.erp_sync_payment_status()
returns trigger
language plpgsql
as $$
begin
  new.payment_status := case
    when new.amount_paid <= 0               then 'UNPAID'::public.erp_payment_status
    when new.amount_paid >= new.grand_total then 'PAID'::public.erp_payment_status
    else 'PARTIALLY_PAID'::public.erp_payment_status
  end;
  return new;
end;
$$;

-- ─── Payments are audited ───────────────────────────────────────────────────

drop trigger if exists erp_purchase_payments_audit on public.erp_purchase_payments;
create trigger erp_purchase_payments_audit
  after insert or update or delete on public.erp_purchase_payments
  for each row execute function public.erp_audit_trigger();

drop trigger if exists erp_sales_receipts_audit on public.erp_sales_receipts;
create trigger erp_sales_receipts_audit
  after insert or update or delete on public.erp_sales_receipts
  for each row execute function public.erp_audit_trigger();

-- ─── Grants and RLS ─────────────────────────────────────────────────────────

alter table public.erp_purchase_payments enable row level security;
alter table public.erp_sales_receipts    enable row level security;

revoke all on public.erp_purchase_payments, public.erp_sales_receipts from anon;

grant select, insert, update, delete on public.erp_purchase_payments to authenticated;
grant select, insert, update, delete on public.erp_sales_receipts    to authenticated;

-- amount_paid is now derived. Revoking the column grant makes that structural:
-- no request, however crafted, can restate what an invoice has been paid
-- without going through the payment history.
revoke update (amount_paid) on public.erp_purchase_invoices from authenticated;
revoke update (amount_paid) on public.erp_sales_invoices    from authenticated;

-- MRs appear in none of these policies: field staff have no business in the
-- company's payment records (Q6).
drop policy if exists erp_purchase_payments_select on public.erp_purchase_payments;
create policy erp_purchase_payments_select on public.erp_purchase_payments
  for select to authenticated using (public.erp_can_read_billing());

drop policy if exists erp_purchase_payments_insert on public.erp_purchase_payments;
create policy erp_purchase_payments_insert on public.erp_purchase_payments
  for insert to authenticated with check (public.erp_can_write_billing());

drop policy if exists erp_purchase_payments_update on public.erp_purchase_payments;
create policy erp_purchase_payments_update on public.erp_purchase_payments
  for update to authenticated
  using (public.erp_can_write_billing()) with check (public.erp_can_write_billing());

-- Removing a payment record rewrites financial history, so it stays with the
-- administrator. Every deletion is captured by the audit trigger above.
drop policy if exists erp_purchase_payments_delete on public.erp_purchase_payments;
create policy erp_purchase_payments_delete on public.erp_purchase_payments
  for delete to authenticated using (public.erp_is_admin());

drop policy if exists erp_sales_receipts_select on public.erp_sales_receipts;
create policy erp_sales_receipts_select on public.erp_sales_receipts
  for select to authenticated using (public.erp_can_read_billing());

drop policy if exists erp_sales_receipts_insert on public.erp_sales_receipts;
create policy erp_sales_receipts_insert on public.erp_sales_receipts
  for insert to authenticated with check (public.erp_can_write_billing());

drop policy if exists erp_sales_receipts_update on public.erp_sales_receipts;
create policy erp_sales_receipts_update on public.erp_sales_receipts
  for update to authenticated
  using (public.erp_can_write_billing()) with check (public.erp_can_write_billing());

drop policy if exists erp_sales_receipts_delete on public.erp_sales_receipts;
create policy erp_sales_receipts_delete on public.erp_sales_receipts
  for delete to authenticated using (public.erp_is_admin());

-- ─── Reconciliation ─────────────────────────────────────────────────────────
-- Proves the cached amount_paid equals the payment history, the same way
-- erp_reconcile_batch_quantities() does for stock. An empty result is healthy.

create or replace function public.erp_reconcile_invoice_payments()
returns table (
  invoice_kind   text,
  invoice_id     uuid,
  invoice_number text,
  cached_paid    numeric,
  ledger_paid    numeric
)
language sql
stable
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.erp_reconcile_invoice_payments() from public;
grant execute on function public.erp_reconcile_invoice_payments() to authenticated;

-- ─── Carry forward anything recorded under the old model ────────────────────
-- If this database already held invoices with an amount_paid typed in, that
-- figure would otherwise be silently contradicted by an empty history. Each
-- becomes one opening payment row so the balance stays correct and the reason
-- is visible.

do $$
declare v_actor uuid;
begin
  select id into v_actor from public.erp_users where role = 'ADMIN' order by created_at limit 1;

  insert into public.erp_purchase_payments
    (purchase_invoice_id, payment_date, amount, payment_method, remarks, created_by)
  select i.id, i.invoice_date, i.amount_paid, 'OTHER',
         'Opening balance carried over when payment history was introduced', v_actor
    from public.erp_purchase_invoices i
   where i.amount_paid > 0
     and not exists (
       select 1 from public.erp_purchase_payments p where p.purchase_invoice_id = i.id
     );

  insert into public.erp_sales_receipts
    (sales_invoice_id, receipt_date, amount, payment_method, remarks, created_by)
  select i.id, i.invoice_date, i.amount_paid, 'OTHER',
         'Opening balance carried over when receipt history was introduced', v_actor
    from public.erp_sales_invoices i
   where i.amount_paid > 0
     and not exists (
       select 1 from public.erp_sales_receipts r where r.sales_invoice_id = i.id
     );
end $$;
