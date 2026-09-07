-- ============================================================================
-- LEOMED PHARMA ERP — PRICING ENGINE, PART 1: SCHEMA
--
-- Existing architecture this reuses, unchanged:
--   erp_products.mrp / gst_rate         — physical product attributes
--   erp_product_batches                 — batch-level MRP/cost/expiry/qty
--   erp_distributors / erp_chemists / erp_doctors — the three buyer types
--     already wired into erp_sales_invoices (20260905000011, 20260906000005)
--   erp_sales_invoice_items.quantity/free_quantity — already separate columns
--   gstSplit() in lib/erp/invoice-math.ts — already computes CGST/SGST/IGST
--     from one tax amount; GST% itself is already per-product, already
--     configurable, already never hardcoded. Nothing about GST changes here.
--
-- What's new: a versioned, effective-dated pricing_rules table replaces flat
-- "current price" columns as the source of truth for margins, plus a
-- schemes table for percentage-margin overrides and Buy-X-Get-Y free
-- quantity. erp_products.distributor_price/retailer_price remain — they
-- become a CACHE of the current default rule's result, kept in sync by the
-- same admin action that used to write them directly, so no existing screen
-- (Product Master list, ProductPicker's sale_rate default) breaks.
--
-- IMPORTANT CORRECTNESS FIX bundled into this migration: the existing
-- PricingFields UI computed BOTH distributor_price and retailer_price as
-- independent "% off MRP" figures — i.e. distributor margin was being taken
-- off MRP, not off PTR. That contradicts the actual business rule
-- (distributor margin is a % of the retailer price, PTR) and is corrected
-- here in the backfill and in the resolver — see erp_default_ptr() in part 2.
-- ============================================================================

-- ─── Enums ──────────────────────────────────────────────────────────────────

-- "CHEMIST" is this business's name for what the trade calls "Retailer" —
-- reused deliberately, not duplicated, since erp_chemists is already the
-- retailer/medical-store master. UI labels say "Retailer Margin"; the stored
-- value is CHEMIST, matching every other table that already uses this entity.
do $$ begin
  create type public.erp_billing_customer_type as enum ('DISTRIBUTOR', 'CHEMIST', 'DOCTOR');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.erp_calculation_basis as enum ('MRP', 'PTR', 'PTS', 'COST', 'FIXED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.erp_calculation_method as enum ('MARGIN', 'DISCOUNT', 'MARKUP', 'FIXED_PRICE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.erp_pricing_status as enum ('DRAFT', 'ACTIVE', 'INACTIVE', 'EXPIRED', 'CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.erp_scheme_type as enum ('PERCENTAGE_MARGIN', 'FREE_QUANTITY');
exception when duplicate_object then null; end $$;

-- ─── Pricing rules (versioned, effective-dated) ─────────────────────────────
-- customer_id columns all NULL = the product's default for that customer
-- type. Exactly one non-null = a negotiated rule for that one customer.

create table if not exists public.erp_pricing_rules (
  id                  uuid primary key default gen_random_uuid(),
  distributor_id      uuid references public.erp_distributors(id) on delete cascade,
  chemist_id          uuid references public.erp_chemists(id)     on delete cascade,
  doctor_id           uuid references public.erp_doctors(id)      on delete cascade,
  customer_type       public.erp_billing_customer_type not null,
  product_id          uuid not null references public.erp_products(id) on delete cascade,
  calculation_basis   public.erp_calculation_basis  not null,
  calculation_method  public.erp_calculation_method not null default 'MARGIN',
  percentage          numeric(6,3)  check (percentage is null or percentage between 0 and 100),
  fixed_amount        numeric(12,2) check (fixed_amount is null or fixed_amount >= 0),
  effective_from      date not null default current_date,
  effective_to        date,
  priority            integer not null default 100,
  status              public.erp_pricing_status not null default 'ACTIVE',
  version             integer not null default 1,
  notes               text,
  created_by          uuid references public.erp_users(id) on delete set null,
  updated_by          uuid references public.erp_users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint erp_pricing_rules_customer_scope check (
    (case when distributor_id is not null then 1 else 0 end)
    + (case when chemist_id is not null then 1 else 0 end)
    + (case when doctor_id is not null then 1 else 0 end) <= 1
  ),
  constraint erp_pricing_rules_calc_value check (
    (calculation_method = 'FIXED_PRICE' and fixed_amount is not null and percentage is null)
    or
    (calculation_method <> 'FIXED_PRICE' and percentage is not null and fixed_amount is null)
  ),
  constraint erp_pricing_rules_dates check (effective_to is null or effective_to >= effective_from)
);

create index if not exists erp_pricing_rules_lookup_idx
  on public.erp_pricing_rules (product_id, customer_type, status, effective_from);
create index if not exists erp_pricing_rules_distributor_idx on public.erp_pricing_rules (distributor_id) where distributor_id is not null;
create index if not exists erp_pricing_rules_chemist_idx     on public.erp_pricing_rules (chemist_id)     where chemist_id is not null;
create index if not exists erp_pricing_rules_doctor_idx      on public.erp_pricing_rules (doctor_id)      where doctor_id is not null;

drop trigger if exists erp_pricing_rules_touch on public.erp_pricing_rules;
create trigger erp_pricing_rules_touch before update on public.erp_pricing_rules
  for each row execute function public.erp_touch_updated_at();

drop trigger if exists erp_pricing_rules_audit on public.erp_pricing_rules;
create trigger erp_pricing_rules_audit
  after insert or update or delete on public.erp_pricing_rules
  for each row execute function public.erp_audit_trigger();

-- Prevent two ACTIVE rules for the same customer-scope + product with
-- overlapping effective periods (spec — "never silently choose one").
create or replace function public.erp_pricing_rules_check_overlap()
returns trigger
language plpgsql
as $$
begin
  if new.status <> 'ACTIVE' then
    return new;
  end if;

  if exists (
    select 1 from public.erp_pricing_rules r
     where r.id is distinct from new.id
       and r.product_id = new.product_id
       and r.customer_type = new.customer_type
       and r.status = 'ACTIVE'
       and r.distributor_id is not distinct from new.distributor_id
       and r.chemist_id     is not distinct from new.chemist_id
       and r.doctor_id      is not distinct from new.doctor_id
       and daterange(r.effective_from, coalesce(r.effective_to, 'infinity'::date), '[]')
           && daterange(new.effective_from, coalesce(new.effective_to, 'infinity'::date), '[]')
  ) then
    raise exception 'An active pricing rule already covers this customer and product for an overlapping period — deactivate or change its dates first'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists erp_pricing_rules_overlap on public.erp_pricing_rules;
create trigger erp_pricing_rules_overlap
  before insert or update on public.erp_pricing_rules
  for each row execute function public.erp_pricing_rules_check_overlap();

-- ─── Schemes (percentage-margin override, or free-quantity Buy X Get Y) ────

create table if not exists public.erp_schemes (
  id                  uuid primary key default gen_random_uuid(),
  scheme_name         text not null check (length(trim(scheme_name)) > 0),
  scheme_type         public.erp_scheme_type not null,
  product_id          uuid not null references public.erp_products(id) on delete cascade,
  -- NULL customer_type = applies across every buyer type for this product;
  -- normally set, since a scheme is usually aimed at one trade tier.
  customer_type       public.erp_billing_customer_type,

  -- PERCENTAGE_MARGIN fields
  calculation_basis   public.erp_calculation_basis,
  calculation_method  public.erp_calculation_method,
  percentage          numeric(6,3) check (percentage is null or percentage between 0 and 100),

  -- FREE_QUANTITY fields
  buy_quantity        integer check (buy_quantity is null or buy_quantity > 0),
  free_quantity       integer check (free_quantity is null or free_quantity > 0),

  effective_from      date not null default current_date,
  effective_to        date,
  priority            integer not null default 100,
  status              public.erp_pricing_status not null default 'DRAFT',
  version             integer not null default 1,
  notes               text,
  created_by          uuid references public.erp_users(id) on delete set null,
  updated_by          uuid references public.erp_users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint erp_schemes_type_fields check (
    (scheme_type = 'PERCENTAGE_MARGIN'
      and calculation_basis is not null and calculation_method is not null and percentage is not null
      and buy_quantity is null and free_quantity is null)
    or
    (scheme_type = 'FREE_QUANTITY'
      and buy_quantity is not null and free_quantity is not null
      and calculation_basis is null and calculation_method is null and percentage is null)
  ),
  constraint erp_schemes_dates check (effective_to is null or effective_to >= effective_from)
);

create index if not exists erp_schemes_lookup_idx
  on public.erp_schemes (product_id, scheme_type, status, effective_from);

drop trigger if exists erp_schemes_touch on public.erp_schemes;
create trigger erp_schemes_touch before update on public.erp_schemes
  for each row execute function public.erp_touch_updated_at();

drop trigger if exists erp_schemes_audit on public.erp_schemes;
create trigger erp_schemes_audit
  after insert or update or delete on public.erp_schemes
  for each row execute function public.erp_audit_trigger();

-- Same overlap guard, restricted to PERCENTAGE_MARGIN — a company-wide
-- (no erp_scheme_customers rows) scheme is checked against itself only;
-- customer-targeted overlap is enforced in application code at scheme-save
-- time, where the specific target list is easiest to compare.
create or replace function public.erp_schemes_check_overlap()
returns trigger
language plpgsql
as $$
begin
  if new.status <> 'ACTIVE' or new.scheme_type <> 'PERCENTAGE_MARGIN' then
    return new;
  end if;

  if exists (
    select 1 from public.erp_schemes s
     where s.id is distinct from new.id
       and s.product_id = new.product_id
       and s.scheme_type = 'PERCENTAGE_MARGIN'
       and s.status = 'ACTIVE'
       and s.customer_type is not distinct from new.customer_type
       and daterange(s.effective_from, coalesce(s.effective_to, 'infinity'::date), '[]')
           && daterange(new.effective_from, coalesce(new.effective_to, 'infinity'::date), '[]')
       and not exists (select 1 from public.erp_scheme_customers where scheme_id = s.id)
       and not exists (select 1 from public.erp_scheme_customers where scheme_id = new.id)
  ) then
    raise exception 'An active scheme already covers this product and customer type for an overlapping period — deactivate it or change the dates first'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists erp_schemes_overlap on public.erp_schemes;
create trigger erp_schemes_overlap
  before insert or update on public.erp_schemes
  for each row execute function public.erp_schemes_check_overlap();

create table if not exists public.erp_scheme_customers (
  id             uuid primary key default gen_random_uuid(),
  scheme_id      uuid not null references public.erp_schemes(id) on delete cascade,
  distributor_id uuid references public.erp_distributors(id) on delete cascade,
  chemist_id     uuid references public.erp_chemists(id)     on delete cascade,
  doctor_id      uuid references public.erp_doctors(id)      on delete cascade,
  created_at     timestamptz not null default now(),

  constraint erp_scheme_customers_scope check (
    (case when distributor_id is not null then 1 else 0 end)
    + (case when chemist_id is not null then 1 else 0 end)
    + (case when doctor_id is not null then 1 else 0 end) = 1
  )
);

create index if not exists erp_scheme_customers_scheme_idx on public.erp_scheme_customers (scheme_id);
create unique index if not exists erp_scheme_customers_unique_dist
  on public.erp_scheme_customers (scheme_id, distributor_id) where distributor_id is not null;
create unique index if not exists erp_scheme_customers_unique_chem
  on public.erp_scheme_customers (scheme_id, chemist_id) where chemist_id is not null;
create unique index if not exists erp_scheme_customers_unique_doc
  on public.erp_scheme_customers (scheme_id, doctor_id) where doctor_id is not null;

-- ─── Backfill: today's flat product prices become version-1 default rules ──
-- Fixes the MRP-basis bug in the same stroke: the existing distributor_price
-- was stored as an independent "% off MRP", not "% off PTR". This backfill
-- re-expresses it correctly — the retailer default becomes the PTR anchor,
-- and the distributor default's percentage is recomputed as its true
-- distance from THAT anchor, so the resulting rupee price is unchanged
-- (no customer sees a different price at midnight) but the stored margin
-- now means what the business actually means by "distributor margin".

-- Guarded with NOT EXISTS rather than ON CONFLICT: there is no natural-key
-- unique constraint to conflict on (a product's default rule is identified
-- by "all three customer-id columns null", not a single indexed key), and
-- re-running this unguarded would create a second ACTIVE default per
-- product — which erp_pricing_rules_overlap would then correctly refuse,
-- but with a confusing error rather than a clean no-op on a repeat run.
insert into public.erp_pricing_rules (
  product_id, customer_type, calculation_basis, calculation_method, percentage,
  effective_from, status, version, notes
)
select
  p.id, 'CHEMIST', 'MRP', 'MARGIN',
  round(case when p.mrp > 0 then (1 - p.retailer_price / p.mrp) * 100 else 0 end, 3),
  current_date, 'ACTIVE', 1,
  'Backfilled from erp_products.retailer_price at pricing-engine migration'
from public.erp_products p
where p.mrp > 0
  and not exists (
    select 1 from public.erp_pricing_rules r
     where r.product_id = p.id and r.customer_type = 'CHEMIST'
       and r.distributor_id is null and r.chemist_id is null and r.doctor_id is null
  );

insert into public.erp_pricing_rules (
  product_id, customer_type, calculation_basis, calculation_method, percentage,
  effective_from, status, version, notes
)
select
  p.id, 'DISTRIBUTOR', 'PTR', 'MARGIN',
  round(case when p.retailer_price > 0 then (1 - p.distributor_price / p.retailer_price) * 100 else 0 end, 3),
  current_date, 'ACTIVE', 1,
  'Backfilled from erp_products.distributor_price — re-expressed as % of PTR (previously stored as % of MRP)'
from public.erp_products p
where p.retailer_price > 0
  and not exists (
    select 1 from public.erp_pricing_rules r
     where r.product_id = p.id and r.customer_type = 'DISTRIBUTOR'
       and r.distributor_id is null and r.chemist_id is null and r.doctor_id is null
  );

-- Doctors start from the same default as chemists (retailer-style margin on
-- MRP) — admin can immediately diverge it, this is only a starting point,
-- not a claim that doctors and chemists must always match.
insert into public.erp_pricing_rules (
  product_id, customer_type, calculation_basis, calculation_method, percentage,
  effective_from, status, version, notes
)
select
  p.id, 'DOCTOR', 'MRP', 'MARGIN',
  round(case when p.mrp > 0 then (1 - p.retailer_price / p.mrp) * 100 else 0 end, 3),
  current_date, 'ACTIVE', 1,
  'Backfilled from erp_products.retailer_price as a starting point for direct doctor sales'
from public.erp_products p
where p.mrp > 0
  and not exists (
    select 1 from public.erp_pricing_rules r
     where r.product_id = p.id and r.customer_type = 'DOCTOR'
       and r.distributor_id is null and r.chemist_id is null and r.doctor_id is null
  );

-- ─── Grants & RLS ───────────────────────────────────────────────────────────
-- Raw pricing_rules/schemes rows carry the percentage a rule computes from —
-- exactly what an Accountant must not see (spec §30). SELECT is admin-only;
-- everyone else gets a price only through the resolver functions in part 2,
-- which return the rupee figure, never the underlying percentage, to a
-- non-admin caller.

revoke all on public.erp_pricing_rules   from anon;
revoke all on public.erp_schemes         from anon;
revoke all on public.erp_scheme_customers from anon;

grant select, insert, update, delete on public.erp_pricing_rules    to authenticated;
grant select, insert, update, delete on public.erp_schemes          to authenticated;
grant select, insert, update, delete on public.erp_scheme_customers to authenticated;

alter table public.erp_pricing_rules    enable row level security;
alter table public.erp_schemes          enable row level security;
alter table public.erp_scheme_customers enable row level security;

drop policy if exists erp_pricing_rules_admin_only on public.erp_pricing_rules;
create policy erp_pricing_rules_admin_only on public.erp_pricing_rules
  for all to authenticated using (public.erp_is_admin()) with check (public.erp_is_admin());

drop policy if exists erp_schemes_admin_only on public.erp_schemes;
create policy erp_schemes_admin_only on public.erp_schemes
  for all to authenticated using (public.erp_is_admin()) with check (public.erp_is_admin());

drop policy if exists erp_scheme_customers_admin_only on public.erp_scheme_customers;
create policy erp_scheme_customers_admin_only on public.erp_scheme_customers
  for all to authenticated using (public.erp_is_admin()) with check (public.erp_is_admin());
