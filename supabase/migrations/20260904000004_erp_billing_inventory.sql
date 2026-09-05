-- ============================================================================
-- LEOMED PHARMA ERP — 4/6 · BILLING & INVENTORY
-- Purchase invoices, sales invoices, and the inventory ledger.
--
-- Inventory truth is the ledger (D5). erp_product_batches.current_quantity is a
-- trigger-maintained cache of SUM(ledger.quantity) kept only so stock screens
-- stay fast; erp_reconcile_batch_quantities() proves the two agree. No screen,
-- action or API may set a stock number directly.
-- ============================================================================

-- ─── Suppliers → purchase invoices ──────────────────────────────────────────

create table if not exists public.erp_purchase_invoices (
  id             uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  supplier_id    uuid not null references public.erp_suppliers(id) on delete restrict,
  invoice_date   date not null default current_date,

  -- Every figure below is written by erp_save_purchase_invoice() from the line
  -- items. Client-submitted totals are discarded, never stored (spec §52).
  subtotal    numeric(14,2) not null default 0 check (subtotal    >= 0),
  discount    numeric(14,2) not null default 0 check (discount    >= 0),
  tax         numeric(14,2) not null default 0 check (tax         >= 0),
  grand_total numeric(14,2) not null default 0 check (grand_total >= 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),

  payment_status public.erp_payment_status not null default 'UNPAID',
  is_interstate  boolean not null default false,
  remarks        text,
  created_by uuid references public.erp_users(id) on delete set null,
  updated_by uuid references public.erp_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Suppliers number their own invoices; uniqueness is per supplier, not global.
  constraint erp_purchase_invoice_unique unique (supplier_id, invoice_number)
);

create index if not exists erp_purchase_invoices_date_idx     on public.erp_purchase_invoices (invoice_date desc);
create index if not exists erp_purchase_invoices_supplier_idx on public.erp_purchase_invoices (supplier_id, invoice_date desc);
create index if not exists erp_purchase_invoices_payment_idx  on public.erp_purchase_invoices (payment_status);

create table if not exists public.erp_purchase_invoice_items (
  id                  uuid primary key default gen_random_uuid(),
  purchase_invoice_id uuid not null references public.erp_purchase_invoices(id) on delete cascade,
  product_id          uuid not null references public.erp_products(id)          on delete restrict,
  batch_id            uuid not null references public.erp_product_batches(id)   on delete restrict,
  quantity            integer not null check (quantity > 0),
  free_quantity       integer not null default 0 check (free_quantity >= 0),
  purchase_rate       numeric(12,2) not null check (purchase_rate >= 0),
  discount_percent    numeric(5,2)  not null default 0 check (discount_percent between 0 and 100),
  gst_rate            numeric(5,2)  not null default 0 check (gst_rate between 0 and 28),
  taxable_amount      numeric(14,2) not null default 0,
  tax_amount          numeric(14,2) not null default 0,
  line_total          numeric(14,2) not null default 0,
  created_at          timestamptz not null default now()
);

create index if not exists erp_purchase_items_invoice_idx on public.erp_purchase_invoice_items (purchase_invoice_id);
create index if not exists erp_purchase_items_product_idx on public.erp_purchase_invoice_items (product_id);
create index if not exists erp_purchase_items_batch_idx   on public.erp_purchase_invoice_items (batch_id);

-- ─── Distributors → sales invoices ──────────────────────────────────────────
-- This is actual Leomed revenue. It has nothing to do with erp_field_orders.

