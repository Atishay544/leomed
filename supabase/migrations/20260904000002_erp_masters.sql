-- ============================================================================
-- LEOMED PHARMA ERP — 2/6 · MASTER DATA
-- Doctors, chemists, distributors, suppliers, products, product batches.
--
-- Doctors and chemists are COMPANY masters, not MR property. There is
-- deliberately no mr_id ownership column on either: any MR may visit any
-- doctor or chemist, any number of times (spec §10, §11, §58).
-- ============================================================================

-- Master codes (DR00001, CH00001, PRD00001 …) come from a column DEFAULT, so a
-- record cannot reach any of these tables without one — whichever path
-- inserted it: a form, the visit workflow, the seed script, or hand-written
-- SQL. erp_next_code() locks its counter row, so concurrent inserts are safe.

-- ─── Doctors ────────────────────────────────────────────────────────────────

create table if not exists public.erp_doctors (
  id             uuid primary key default gen_random_uuid(),
  doctor_code    text not null unique,
  doctor_name    text not null check (length(trim(doctor_name)) > 0),
  specialization text,
  qualification  text,
  phone          text,
  email          text,
  address        text,
  city           text,
  area           text,
  territory      text,
  clinic_name    text,
  latitude       numeric(9,6),
  longitude      numeric(9,6),
  notes          text,

  -- Set by erp_create_doctor_visit when the doctor is born inside a visit.
  -- FK added in migration 3 once erp_doctor_visits exists (chicken/egg — see D6).
  created_from_visit_id uuid,

  active     boolean not null default true,
  created_by uuid references public.erp_users(id) on delete set null,
  updated_by uuid references public.erp_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erp_doctors_name_trgm    on public.erp_doctors using gin (doctor_name gin_trgm_ops);
create index if not exists erp_doctors_phone_idx    on public.erp_doctors (phone) where phone is not null;
create index if not exists erp_doctors_city_idx     on public.erp_doctors (city);
create index if not exists erp_doctors_area_idx     on public.erp_doctors (area);
create index if not exists erp_doctors_territory_idx on public.erp_doctors (territory);
create index if not exists erp_doctors_active_idx   on public.erp_doctors (active) where active;
create index if not exists erp_doctors_created_by_idx on public.erp_doctors (created_by);

drop trigger if exists erp_doctors_touch on public.erp_doctors;
create trigger erp_doctors_touch before update on public.erp_doctors
  for each row execute function public.erp_touch_updated_at();

-- ─── Chemists / medical stores ──────────────────────────────────────────────

create table if not exists public.erp_chemists (
  id                  uuid primary key default gen_random_uuid(),
  chemist_code        text not null unique,
  chemist_name        text not null check (length(trim(chemist_name)) > 0),
  owner_name          text,
  phone               text,
  email               text,
  address             text,
  city                text,
  area                text,
  territory           text,
  gst_number          text,
  drug_license_number text,
  latitude            numeric(9,6),
  longitude           numeric(9,6),
  notes               text,

  created_from_visit_id uuid,   -- FK added in migration 3

  active     boolean not null default true,
  created_by uuid references public.erp_users(id) on delete set null,
  updated_by uuid references public.erp_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erp_chemists_name_trgm     on public.erp_chemists using gin (chemist_name gin_trgm_ops);
create index if not exists erp_chemists_owner_trgm    on public.erp_chemists using gin (owner_name gin_trgm_ops);
create index if not exists erp_chemists_phone_idx     on public.erp_chemists (phone) where phone is not null;
create index if not exists erp_chemists_city_idx      on public.erp_chemists (city);
create index if not exists erp_chemists_area_idx      on public.erp_chemists (area);
create index if not exists erp_chemists_territory_idx on public.erp_chemists (territory);
create index if not exists erp_chemists_active_idx    on public.erp_chemists (active) where active;

drop trigger if exists erp_chemists_touch on public.erp_chemists;
create trigger erp_chemists_touch before update on public.erp_chemists
  for each row execute function public.erp_touch_updated_at();

-- ─── Distributors (Leomed sells TO these) ───────────────────────────────────

create table if not exists public.erp_distributors (
  id                  uuid primary key default gen_random_uuid(),
  distributor_code    text not null unique,
  distributor_name    text not null check (length(trim(distributor_name)) > 0),
  contact_person      text,
  phone               text,
  email               text,
  address             text,
  city                text,
  state               text,
  territory           text,
  gst_number          text,
  drug_license_number text,
  payment_terms       text,
  credit_limit        numeric(12,2) check (credit_limit is null or credit_limit >= 0),
  active     boolean not null default true,
  created_by uuid references public.erp_users(id) on delete set null,
  updated_by uuid references public.erp_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erp_distributors_name_trgm     on public.erp_distributors using gin (distributor_name gin_trgm_ops);
create index if not exists erp_distributors_city_idx      on public.erp_distributors (city);
create index if not exists erp_distributors_territory_idx on public.erp_distributors (territory);
create index if not exists erp_distributors_active_idx    on public.erp_distributors (active) where active;

drop trigger if exists erp_distributors_touch on public.erp_distributors;
create trigger erp_distributors_touch before update on public.erp_distributors
  for each row execute function public.erp_touch_updated_at();

-- ─── Suppliers (Leomed buys FROM these) ─────────────────────────────────────

create table if not exists public.erp_suppliers (
  id                  uuid primary key default gen_random_uuid(),
  supplier_code       text not null unique,
  supplier_name       text not null check (length(trim(supplier_name)) > 0),
  contact_person      text,
  phone               text,
  email               text,
  address             text,
  city                text,
  state               text,
  gst_number          text,
  drug_license_number text,
  payment_terms       text,
  active     boolean not null default true,
  created_by uuid references public.erp_users(id) on delete set null,
  updated_by uuid references public.erp_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erp_suppliers_name_trgm  on public.erp_suppliers using gin (supplier_name gin_trgm_ops);
create index if not exists erp_suppliers_active_idx on public.erp_suppliers (active) where active;

drop trigger if exists erp_suppliers_touch on public.erp_suppliers;
create trigger erp_suppliers_touch before update on public.erp_suppliers
  for each row execute function public.erp_touch_updated_at();

-- ─── Products (pharma SKU master) ───────────────────────────────────────────
-- Separate from public.products, which is the consumer-facing storefront
-- catalogue with slugs, images and cart pricing. storefront_product_id is an
-- optional informational link only — there is no sync in either direction.

create table if not exists public.erp_products (
  id            uuid primary key default gen_random_uuid(),
  product_code  text not null unique,
  product_name  text not null check (length(trim(product_name)) > 0),
  generic_name  text,
  brand_name    text,
  category      text,
  dosage_form   text,
  strength      text,
  pack_size     text,
  unit          text not null default 'BOX',
  mrp           numeric(12,2) not null default 0 check (mrp >= 0),
  purchase_rate numeric(12,2) not null default 0 check (purchase_rate >= 0),
  sale_rate     numeric(12,2) not null default 0 check (sale_rate >= 0),
  gst_rate      numeric(5,2)  not null default 12 check (gst_rate >= 0 and gst_rate <= 28),
  hsn_code      text,
  min_stock_level integer not null default 0 check (min_stock_level >= 0),

  storefront_product_id uuid references public.products(id) on delete set null,

  active     boolean not null default true,
  created_by uuid references public.erp_users(id) on delete set null,
  updated_by uuid references public.erp_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erp_products_name_trgm    on public.erp_products using gin (product_name gin_trgm_ops);
create index if not exists erp_products_generic_trgm on public.erp_products using gin (generic_name gin_trgm_ops);
create index if not exists erp_products_brand_trgm   on public.erp_products using gin (brand_name gin_trgm_ops);
create index if not exists erp_products_category_idx on public.erp_products (category);
create index if not exists erp_products_active_idx   on public.erp_products (active) where active;

drop trigger if exists erp_products_touch on public.erp_products;
create trigger erp_products_touch before update on public.erp_products
  for each row execute function public.erp_touch_updated_at();

drop trigger if exists erp_products_audit on public.erp_products;
create trigger erp_products_audit
  after insert or update or delete on public.erp_products
  for each row execute function public.erp_audit_trigger();

-- ─── Product batches ────────────────────────────────────────────────────────
-- Pharma inventory is meaningless without batch + expiry, so stock never lives
-- on the product row. current_quantity is a trigger-maintained cache of the
-- ledger in migration 4 — nothing may write it directly (grants in migration 6).

create table if not exists public.erp_product_batches (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references public.erp_products(id) on delete restrict,
  batch_number       text not null check (length(trim(batch_number)) > 0),
  manufacturing_date date,
  expiry_date        date not null,
  mrp                numeric(12,2) not null default 0 check (mrp >= 0),
  purchase_rate      numeric(12,2) not null default 0 check (purchase_rate >= 0),
  sale_rate          numeric(12,2) not null default 0 check (sale_rate >= 0),
  opening_quantity   integer not null default 0 check (opening_quantity >= 0),
  current_quantity   integer not null default 0 check (current_quantity >= 0),
  created_by uuid references public.erp_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint erp_batches_unique_per_product unique (product_id, batch_number),
  constraint erp_batches_expiry_after_mfg
    check (manufacturing_date is null or expiry_date > manufacturing_date)
);

create index if not exists erp_batches_product_idx on public.erp_product_batches (product_id);
create index if not exists erp_batches_expiry_idx  on public.erp_product_batches (expiry_date);
-- FEFO batch picking on the sales screen hits exactly this index.
create index if not exists erp_batches_instock_idx on public.erp_product_batches (product_id, expiry_date)
  where current_quantity > 0;

drop trigger if exists erp_batches_touch on public.erp_product_batches;
create trigger erp_batches_touch before update on public.erp_product_batches
  for each row execute function public.erp_touch_updated_at();

-- ─── Code defaults ──────────────────────────────────────────────────────────
-- Set here rather than inline above so the tables read cleanly and re-running
-- the migration re-asserts them.

alter table public.erp_doctors
  alter column doctor_code      set default public.erp_next_code('doctor', 'DR');
alter table public.erp_chemists
  alter column chemist_code     set default public.erp_next_code('chemist', 'CH');
alter table public.erp_distributors
  alter column distributor_code set default public.erp_next_code('distributor', 'DIST');
alter table public.erp_suppliers
  alter column supplier_code    set default public.erp_next_code('supplier', 'SUP');
alter table public.erp_products
  alter column product_code     set default public.erp_next_code('product', 'PRD');