create table if not exists public.erp_sales_invoices (
  id             uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,          -- issued by erp_next_document_number
  distributor_id uuid not null references public.erp_distributors(id) on delete restrict,
  invoice_date   date not null default current_date,

  subtotal    numeric(14,2) not null default 0 check (subtotal    >= 0),
  discount    numeric(14,2) not null default 0 check (discount    >= 0),
  tax         numeric(14,2) not null default 0 check (tax         >= 0),
  grand_total numeric(14,2) not null default 0 check (grand_total >= 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),

  payment_status public.erp_payment_status not null default 'UNPAID',
  is_interstate  boolean not null default false,
  remarks        text,
  created_by uuid references public.erp_users(id) on delete set null,
  updated_by uuid references public.erp_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erp_sales_invoices_date_idx        on public.erp_sales_invoices (invoice_date desc);
create index if not exists erp_sales_invoices_distributor_idx on public.erp_sales_invoices (distributor_id, invoice_date desc);
create index if not exists erp_sales_invoices_payment_idx     on public.erp_sales_invoices (payment_status);

create table if not exists public.erp_sales_invoice_items (
  id               uuid primary key default gen_random_uuid(),
  sales_invoice_id uuid not null references public.erp_sales_invoices(id)  on delete cascade,
  product_id       uuid not null references public.erp_products(id)        on delete restrict,
  batch_id         uuid not null references public.erp_product_batches(id) on delete restrict,
  quantity         integer not null check (quantity > 0),
  free_quantity    integer not null default 0 check (free_quantity >= 0),
  sale_rate        numeric(12,2) not null check (sale_rate >= 0),
  discount_percent numeric(5,2)  not null default 0 check (discount_percent between 0 and 100),
  gst_rate         numeric(5,2)  not null default 0 check (gst_rate between 0 and 28),
  taxable_amount   numeric(14,2) not null default 0,
  tax_amount       numeric(14,2) not null default 0,
  line_total       numeric(14,2) not null default 0,
  created_at       timestamptz not null default now()
);

create index if not exists erp_sales_items_invoice_idx on public.erp_sales_invoice_items (sales_invoice_id);
create index if not exists erp_sales_items_product_idx on public.erp_sales_invoice_items (product_id);
create index if not exists erp_sales_items_batch_idx   on public.erp_sales_invoice_items (batch_id);

-- ─── Payment status is derived, never typed in ──────────────────────────────

create or replace function public.erp_sync_payment_status()
returns trigger
language plpgsql
as $$
begin
  new.payment_status := case
    when new.amount_paid <= 0                then 'UNPAID'::public.erp_payment_status
    when new.amount_paid >= new.grand_total  then 'PAID'::public.erp_payment_status
    else 'PARTIAL'::public.erp_payment_status
  end;
  return new;
end;
$$;

drop trigger if exists erp_purchase_payment_status on public.erp_purchase_invoices;
create trigger erp_purchase_payment_status before insert or update on public.erp_purchase_invoices
  for each row execute function public.erp_sync_payment_status();

drop trigger if exists erp_sales_payment_status on public.erp_sales_invoices;
create trigger erp_sales_payment_status before insert or update on public.erp_sales_invoices
  for each row execute function public.erp_sync_payment_status();

drop trigger if exists erp_purchase_invoices_touch on public.erp_purchase_invoices;
create trigger erp_purchase_invoices_touch before update on public.erp_purchase_invoices
  for each row execute function public.erp_touch_updated_at();

drop trigger if exists erp_sales_invoices_touch on public.erp_sales_invoices;
create trigger erp_sales_invoices_touch before update on public.erp_sales_invoices
  for each row execute function public.erp_touch_updated_at();

drop trigger if exists erp_purchase_invoices_audit on public.erp_purchase_invoices;
create trigger erp_purchase_invoices_audit
  after insert or update or delete on public.erp_purchase_invoices
  for each row execute function public.erp_audit_trigger();

drop trigger if exists erp_sales_invoices_audit on public.erp_sales_invoices;
create trigger erp_sales_invoices_audit
  after insert or update or delete on public.erp_sales_invoices
  for each row execute function public.erp_audit_trigger();

-- ─── The inventory ledger ───────────────────────────────────────────────────

create table if not exists public.erp_inventory_transactions (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.erp_products(id)        on delete restrict,
  batch_id         uuid not null references public.erp_product_batches(id) on delete restrict,
  transaction_type public.erp_inventory_txn_type not null,
  reference_type   public.erp_reference_type     not null,
  -- Polymorphic on purpose (purchase invoice / sales invoice / adjustment), so
  -- no FK. Always paired with reference_type and indexed together.
  reference_id     uuid,
  -- Signed: positive adds stock, negative removes it, so a batch balance is a
  -- plain SUM() over this column.
  quantity         integer not null check (quantity <> 0),
  unit_rate        numeric(12,2) not null default 0 check (unit_rate >= 0),
  transaction_date date not null default current_date,
  remarks          text,
  created_by       uuid references public.erp_users(id) on delete set null,
  created_at       timestamptz not null default now(),

  -- Direction is a property of the transaction type, not a free choice.
  constraint erp_inventory_direction check (
    (transaction_type in ('OPENING', 'PURCHASE', 'SALE_RETURN', 'ADJUSTMENT_IN')  and quantity > 0) or
    (transaction_type in ('SALE', 'PURCHASE_RETURN', 'ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRY') and quantity < 0)
  ),
  -- A manual movement without a stated reason is unauditable.
  constraint erp_inventory_adjustment_reason check (
    transaction_type not in ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRY')
    or (remarks is not null and length(trim(remarks)) > 0)
  )
);

create index if not exists erp_inventory_batch_idx     on public.erp_inventory_transactions (batch_id, transaction_date desc);
create index if not exists erp_inventory_product_idx   on public.erp_inventory_transactions (product_id, transaction_date desc);
create index if not exists erp_inventory_reference_idx on public.erp_inventory_transactions (reference_type, reference_id);
create index if not exists erp_inventory_date_idx      on public.erp_inventory_transactions (transaction_date desc);
create index if not exists erp_inventory_type_idx      on public.erp_inventory_transactions (transaction_type);

-- Apply each ledger row to its batch cache, and refuse to go negative.
create or replace function public.erp_apply_inventory_txn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qty     integer;
  v_batch   text;
  v_product text;
begin
  -- UPDATE takes a row lock, so concurrent sales of the same batch serialise
  -- here instead of both reading the same "available" number.
  update public.erp_product_batches
     set current_quantity = current_quantity + new.quantity,
         updated_at       = now()
   where id = new.batch_id
  returning current_quantity, batch_number into v_qty, v_batch;

  if not found then
    raise exception 'Inventory batch % does not exist', new.batch_id
      using errcode = 'foreign_key_violation';
  end if;

  if v_qty < 0 then
    select product_name into v_product from public.erp_products where id = new.product_id;
    raise exception 'Insufficient stock for % (batch %): short by % units',
      coalesce(v_product, new.product_id::text), v_batch, abs(v_qty)
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists erp_inventory_apply on public.erp_inventory_transactions;
create trigger erp_inventory_apply
  after insert on public.erp_inventory_transactions
  for each row execute function public.erp_apply_inventory_txn();

-- The ledger is append-only. Corrections are new reversing rows, so history
-- can never be quietly rewritten. Grants in migration 6 also revoke the verbs;
-- this trigger is the belt to that suspenders (service_role bypasses grants).
create or replace function public.erp_block_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'erp_inventory_transactions is append-only — post a reversing transaction instead of editing history'
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists erp_inventory_immutable on public.erp_inventory_transactions;
create trigger erp_inventory_immutable
  before update or delete on public.erp_inventory_transactions
  for each row execute function public.erp_block_ledger_mutation();

drop trigger if exists erp_inventory_audit on public.erp_inventory_transactions;
create trigger erp_inventory_audit
  after insert on public.erp_inventory_transactions
  for each row execute function public.erp_audit_trigger();

-- ─── Reconciliation ─────────────────────────────────────────────────────────
-- Proves the cached quantity equals the ledger. Returns only the rows that
-- disagree, so an empty result is a clean bill of health.

create or replace function public.erp_reconcile_batch_quantities()
returns table (
  batch_id        uuid,
  product_name    text,
  batch_number    text,
  cached_quantity integer,
  ledger_quantity bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id,
         p.product_name,
         b.batch_number,
         b.current_quantity,
         coalesce(sum(t.quantity), 0)::bigint
    from public.erp_product_batches b
    join public.erp_products p on p.id = b.product_id
    left join public.erp_inventory_transactions t on t.batch_id = b.id
   group by b.id, p.product_name, b.batch_number, b.current_quantity
  having b.current_quantity <> coalesce(sum(t.quantity), 0);
$$;

revoke all on function public.erp_reconcile_batch_quantities() from public;
grant execute on function public.erp_reconcile_batch_quantities() to authenticated;
