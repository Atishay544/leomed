-- ============================================================================
-- LEOMED PHARMA ERP — combined migration bundle
-- Regenerated 2026-09-05T04:38:40Z from supabase/migrations/2026090[45]*.sql
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- Safe to re-run: every statement is idempotent (if not exists / or replace / drop if exists).
-- ============================================================================

-- ============================================================================
-- FILE: supabase/migrations/20260904000001_erp_core.sql
-- ============================================================================
-- ============================================================================
-- LEOMED PHARMA ERP — 1/6 · CORE
-- Enums, staff directory, settings, audit trail, helper functions.
--
-- WHY THE erp_ PREFIX: this database already serves a live D2C storefront that
-- owns public.products / public.orders / public.profiles. Every ERP table is
-- prefixed so the two systems can never collide. Everything stays in the
-- `public` schema so PostgREST exposes it with no Supabase dashboard changes.
-- ============================================================================

create extension if not exists pg_trgm;

-- ─── Enums ──────────────────────────────────────────────────────────────────

do $$ begin
  create type public.erp_role as enum ('ADMIN', 'MR', 'ACCOUNTANT', 'MANAGER', 'VIEWER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.erp_customer_type as enum ('DOCTOR', 'CHEMIST');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.erp_doctor_status as enum ('NEW', 'EXISTING');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.erp_visit_purpose as enum (
    'INTRODUCTION', 'FOLLOW_UP', 'PRODUCT_DETAILING', 'ORDER_COLLECTION',
    'PAYMENT_FOLLOW_UP', 'COMPLAINT', 'OTHER'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.erp_discussion_type as enum (
    'DETAILED', 'SAMPLE_GIVEN', 'LITERATURE_GIVEN', 'REMINDER', 'NEW_LAUNCH'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.erp_field_order_status as enum (
    'RECEIVED', 'FORWARDED_TO_DISTRIBUTOR', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.erp_inventory_txn_type as enum (
    'OPENING', 'PURCHASE', 'SALE', 'SALE_RETURN', 'PURCHASE_RETURN',
    'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRY'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.erp_reference_type as enum (
    'PURCHASE_INVOICE', 'SALES_INVOICE', 'ADJUSTMENT', 'OPENING'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.erp_payment_status as enum ('UNPAID', 'PARTIAL', 'PAID');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.erp_followup_status as enum ('PENDING', 'COMPLETED', 'CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.erp_followup_priority as enum ('LOW', 'MEDIUM', 'HIGH');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.erp_target_type as enum (
    'DOCTOR_VISITS', 'CHEMIST_VISITS', 'NEW_DOCTORS', 'FIELD_ORDERS', 'SALES'
  );
exception when duplicate_object then null; end $$;

-- ─── updated_at maintenance ─────────────────────────────────────────────────

create or replace function public.erp_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─── Staff directory ────────────────────────────────────────────────────────
-- Deliberately separate from public.profiles: storefront customers and pharma
-- field staff are different populations with different role vocabularies. One
-- person may be both (same auth.users row, one row in each table). Leaving
-- profiles.role alone means zero regression risk for the live storefront.

create table if not exists public.erp_users (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),
  email         text not null,
  phone         text,
  role          public.erp_role not null default 'MR',
  mr_code       text,
  territory     text,
  reports_to    uuid references public.erp_users(id) on delete set null,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- An MR without a code cannot be identified on a field report.
  constraint erp_users_mr_code_required
    check (role <> 'MR' or mr_code is not null)
);

create unique index if not exists erp_users_email_lower_key
  on public.erp_users (lower(email));
create unique index if not exists erp_users_mr_code_key
  on public.erp_users (upper(mr_code)) where mr_code is not null;
create index if not exists erp_users_role_idx      on public.erp_users (role) where active;
create index if not exists erp_users_territory_idx on public.erp_users (territory);
create index if not exists erp_users_reports_to_idx on public.erp_users (reports_to);

drop trigger if exists erp_users_touch on public.erp_users;
create trigger erp_users_touch before update on public.erp_users
  for each row execute function public.erp_touch_updated_at();

-- ─── Settings (singleton) ───────────────────────────────────────────────────

create table if not exists public.erp_settings (
  id                          smallint primary key default 1 check (id = 1),
  company_name                text    not null default 'Leomed Pharma',
  company_gst_number          text,
  company_drug_license        text,
  company_address             text,
  expiry_warning_days         integer not null default 90  check (expiry_warning_days between 1 and 730),
  mr_edit_window_hours        integer not null default 24  check (mr_edit_window_hours between 0 and 720),
  allow_expired_sale          boolean not null default false,
  financial_year_start_month  smallint not null default 4  check (financial_year_start_month between 1 and 12),
  low_stock_multiplier        numeric(4,2) not null default 1.0 check (low_stock_multiplier > 0),
  updated_at                  timestamptz not null default now()
);

insert into public.erp_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists erp_settings_touch on public.erp_settings;
create trigger erp_settings_touch before update on public.erp_settings
  for each row execute function public.erp_touch_updated_at();

-- ─── Audit trail ────────────────────────────────────────────────────────────

create table if not exists public.erp_audit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.erp_users(id) on delete set null,
  action      text not null,
  table_name  text not null,
  record_id   uuid,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists erp_audit_logs_created_idx on public.erp_audit_logs (created_at desc);
create index if not exists erp_audit_logs_table_idx   on public.erp_audit_logs (table_name, record_id);
create index if not exists erp_audit_logs_user_idx    on public.erp_audit_logs (user_id);

-- ─── Authorization helpers ──────────────────────────────────────────────────
-- SECURITY DEFINER is load-bearing, not decoration. Without it every policy
-- that calls these would require the *calling* role to hold SELECT on
-- erp_users, and nested policy evaluation on erp_users would recurse. The
-- storefront hit exactly that bug — see 20260724000001_admin_policies_use_is_admin_fn.sql.

create or replace function public.erp_current_user_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.erp_users where auth_user_id = auth.uid() and active limit 1;
$$;

create or replace function public.erp_current_role()
returns public.erp_role
language sql stable security definer set search_path = public
as $$
  select role from public.erp_users where auth_user_id = auth.uid() and active limit 1;
$$;

create or replace function public.erp_is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.erp_users where auth_user_id = auth.uid() and active);
$$;

create or replace function public.erp_is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.erp_users
    where auth_user_id = auth.uid() and active and role = 'ADMIN'
  );
$$;

-- Admin + Manager: everyone who may see the whole field force, but only ADMIN writes.
create or replace function public.erp_can_read_all_field()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.erp_users
    where auth_user_id = auth.uid() and active and role in ('ADMIN', 'MANAGER')
  );
$$;

create or replace function public.erp_can_write_billing()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.erp_users
    where auth_user_id = auth.uid() and active and role in ('ADMIN', 'ACCOUNTANT')
  );
$$;

create or replace function public.erp_can_read_billing()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.erp_users
    where auth_user_id = auth.uid() and active and role in ('ADMIN', 'ACCOUNTANT', 'MANAGER')
  );
$$;

-- How long an MR may still edit their own record.
create or replace function public.erp_within_edit_window(p_created_at timestamptz)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_created_at > now() - make_interval(hours => (select mr_edit_window_hours from public.erp_settings where id = 1));
$$;

revoke all on function public.erp_current_user_id()          from public;
revoke all on function public.erp_current_role()             from public;
revoke all on function public.erp_is_staff()                 from public;
revoke all on function public.erp_is_admin()                 from public;
revoke all on function public.erp_can_read_all_field()       from public;
revoke all on function public.erp_can_write_billing()        from public;
revoke all on function public.erp_can_read_billing()         from public;
revoke all on function public.erp_within_edit_window(timestamptz) from public;

grant execute on function public.erp_current_user_id()          to authenticated;
grant execute on function public.erp_current_role()             to authenticated;
grant execute on function public.erp_is_staff()                 to authenticated;
grant execute on function public.erp_is_admin()                 to authenticated;
grant execute on function public.erp_can_read_all_field()       to authenticated;
grant execute on function public.erp_can_write_billing()        to authenticated;
grant execute on function public.erp_can_read_billing()         to authenticated;
grant execute on function public.erp_within_edit_window(timestamptz) to authenticated;

-- ─── Document numbering ─────────────────────────────────────────────────────
-- Invoice / order numbers are issued by the database, never by the client.
-- Counter rows are locked per (kind, financial year) so concurrent saves can
-- never mint the same number.

create table if not exists public.erp_document_counters (
  doc_kind     text not null,
  fiscal_year  text not null,
  last_number  integer not null default 0,
  primary key (doc_kind, fiscal_year)
);

create or replace function public.erp_fiscal_year(p_date date default current_date)
returns text
language sql stable
set search_path = public
as $$
  select case
    when extract(month from p_date) >= (select financial_year_start_month from public.erp_settings where id = 1)
      then to_char(p_date, 'YYYY') || '-' || to_char((date_trunc('year', p_date) + interval '1 year')::date, 'YY')
    else to_char((date_trunc('year', p_date) - interval '1 year')::date, 'YYYY') || '-' || to_char(p_date, 'YY')
  end;
$$;

create or replace function public.erp_next_document_number(
  p_kind   text,
  p_prefix text,
  p_date   date default current_date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fy  text;
  v_num integer;
begin
  v_fy := public.erp_fiscal_year(p_date);

  insert into public.erp_document_counters (doc_kind, fiscal_year, last_number)
  values (p_kind, v_fy, 1)
  on conflict (doc_kind, fiscal_year)
    do update set last_number = public.erp_document_counters.last_number + 1
  returning last_number into v_num;

  return p_prefix || '/' || v_fy || '/' || lpad(v_num::text, 5, '0');
end;
$$;

-- Short codes for master records (DR00001, CH00001, …). Same locking guarantee.
create or replace function public.erp_next_code(p_kind text, p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_num integer;
begin
  insert into public.erp_document_counters (doc_kind, fiscal_year, last_number)
  values (p_kind, 'ALL', 1)
  on conflict (doc_kind, fiscal_year)
    do update set last_number = public.erp_document_counters.last_number + 1
  returning last_number into v_num;

  return p_prefix || lpad(v_num::text, 5, '0');
end;
$$;

revoke all on function public.erp_next_document_number(text, text, date) from public;
revoke all on function public.erp_next_code(text, text)                  from public;

-- ─── Generic audit trigger ──────────────────────────────────────────────────

create or replace function public.erp_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid;
begin
  v_actor := public.erp_current_user_id();

  insert into public.erp_audit_logs (user_id, action, table_name, record_id, old_data, new_data)
  values (
    v_actor,
    tg_op,
    tg_table_name,
    case when tg_op = 'DELETE' then (to_jsonb(old) ->> 'id')::uuid else (to_jsonb(new) ->> 'id')::uuid end,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists erp_users_audit on public.erp_users;
create trigger erp_users_audit
  after insert or update or delete on public.erp_users
  for each row execute function public.erp_audit_trigger();


-- ============================================================================
-- FILE: supabase/migrations/20260904000002_erp_masters.sql
-- ============================================================================
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


-- ============================================================================
-- FILE: supabase/migrations/20260904000003_erp_field_force.sql
-- ============================================================================
-- ============================================================================
-- LEOMED PHARMA ERP — 3/6 · FIELD FORCE
-- Doctor visits, chemist visits, products discussed, field orders, follow-ups,
-- targets.
--
-- FIELD ORDERS ARE NOT SALES INVOICES (spec §4, §29, §62). A field order is a
-- demand signal captured by an MR: it measures field performance and doctor /
-- chemist ordering behaviour. It touches no inventory, creates no receivable,
-- and has no relationship of any kind to erp_sales_invoices.
-- ============================================================================

-- ─── Doctor visits ──────────────────────────────────────────────────────────
-- NO unique constraint on doctor_id, nor on (doctor_id, mr_id): repeat visits
-- by any MR to any doctor are the normal case, not an error (spec §17).

create table if not exists public.erp_doctor_visits (
  id            uuid primary key default gen_random_uuid(),
  doctor_id     uuid not null references public.erp_doctors(id) on delete restrict,
  mr_id         uuid not null references public.erp_users(id)   on delete restrict,
  visit_date    date not null default current_date,
  visit_time    time,
  purpose       public.erp_visit_purpose not null default 'PRODUCT_DETAILING',
  discussion    text,
  remarks       text,

  -- Stamped at write time rather than derived later: if the doctor master is
  -- edited or the visit that created it is deleted, this visit's history must
  -- still read the same way it did the day the MR filed it.
  doctor_status public.erp_doctor_status not null default 'EXISTING',

  follow_up_required boolean not null default false,
  follow_up_date     date,
  latitude           numeric(9,6),
  longitude          numeric(9,6),

  -- Idempotency for a double-tapped Save on a flaky clinic connection (D11).
  client_request_id uuid unique,

  created_by uuid references public.erp_users(id) on delete set null,
  updated_by uuid references public.erp_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint erp_doctor_visits_followup_date
    check (not follow_up_required or follow_up_date is not null)
);

create index if not exists erp_doctor_visits_mr_date_idx     on public.erp_doctor_visits (mr_id, visit_date desc);
create index if not exists erp_doctor_visits_doctor_date_idx on public.erp_doctor_visits (doctor_id, visit_date desc);
create index if not exists erp_doctor_visits_date_idx        on public.erp_doctor_visits (visit_date desc);
create index if not exists erp_doctor_visits_status_idx      on public.erp_doctor_visits (doctor_status, visit_date desc);

drop trigger if exists erp_doctor_visits_touch on public.erp_doctor_visits;
create trigger erp_doctor_visits_touch before update on public.erp_doctor_visits
  for each row execute function public.erp_touch_updated_at();

-- ─── Chemist visits ─────────────────────────────────────────────────────────

create table if not exists public.erp_chemist_visits (
  id          uuid primary key default gen_random_uuid(),
  chemist_id  uuid not null references public.erp_chemists(id) on delete restrict,
  mr_id       uuid not null references public.erp_users(id)    on delete restrict,
  visit_date  date not null default current_date,
  visit_time  time,
  purpose     public.erp_visit_purpose not null default 'ORDER_COLLECTION',
  discussion  text,
  remarks     text,
  follow_up_required boolean not null default false,
  follow_up_date     date,
  latitude           numeric(9,6),
  longitude          numeric(9,6),
  client_request_id  uuid unique,
  created_by uuid references public.erp_users(id) on delete set null,
  updated_by uuid references public.erp_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint erp_chemist_visits_followup_date
    check (not follow_up_required or follow_up_date is not null)
);

create index if not exists erp_chemist_visits_mr_date_idx      on public.erp_chemist_visits (mr_id, visit_date desc);
create index if not exists erp_chemist_visits_chemist_date_idx on public.erp_chemist_visits (chemist_id, visit_date desc);
create index if not exists erp_chemist_visits_date_idx         on public.erp_chemist_visits (visit_date desc);

drop trigger if exists erp_chemist_visits_touch on public.erp_chemist_visits;
create trigger erp_chemist_visits_touch before update on public.erp_chemist_visits
  for each row execute function public.erp_touch_updated_at();

-- ─── Deferred back-references (D6) ──────────────────────────────────────────
-- A doctor created during a visit points at that visit; the visit points at the
-- doctor. Both FKs cannot be satisfied by a single INSERT, so the column is
-- filled by erp_create_doctor_visit() after both rows exist, inside one
-- transaction. ON DELETE SET NULL: deleting a visit must never orphan a doctor.

alter table public.erp_doctors
  drop constraint if exists erp_doctors_created_from_visit_fk;
alter table public.erp_doctors
  add constraint erp_doctors_created_from_visit_fk
  foreign key (created_from_visit_id) references public.erp_doctor_visits(id) on delete set null;

alter table public.erp_chemists
  drop constraint if exists erp_chemists_created_from_visit_fk;
alter table public.erp_chemists
  add constraint erp_chemists_created_from_visit_fk
  foreign key (created_from_visit_id) references public.erp_chemist_visits(id) on delete set null;

create index if not exists erp_doctors_from_visit_idx  on public.erp_doctors (created_from_visit_id)
  where created_from_visit_id is not null;
create index if not exists erp_chemists_from_visit_idx on public.erp_chemists (created_from_visit_id)
  where created_from_visit_id is not null;

-- ─── Products discussed during a doctor visit (1:N) ─────────────────────────
-- One visit routinely covers several products, so this is a child table and
-- never a product_id column on the visit itself (spec §19, §62).

create table if not exists public.erp_doctor_visit_products (
  id              uuid primary key default gen_random_uuid(),
  visit_id        uuid not null references public.erp_doctor_visits(id) on delete cascade,
  product_id      uuid not null references public.erp_products(id)      on delete restrict,
  discussion_type public.erp_discussion_type not null default 'DETAILED',
  sample_quantity integer not null default 0 check (sample_quantity >= 0),
  remarks         text,
  created_at      timestamptz not null default now(),

  constraint erp_visit_products_unique unique (visit_id, product_id)
);

create index if not exists erp_visit_products_visit_idx   on public.erp_doctor_visit_products (visit_id);
create index if not exists erp_visit_products_product_idx on public.erp_doctor_visit_products (product_id);

-- ─── Field orders ───────────────────────────────────────────────────────────
-- Two typed visit FKs rather than one generic visit_id: a single polymorphic
-- column cannot carry a foreign key, and spec §35 puts database-enforced
-- integrity above column count. The XOR checks below make the doctor/chemist
-- and visit columns mutually exclusive and consistent with customer_type, so
-- the pair behaves as one logical "source" relationship with real FKs.

create table if not exists public.erp_field_orders (
  id            uuid primary key default gen_random_uuid(),
  order_number  text not null unique,
  customer_type public.erp_customer_type not null,
  doctor_id     uuid references public.erp_doctors(id)  on delete restrict,
  chemist_id    uuid references public.erp_chemists(id) on delete restrict,
  mr_id         uuid not null references public.erp_users(id) on delete restrict,

  doctor_visit_id  uuid references public.erp_doctor_visits(id)  on delete set null,
  chemist_visit_id uuid references public.erp_chemist_visits(id) on delete set null,

  order_date        date not null default current_date,
  -- The MR's physical order book reference. A business field, never a key:
  -- different MRs carry different books whose numbers repeat (spec §22).
  order_book_number text,

  status public.erp_field_order_status not null default 'RECEIVED',

  -- Indicative demand value only (unit rates snapshotted from the product
  -- master at capture time). NOT a quotation and NOT money owed to Leomed.
  estimated_value numeric(14,2) not null default 0,

  remarks           text,
  client_request_id uuid unique,
  created_by uuid references public.erp_users(id) on delete set null,
  updated_by uuid references public.erp_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint erp_field_orders_customer_xor check (
    (customer_type = 'DOCTOR'  and doctor_id  is not null and chemist_id is null) or
    (customer_type = 'CHEMIST' and chemist_id is not null and doctor_id  is null)
  ),
  constraint erp_field_orders_visit_xor check (
    (customer_type = 'DOCTOR'  and chemist_visit_id is null) or
    (customer_type = 'CHEMIST' and doctor_visit_id  is null)
  )
);

create index if not exists erp_field_orders_mr_date_idx   on public.erp_field_orders (mr_id, order_date desc);
create index if not exists erp_field_orders_date_idx      on public.erp_field_orders (order_date desc);
create index if not exists erp_field_orders_doctor_idx    on public.erp_field_orders (doctor_id)  where doctor_id  is not null;
create index if not exists erp_field_orders_chemist_idx   on public.erp_field_orders (chemist_id) where chemist_id is not null;
create index if not exists erp_field_orders_status_idx    on public.erp_field_orders (status);
create index if not exists erp_field_orders_dvisit_idx    on public.erp_field_orders (doctor_visit_id)  where doctor_visit_id  is not null;
create index if not exists erp_field_orders_cvisit_idx    on public.erp_field_orders (chemist_visit_id) where chemist_visit_id is not null;

-- Same physical book number may recur across MRs, never within one MR.
create unique index if not exists erp_field_orders_book_per_mr
  on public.erp_field_orders (mr_id, upper(order_book_number))
  where order_book_number is not null;

drop trigger if exists erp_field_orders_touch on public.erp_field_orders;
create trigger erp_field_orders_touch before update on public.erp_field_orders
  for each row execute function public.erp_touch_updated_at();

-- ─── Field order items (1:N) ────────────────────────────────────────────────

create table if not exists public.erp_field_order_items (
  id             uuid primary key default gen_random_uuid(),
  field_order_id uuid not null references public.erp_field_orders(id) on delete cascade,
  product_id     uuid not null references public.erp_products(id)     on delete restrict,
  quantity       integer not null check (quantity > 0),
  unit           text not null default 'BOX',
  unit_rate      numeric(12,2) not null default 0 check (unit_rate >= 0),
  line_value     numeric(14,2) generated always as (quantity * unit_rate) stored,
  remarks        text,
  created_at     timestamptz not null default now()
);

create index if not exists erp_field_order_items_order_idx   on public.erp_field_order_items (field_order_id);
create index if not exists erp_field_order_items_product_idx on public.erp_field_order_items (product_id);

-- Keep the parent's indicative value in step with its lines.
create or replace function public.erp_sync_field_order_value()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_order uuid;
begin
  v_order := coalesce(new.field_order_id, old.field_order_id);

  update public.erp_field_orders
     set estimated_value = coalesce(
           (select sum(line_value) from public.erp_field_order_items where field_order_id = v_order), 0
         )
   where id = v_order;

  return null;
end;
$$;

drop trigger if exists erp_field_order_items_value on public.erp_field_order_items;
create trigger erp_field_order_items_value
  after insert or update or delete on public.erp_field_order_items
  for each row execute function public.erp_sync_field_order_value();

-- ─── Follow-ups ─────────────────────────────────────────────────────────────

create table if not exists public.erp_followups (
  id            uuid primary key default gen_random_uuid(),
  mr_id         uuid not null references public.erp_users(id) on delete restrict,
  customer_type public.erp_customer_type not null,
  doctor_id     uuid references public.erp_doctors(id)  on delete cascade,
  chemist_id    uuid references public.erp_chemists(id) on delete cascade,
  doctor_visit_id  uuid references public.erp_doctor_visits(id)  on delete set null,
  chemist_visit_id uuid references public.erp_chemist_visits(id) on delete set null,
  followup_date date not null,
  description   text,
  status        public.erp_followup_status   not null default 'PENDING',
  priority      public.erp_followup_priority not null default 'MEDIUM',
  completed_at  timestamptz,
  created_by uuid references public.erp_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint erp_followups_customer_xor check (
    (customer_type = 'DOCTOR'  and doctor_id  is not null and chemist_id is null) or
    (customer_type = 'CHEMIST' and chemist_id is not null and doctor_id  is null)
  ),
  constraint erp_followups_completed_at
    check (status <> 'COMPLETED' or completed_at is not null)
);

-- The MR dashboard's "overdue + upcoming" query is exactly this index.
create index if not exists erp_followups_mr_pending_idx on public.erp_followups (mr_id, followup_date)
  where status = 'PENDING';
create index if not exists erp_followups_date_idx    on public.erp_followups (followup_date);
create index if not exists erp_followups_doctor_idx  on public.erp_followups (doctor_id)  where doctor_id  is not null;
create index if not exists erp_followups_chemist_idx on public.erp_followups (chemist_id) where chemist_id is not null;

drop trigger if exists erp_followups_touch on public.erp_followups;
create trigger erp_followups_touch before update on public.erp_followups
  for each row execute function public.erp_touch_updated_at();

-- ─── Targets ────────────────────────────────────────────────────────────────
-- mr_id null + territory set = a territory-wide target rather than a personal one.

create table if not exists public.erp_targets (
  id           uuid primary key default gen_random_uuid(),
  mr_id        uuid references public.erp_users(id) on delete cascade,
  territory    text,
  period_start date not null,
  period_end   date not null,
  target_type  public.erp_target_type not null,
  target_value numeric(14,2) not null check (target_value > 0),
  created_by uuid references public.erp_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint erp_targets_period      check (period_end >= period_start),
  constraint erp_targets_scope       check (mr_id is not null or territory is not null)
);

create unique index if not exists erp_targets_unique_mr
  on public.erp_targets (mr_id, target_type, period_start, period_end)
  where mr_id is not null;
create index if not exists erp_targets_period_idx on public.erp_targets (period_start, period_end);

drop trigger if exists erp_targets_touch on public.erp_targets;
create trigger erp_targets_touch before update on public.erp_targets
  for each row execute function public.erp_touch_updated_at();


-- ============================================================================
-- FILE: supabase/migrations/20260904000004_erp_billing_inventory.sql
-- ============================================================================
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


-- ============================================================================
-- FILE: supabase/migrations/20260904000005_erp_functions.sql
-- ============================================================================
-- ============================================================================
-- LEOMED PHARMA ERP — 5/6 · TRANSACTIONAL BUSINESS LOGIC
--
-- SECURITY MODEL — two deliberate categories:
--
--   SECURITY INVOKER (visits, field orders): the caller's own RLS policies
--   apply, so an MR physically cannot write a row they could not write
--   directly. Preferred wherever it works.
--
--   SECURITY DEFINER (billing, inventory): required because INSERT on
--   erp_inventory_transactions is granted to nobody — the ledger has exactly
--   one writer, these functions. Each therefore performs its OWN role check on
--   the first line, because DEFINER bypasses RLS.
--
-- Every money figure is computed here from quantity / rate / discount / GST.
-- Totals arriving from the client are ignored (spec §52, §62).
-- ============================================================================

-- ─── Duplicate detection (spec §44) ─────────────────────────────────────────
-- Called before an MR creates a new doctor/chemist so the master doesn't fill
-- up with "Dr. Rajesh Kumar" five times. Trigram similarity, not exact match.

create or replace function public.erp_find_similar_doctors(
  p_name  text,
  p_phone text default null,
  p_area  text default null
)
returns table (
  id uuid, doctor_code text, doctor_name text, specialization text,
  area text, city text, phone text, clinic_name text, match_score real
)
language sql
stable
set search_path = public
as $$
  select d.id, d.doctor_code, d.doctor_name, d.specialization,
         d.area, d.city, d.phone, d.clinic_name,
         least(1.0,
           greatest(
             similarity(d.doctor_name, coalesce(p_name, '')),
             -- Same phone number is as good as certain.
             case when p_phone is not null and d.phone = p_phone then 1.0 else 0 end
           )
           -- Same area nudges a near-match up the list; it never filters, since
           -- the same doctor may well be recorded under a different area.
           + case when p_area is not null and d.area ilike p_area then 0.15 else 0 end
         )::real as match_score
    from public.erp_doctors d
   where d.active
     and (
       (p_phone is not null and d.phone = p_phone)
       or similarity(d.doctor_name, coalesce(p_name, '')) > 0.3
     )
   order by match_score desc
   limit 8;
$$;

create or replace function public.erp_find_similar_chemists(
  p_name  text,
  p_phone text default null
)
returns table (
  id uuid, chemist_code text, chemist_name text, owner_name text,
  area text, city text, phone text, match_score real
)
language sql
stable
set search_path = public
as $$
  select c.id, c.chemist_code, c.chemist_name, c.owner_name,
         c.area, c.city, c.phone,
         greatest(
           similarity(c.chemist_name, coalesce(p_name, '')),
           case when p_phone is not null and c.phone = p_phone then 1.0 else 0 end
         )::real as match_score
    from public.erp_chemists c
   where c.active
     and (
       (p_phone is not null and c.phone = p_phone)
       or similarity(c.chemist_name, coalesce(p_name, '')) > 0.3
     )
   order by match_score desc
   limit 8;
$$;

-- ─── Closing the new-customer back-reference (D6) ───────────────────────────
-- A doctor created inside a visit points back at that visit, but the row must
-- exist before the visit does, so the link is set immediately afterwards.
--
-- These are SECURITY DEFINER for one narrow reason: the master UPDATE policy
-- allows a creator to edit only within the MR edit window, and an
-- administrator may legitimately set that window to zero — which would make
-- this final step of an atomic create silently write nothing, leaving a "new"
-- doctor with no originating visit. The whole surface of each function is one
-- column, on a row the caller just created, from a visit the caller owns, and
-- only while it is still unset.

create or replace function public.erp_link_doctor_to_visit(p_doctor uuid, p_visit uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.erp_doctor_visits v
     where v.id = p_visit
       and (v.mr_id = public.erp_current_user_id() or public.erp_is_admin())
  ) then
    raise exception 'That visit does not belong to you'
      using errcode = 'insufficient_privilege';
  end if;

  update public.erp_doctors
     set created_from_visit_id = p_visit
   where id = p_doctor
     and created_from_visit_id is null;
end;
$$;

create or replace function public.erp_link_chemist_to_visit(p_chemist uuid, p_visit uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.erp_chemist_visits v
     where v.id = p_visit
       and (v.mr_id = public.erp_current_user_id() or public.erp_is_admin())
  ) then
    raise exception 'That visit does not belong to you'
      using errcode = 'insufficient_privilege';
  end if;

  update public.erp_chemists
     set created_from_visit_id = p_visit
   where id = p_chemist
     and created_from_visit_id is null;
end;
$$;

-- ─── Doctor visit (one transaction, spec §18 §19 §20 §23) ───────────────────
-- Creates, atomically: an optional brand-new doctor, the visit, every product
-- discussed, an optional field order with its items, and an optional follow-up.
-- Either all of it lands or none of it does.

create or replace function public.erp_create_doctor_visit(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor      uuid;
  v_mr         uuid;
  v_doctor     uuid;
  v_visit      uuid;
  v_is_new     boolean := false;
  v_order      uuid;
  v_order_no   text;
  v_client_req uuid;
  v_new_doc    jsonb;
  v_item       jsonb;
  v_order_json jsonb;
begin
  v_actor := public.erp_current_user_id();
  if v_actor is null then
    raise exception 'Your account is not an active Leomed staff account'
      using errcode = 'insufficient_privilege';
  end if;

  -- An MR always files under their own name. Only an admin may file on behalf
  -- of someone else; RLS would reject anything else anyway.
  v_mr := v_actor;
  if (p_payload ? 'mr_id') and public.erp_is_admin() then
    v_mr := nullif(p_payload->>'mr_id', '')::uuid;
  end if;

  -- Idempotency (D11): a retried save returns the original visit untouched.
  v_client_req := nullif(p_payload->>'client_request_id', '')::uuid;
  if v_client_req is not null then
    select id into v_visit from public.erp_doctor_visits where client_request_id = v_client_req;
    if v_visit is not null then
      return jsonb_build_object('visit_id', v_visit, 'duplicate', true);
    end if;
  end if;

  -- 1. New doctor, or an existing one?
  v_new_doc := p_payload -> 'new_doctor';
  if v_new_doc is not null and jsonb_typeof(v_new_doc) = 'object' then
    -- doctor_code is left to its column default (erp_next_code) so there is
    -- one place that decides what a doctor code looks like.
    insert into public.erp_doctors (
      doctor_name, specialization, qualification, phone, email,
      address, city, area, territory, clinic_name, created_by, updated_by
    ) values (
      trim(v_new_doc->>'doctor_name'),
      nullif(v_new_doc->>'specialization', ''),
      nullif(v_new_doc->>'qualification', ''),
      nullif(v_new_doc->>'phone', ''),
      nullif(v_new_doc->>'email', ''),
      nullif(v_new_doc->>'address', ''),
      nullif(v_new_doc->>'city', ''),
      nullif(v_new_doc->>'area', ''),
      nullif(v_new_doc->>'territory', ''),
      nullif(v_new_doc->>'clinic_name', ''),
      v_actor, v_actor
    )
    returning id into v_doctor;
    v_is_new := true;
  else
    v_doctor := nullif(p_payload->>'doctor_id', '')::uuid;
    if v_doctor is null then
      raise exception 'Select an existing doctor or fill in the new-doctor details';
    end if;
  end if;

  -- 2. The visit. doctor_status is stamped now, not derived later from
  --    created_at — the spec is explicit that it must reflect the workflow.
  insert into public.erp_doctor_visits (
    doctor_id, mr_id, visit_date, visit_time, purpose, discussion, remarks,
    doctor_status, follow_up_required, follow_up_date, latitude, longitude,
    client_request_id, created_by, updated_by
  ) values (
    v_doctor, v_mr,
    coalesce(nullif(p_payload->>'visit_date', '')::date, current_date),
    nullif(p_payload->>'visit_time', '')::time,
    coalesce(nullif(p_payload->>'purpose', '')::public.erp_visit_purpose, 'PRODUCT_DETAILING'),
    nullif(p_payload->>'discussion', ''),
    nullif(p_payload->>'remarks', ''),
    case when v_is_new then 'NEW' else 'EXISTING' end::public.erp_doctor_status,
    coalesce((p_payload->>'follow_up_required')::boolean, false),
    nullif(p_payload->>'follow_up_date', '')::date,
    nullif(p_payload->>'latitude', '')::numeric,
    nullif(p_payload->>'longitude', '')::numeric,
    v_client_req, v_actor, v_actor
  )
  returning id into v_visit;

  -- 3. Close the loop on the new doctor (D6).
  if v_is_new then
    perform public.erp_link_doctor_to_visit(v_doctor, v_visit);
  end if;

  -- 4. Products discussed — many per visit.
  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'products', '[]'::jsonb))
  loop
    insert into public.erp_doctor_visit_products (
      visit_id, product_id, discussion_type, sample_quantity, remarks
    ) values (
      v_visit,
      (v_item->>'product_id')::uuid,
      coalesce(nullif(v_item->>'discussion_type', '')::public.erp_discussion_type, 'DETAILED'),
      coalesce((v_item->>'sample_quantity')::integer, 0),
      nullif(v_item->>'remarks', '')
    )
    on conflict (visit_id, product_id) do nothing;
  end loop;

  -- 5. Order received during the visit? This is a FIELD ORDER: a demand
  --    signal. It creates no sales invoice and moves no stock (spec §29).
  v_order_json := p_payload -> 'order';
  if v_order_json is not null and jsonb_typeof(v_order_json) = 'object'
     and coalesce((v_order_json->>'received')::boolean, false) then

    v_order_no := public.erp_next_document_number('field_order', 'FO');

    insert into public.erp_field_orders (
      order_number, customer_type, doctor_id, mr_id, doctor_visit_id,
      order_date, order_book_number, remarks, created_by, updated_by
    ) values (
      v_order_no, 'DOCTOR', v_doctor, v_mr, v_visit,
      coalesce(nullif(p_payload->>'visit_date', '')::date, current_date),
      nullif(v_order_json->>'order_book_number', ''),
      nullif(v_order_json->>'remarks', ''),
      v_actor, v_actor
    )
    returning id into v_order;

    for v_item in select * from jsonb_array_elements(coalesce(v_order_json->'items', '[]'::jsonb))
    loop
      insert into public.erp_field_order_items (
        field_order_id, product_id, quantity, unit, unit_rate, remarks
      )
      select v_order,
             p.id,
             (v_item->>'quantity')::integer,
             coalesce(nullif(v_item->>'unit', ''), p.unit),
             -- Snapshot of today's list rate. Indicative only (Q2).
             coalesce(nullif(v_item->>'unit_rate', '')::numeric, p.sale_rate),
             nullif(v_item->>'remarks', '')
        from public.erp_products p
       where p.id = (v_item->>'product_id')::uuid;
    end loop;

    if not exists (select 1 from public.erp_field_order_items where field_order_id = v_order) then
      raise exception 'An order was marked as received but has no product lines';
    end if;
  end if;

  -- 6. Follow-up.
  if coalesce((p_payload->>'follow_up_required')::boolean, false) then
    insert into public.erp_followups (
      mr_id, customer_type, doctor_id, doctor_visit_id, followup_date,
      description, priority, created_by
    ) values (
      v_mr, 'DOCTOR', v_doctor, v_visit,
      (p_payload->>'follow_up_date')::date,
      nullif(p_payload->>'follow_up_description', ''),
      coalesce(nullif(p_payload->>'follow_up_priority', '')::public.erp_followup_priority, 'MEDIUM'),
      v_actor
    );
  end if;

  return jsonb_build_object(
    'visit_id',      v_visit,
    'doctor_id',     v_doctor,
    'doctor_status', case when v_is_new then 'NEW' else 'EXISTING' end,
    'order_id',      v_order,
    'order_number',  v_order_no,
    'duplicate',     false
  );
end;
$$;

-- ─── Chemist visit (spec §24, §25) ──────────────────────────────────────────

create or replace function public.erp_create_chemist_visit(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor      uuid;
  v_mr         uuid;
  v_chemist    uuid;
  v_visit      uuid;
  v_is_new     boolean := false;
  v_order      uuid;
  v_order_no   text;
  v_client_req uuid;
  v_new_chem   jsonb;
  v_item       jsonb;
  v_order_json jsonb;
begin
  v_actor := public.erp_current_user_id();
  if v_actor is null then
    raise exception 'Your account is not an active Leomed staff account'
      using errcode = 'insufficient_privilege';
  end if;

  v_mr := v_actor;
  if (p_payload ? 'mr_id') and public.erp_is_admin() then
    v_mr := nullif(p_payload->>'mr_id', '')::uuid;
  end if;

  v_client_req := nullif(p_payload->>'client_request_id', '')::uuid;
  if v_client_req is not null then
    select id into v_visit from public.erp_chemist_visits where client_request_id = v_client_req;
    if v_visit is not null then
      return jsonb_build_object('visit_id', v_visit, 'duplicate', true);
    end if;
  end if;

  v_new_chem := p_payload -> 'new_chemist';
  if v_new_chem is not null and jsonb_typeof(v_new_chem) = 'object' then
    insert into public.erp_chemists (
      chemist_name, owner_name, phone, email, address, city,
      area, territory, gst_number, drug_license_number, created_by, updated_by
    ) values (
      trim(v_new_chem->>'chemist_name'),
      nullif(v_new_chem->>'owner_name', ''),
      nullif(v_new_chem->>'phone', ''),
      nullif(v_new_chem->>'email', ''),
      nullif(v_new_chem->>'address', ''),
      nullif(v_new_chem->>'city', ''),
      nullif(v_new_chem->>'area', ''),
      nullif(v_new_chem->>'territory', ''),
      nullif(v_new_chem->>'gst_number', ''),
      nullif(v_new_chem->>'drug_license_number', ''),
      v_actor, v_actor
    )
    returning id into v_chemist;
    v_is_new := true;
  else
    v_chemist := nullif(p_payload->>'chemist_id', '')::uuid;
    if v_chemist is null then
      raise exception 'Select an existing chemist or fill in the new-chemist details';
    end if;
  end if;

  insert into public.erp_chemist_visits (
    chemist_id, mr_id, visit_date, visit_time, purpose, discussion, remarks,
    follow_up_required, follow_up_date, latitude, longitude,
    client_request_id, created_by, updated_by
  ) values (
    v_chemist, v_mr,
    coalesce(nullif(p_payload->>'visit_date', '')::date, current_date),
    nullif(p_payload->>'visit_time', '')::time,
    coalesce(nullif(p_payload->>'purpose', '')::public.erp_visit_purpose, 'ORDER_COLLECTION'),
    nullif(p_payload->>'discussion', ''),
    nullif(p_payload->>'remarks', ''),
    coalesce((p_payload->>'follow_up_required')::boolean, false),
    nullif(p_payload->>'follow_up_date', '')::date,
    nullif(p_payload->>'latitude', '')::numeric,
    nullif(p_payload->>'longitude', '')::numeric,
    v_client_req, v_actor, v_actor
  )
  returning id into v_visit;

  if v_is_new then
    perform public.erp_link_chemist_to_visit(v_chemist, v_visit);
  end if;

  v_order_json := p_payload -> 'order';
  if v_order_json is not null and jsonb_typeof(v_order_json) = 'object'
     and coalesce((v_order_json->>'received')::boolean, false) then

    v_order_no := public.erp_next_document_number('field_order', 'FO');

    insert into public.erp_field_orders (
      order_number, customer_type, chemist_id, mr_id, chemist_visit_id,
      order_date, order_book_number, remarks, created_by, updated_by
    ) values (
      v_order_no, 'CHEMIST', v_chemist, v_mr, v_visit,
      coalesce(nullif(p_payload->>'visit_date', '')::date, current_date),
      nullif(v_order_json->>'order_book_number', ''),
      nullif(v_order_json->>'remarks', ''),
      v_actor, v_actor
    )
    returning id into v_order;

    for v_item in select * from jsonb_array_elements(coalesce(v_order_json->'items', '[]'::jsonb))
    loop
      insert into public.erp_field_order_items (
        field_order_id, product_id, quantity, unit, unit_rate, remarks
      )
      select v_order, p.id,
             (v_item->>'quantity')::integer,
             coalesce(nullif(v_item->>'unit', ''), p.unit),
             coalesce(nullif(v_item->>'unit_rate', '')::numeric, p.sale_rate),
             nullif(v_item->>'remarks', '')
        from public.erp_products p
       where p.id = (v_item->>'product_id')::uuid;
    end loop;

    if not exists (select 1 from public.erp_field_order_items where field_order_id = v_order) then
      raise exception 'An order was marked as received but has no product lines';
    end if;
  end if;

  if coalesce((p_payload->>'follow_up_required')::boolean, false) then
    insert into public.erp_followups (
      mr_id, customer_type, chemist_id, chemist_visit_id, followup_date,
      description, priority, created_by
    ) values (
      v_mr, 'CHEMIST', v_chemist, v_visit,
      (p_payload->>'follow_up_date')::date,
      nullif(p_payload->>'follow_up_description', ''),
      coalesce(nullif(p_payload->>'follow_up_priority', '')::public.erp_followup_priority, 'MEDIUM'),
      v_actor
    );
  end if;

  return jsonb_build_object(
    'visit_id',   v_visit,
    'chemist_id', v_chemist,
    'is_new',     v_is_new,
    'order_id',   v_order,
    'order_number', v_order_no,
    'duplicate',  false
  );
end;
$$;

-- ─── Purchase invoice → inventory IN (spec §27, §53) ────────────────────────

create or replace function public.erp_save_purchase_invoice(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid;
  v_invoice  uuid;
  v_item     jsonb;
  v_batch    uuid;
  v_date     date;
  v_gross    numeric(14,2);
  v_disc     numeric(14,2);
  v_taxable  numeric(14,2);
  v_tax      numeric(14,2);
  v_line     numeric(14,2);
  v_sum_gross numeric(14,2) := 0;
  v_sum_disc  numeric(14,2) := 0;
  v_sum_tax   numeric(14,2) := 0;
  v_sum_total numeric(14,2) := 0;
  v_qty      integer;
  v_free     integer;
begin
  -- DEFINER bypasses RLS, so authorisation is checked explicitly here.
  if not public.erp_can_write_billing() then
    raise exception 'Only an administrator or accountant may record purchases'
      using errcode = 'insufficient_privilege';
  end if;
  v_actor := public.erp_current_user_id();
  v_date  := coalesce(nullif(p_payload->>'invoice_date', '')::date, current_date);

  if jsonb_array_length(coalesce(p_payload->'items', '[]'::jsonb)) = 0 then
    raise exception 'A purchase invoice needs at least one product line';
  end if;

  insert into public.erp_purchase_invoices (
    invoice_number, supplier_id, invoice_date, is_interstate, remarks,
    amount_paid, created_by, updated_by
  ) values (
    trim(p_payload->>'invoice_number'),
    (p_payload->>'supplier_id')::uuid,
    v_date,
    coalesce((p_payload->>'is_interstate')::boolean, false),
    nullif(p_payload->>'remarks', ''),
    coalesce(nullif(p_payload->>'amount_paid', '')::numeric, 0),
    v_actor, v_actor
  )
  returning id into v_invoice;

  for v_item in select * from jsonb_array_elements(p_payload->'items')
  loop
    v_qty  := (v_item->>'quantity')::integer;
    v_free := coalesce((v_item->>'free_quantity')::integer, 0);

    -- Batch: reuse the supplier's batch number for this product, or open it.
    select id into v_batch
      from public.erp_product_batches
     where product_id = (v_item->>'product_id')::uuid
       and batch_number = trim(v_item->>'batch_number');

    if v_batch is null then
      insert into public.erp_product_batches (
        product_id, batch_number, manufacturing_date, expiry_date,
        mrp, purchase_rate, sale_rate, created_by
      ) values (
        (v_item->>'product_id')::uuid,
        trim(v_item->>'batch_number'),
        nullif(v_item->>'manufacturing_date', '')::date,
        (v_item->>'expiry_date')::date,
        coalesce(nullif(v_item->>'mrp', '')::numeric, 0),
        (v_item->>'purchase_rate')::numeric,
        coalesce(nullif(v_item->>'sale_rate', '')::numeric, 0),
        v_actor
      )
      returning id into v_batch;
    else
      -- Refresh commercial terms on a restock; quantity is never touched here.
      update public.erp_product_batches
         set mrp           = coalesce(nullif(v_item->>'mrp', '')::numeric, mrp),
             purchase_rate = (v_item->>'purchase_rate')::numeric,
             sale_rate     = coalesce(nullif(v_item->>'sale_rate', '')::numeric, sale_rate)
       where id = v_batch;
    end if;

    -- Money, computed here — never taken from the request.
    v_gross   := round(v_qty * (v_item->>'purchase_rate')::numeric, 2);
    v_disc    := round(v_gross * coalesce((v_item->>'discount_percent')::numeric, 0) / 100, 2);
    v_taxable := v_gross - v_disc;
    v_tax     := round(v_taxable * coalesce((v_item->>'gst_rate')::numeric, 0) / 100, 2);
    v_line    := v_taxable + v_tax;

    insert into public.erp_purchase_invoice_items (
      purchase_invoice_id, product_id, batch_id, quantity, free_quantity,
      purchase_rate, discount_percent, gst_rate, taxable_amount, tax_amount, line_total
    ) values (
      v_invoice, (v_item->>'product_id')::uuid, v_batch, v_qty, v_free,
      (v_item->>'purchase_rate')::numeric,
      coalesce((v_item->>'discount_percent')::numeric, 0),
      coalesce((v_item->>'gst_rate')::numeric, 0),
      v_taxable, v_tax, v_line
    );

    -- Stock in — free quantity is real stock even though it costs nothing.
    insert into public.erp_inventory_transactions (
      product_id, batch_id, transaction_type, reference_type, reference_id,
      quantity, unit_rate, transaction_date, remarks, created_by
    ) values (
      (v_item->>'product_id')::uuid, v_batch, 'PURCHASE', 'PURCHASE_INVOICE', v_invoice,
      v_qty + v_free, (v_item->>'purchase_rate')::numeric, v_date,
      'Purchase invoice ' || trim(p_payload->>'invoice_number'), v_actor
    );

    v_sum_gross := v_sum_gross + v_gross;
    v_sum_disc  := v_sum_disc  + v_disc;
    v_sum_tax   := v_sum_tax   + v_tax;
    v_sum_total := v_sum_total + v_line;
  end loop;

  update public.erp_purchase_invoices
     set subtotal = v_sum_gross, discount = v_sum_disc,
         tax = v_sum_tax, grand_total = v_sum_total
   where id = v_invoice;

  return jsonb_build_object(
    'invoice_id', v_invoice,
    'grand_total', v_sum_total,
    'subtotal', v_sum_gross,
    'tax', v_sum_tax
  );
end;
$$;

-- ─── Sales invoice → inventory OUT (spec §28, §53, §54) ─────────────────────

create or replace function public.erp_save_sales_invoice(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid;
  v_invoice  uuid;
  v_number   text;
  v_item     jsonb;
  v_date     date;
  v_batch    record;
  v_gross    numeric(14,2);
  v_disc     numeric(14,2);
  v_taxable  numeric(14,2);
  v_tax      numeric(14,2);
  v_line     numeric(14,2);
  v_sum_gross numeric(14,2) := 0;
  v_sum_disc  numeric(14,2) := 0;
  v_sum_tax   numeric(14,2) := 0;
  v_sum_total numeric(14,2) := 0;
  v_qty      integer;
  v_free     integer;
  v_allow_expired boolean;
begin
  if not public.erp_can_write_billing() then
    raise exception 'Only an administrator or accountant may raise sales invoices'
      using errcode = 'insufficient_privilege';
  end if;
  v_actor := public.erp_current_user_id();
  v_date  := coalesce(nullif(p_payload->>'invoice_date', '')::date, current_date);

  select allow_expired_sale into v_allow_expired from public.erp_settings where id = 1;

  if jsonb_array_length(coalesce(p_payload->'items', '[]'::jsonb)) = 0 then
    raise exception 'A sales invoice needs at least one product line';
  end if;

  v_number := coalesce(
    nullif(p_payload->>'invoice_number', ''),
    public.erp_next_document_number('sales_invoice', 'INV', v_date)
  );

  insert into public.erp_sales_invoices (
    invoice_number, distributor_id, invoice_date, is_interstate, remarks,
    amount_paid, created_by, updated_by
  ) values (
    v_number,
    (p_payload->>'distributor_id')::uuid,
    v_date,
    coalesce((p_payload->>'is_interstate')::boolean, false),
    nullif(p_payload->>'remarks', ''),
    coalesce(nullif(p_payload->>'amount_paid', '')::numeric, 0),
    v_actor, v_actor
  )
  returning id into v_invoice;

  for v_item in select * from jsonb_array_elements(p_payload->'items')
  loop
    v_qty  := (v_item->>'quantity')::integer;
    v_free := coalesce((v_item->>'free_quantity')::integer, 0);

    -- Lock the batch for the rest of the transaction so two concurrent
    -- invoices cannot both pass the availability check on the same stock.
    select b.id, b.batch_number, b.current_quantity, b.expiry_date, p.product_name
      into v_batch
      from public.erp_product_batches b
      join public.erp_products p on p.id = b.product_id
     where b.id = (v_item->>'batch_id')::uuid
     for update of b;

    if not found then
      raise exception 'Batch % not found', v_item->>'batch_id';
    end if;

    if v_batch.expiry_date < v_date and not coalesce(v_allow_expired, false) then
      raise exception 'Batch % of % expired on % and cannot be sold',
        v_batch.batch_number, v_batch.product_name, to_char(v_batch.expiry_date, 'DD Mon YYYY')
        using errcode = 'check_violation';
    end if;

    if v_batch.current_quantity < (v_qty + v_free) then
      raise exception 'Only % units of % (batch %) in stock — % requested',
        v_batch.current_quantity, v_batch.product_name, v_batch.batch_number, v_qty + v_free
        using errcode = 'check_violation';
    end if;

    v_gross   := round(v_qty * (v_item->>'sale_rate')::numeric, 2);
    v_disc    := round(v_gross * coalesce((v_item->>'discount_percent')::numeric, 0) / 100, 2);
    v_taxable := v_gross - v_disc;
    v_tax     := round(v_taxable * coalesce((v_item->>'gst_rate')::numeric, 0) / 100, 2);
    v_line    := v_taxable + v_tax;

    insert into public.erp_sales_invoice_items (
      sales_invoice_id, product_id, batch_id, quantity, free_quantity,
      sale_rate, discount_percent, gst_rate, taxable_amount, tax_amount, line_total
    ) values (
      v_invoice, (v_item->>'product_id')::uuid, v_batch.id, v_qty, v_free,
      (v_item->>'sale_rate')::numeric,
      coalesce((v_item->>'discount_percent')::numeric, 0),
      coalesce((v_item->>'gst_rate')::numeric, 0),
      v_taxable, v_tax, v_line
    );

    insert into public.erp_inventory_transactions (
      product_id, batch_id, transaction_type, reference_type, reference_id,
      quantity, unit_rate, transaction_date, remarks, created_by
    ) values (
      (v_item->>'product_id')::uuid, v_batch.id, 'SALE', 'SALES_INVOICE', v_invoice,
      -(v_qty + v_free), (v_item->>'sale_rate')::numeric, v_date,
      'Sales invoice ' || v_number, v_actor
    );

    v_sum_gross := v_sum_gross + v_gross;
    v_sum_disc  := v_sum_disc  + v_disc;
    v_sum_tax   := v_sum_tax   + v_tax;
    v_sum_total := v_sum_total + v_line;
  end loop;

  update public.erp_sales_invoices
     set subtotal = v_sum_gross, discount = v_sum_disc,
         tax = v_sum_tax, grand_total = v_sum_total
   where id = v_invoice;

  return jsonb_build_object(
    'invoice_id', v_invoice,
    'invoice_number', v_number,
    'grand_total', v_sum_total,
    'subtotal', v_sum_gross,
    'tax', v_sum_tax
  );
end;
$$;

-- ─── Manual inventory adjustment (spec §16) ─────────────────────────────────
-- The only other writer of the ledger. Quantity is a magnitude; direction comes
-- from the transaction type, so an "IN" can never silently remove stock.

create or replace function public.erp_adjust_inventory(
  p_batch_id uuid,
  p_type     public.erp_inventory_txn_type,
  p_quantity integer,
  p_remarks  text,
  p_date     date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid;
  v_product uuid;
  v_signed  integer;
  v_txn     uuid;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may adjust inventory'
      using errcode = 'insufficient_privilege';
  end if;
  v_actor := public.erp_current_user_id();

  if p_type not in ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRY', 'OPENING',
                    'SALE_RETURN', 'PURCHASE_RETURN') then
    raise exception 'Transaction type % is produced by billing, not by manual adjustment', p_type;
  end if;

  if p_quantity <= 0 then
    raise exception 'Enter the number of units to adjust as a positive figure';
  end if;

  if p_remarks is null or length(trim(p_remarks)) = 0 then
    raise exception 'A reason is required for every stock adjustment';
  end if;

  select product_id into v_product from public.erp_product_batches where id = p_batch_id;
  if v_product is null then
    raise exception 'Batch % not found', p_batch_id;
  end if;

  v_signed := case
    when p_type in ('ADJUSTMENT_IN', 'OPENING', 'SALE_RETURN') then  p_quantity
    else -p_quantity
  end;

  insert into public.erp_inventory_transactions (
    product_id, batch_id, transaction_type, reference_type, reference_id,
    quantity, transaction_date, remarks, created_by
  ) values (
    v_product, p_batch_id, p_type,
    case when p_type = 'OPENING' then 'OPENING' else 'ADJUSTMENT' end,
    null, v_signed, p_date, trim(p_remarks), v_actor
  )
  returning id into v_txn;

  return v_txn;
end;
$$;

-- ─── Field order status (spec §26) ──────────────────────────────────────────
-- Status is a demand-tracking label. Marking one FULFILLED records that the
-- distributor network served it — it never creates a Leomed sales invoice.

create or replace function public.erp_set_field_order_status(
  p_order_id uuid,
  p_status   public.erp_field_order_status,
  p_remarks  text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.erp_field_orders
     set status     = p_status,
         remarks    = coalesce(nullif(trim(coalesce(p_remarks, '')), ''), remarks),
         updated_by = public.erp_current_user_id()
   where id = p_order_id;

  if not found then
    raise exception 'Field order not found, or you do not have access to it';
  end if;
end;
$$;

-- ─── Grants ─────────────────────────────────────────────────────────────────

revoke all on function public.erp_create_doctor_visit(jsonb)   from public;
revoke all on function public.erp_create_chemist_visit(jsonb)  from public;
revoke all on function public.erp_save_purchase_invoice(jsonb) from public;
revoke all on function public.erp_save_sales_invoice(jsonb)    from public;
revoke all on function public.erp_adjust_inventory(uuid, public.erp_inventory_txn_type, integer, text, date) from public;
revoke all on function public.erp_set_field_order_status(uuid, public.erp_field_order_status, text) from public;
revoke all on function public.erp_find_similar_doctors(text, text, text) from public;
revoke all on function public.erp_find_similar_chemists(text, text)      from public;
revoke all on function public.erp_link_doctor_to_visit(uuid, uuid)       from public;
revoke all on function public.erp_link_chemist_to_visit(uuid, uuid)      from public;

grant execute on function public.erp_create_doctor_visit(jsonb)   to authenticated;
grant execute on function public.erp_create_chemist_visit(jsonb)  to authenticated;
grant execute on function public.erp_save_purchase_invoice(jsonb) to authenticated;
grant execute on function public.erp_save_sales_invoice(jsonb)    to authenticated;
grant execute on function public.erp_adjust_inventory(uuid, public.erp_inventory_txn_type, integer, text, date) to authenticated;
grant execute on function public.erp_set_field_order_status(uuid, public.erp_field_order_status, text) to authenticated;
grant execute on function public.erp_find_similar_doctors(text, text, text) to authenticated;
grant execute on function public.erp_find_similar_chemists(text, text)      to authenticated;
grant execute on function public.erp_link_doctor_to_visit(uuid, uuid)       to authenticated;
grant execute on function public.erp_link_chemist_to_visit(uuid, uuid)      to authenticated;

-- Needed by the SECURITY INVOKER visit functions above.
grant execute on function public.erp_next_document_number(text, text, date) to authenticated;
grant execute on function public.erp_next_code(text, text)                  to authenticated;


-- ============================================================================
-- FILE: supabase/migrations/20260904000006_erp_rls.sql
-- ============================================================================
-- ============================================================================
-- LEOMED PHARMA ERP — 6/6 · GRANTS & ROW LEVEL SECURITY
--
-- Two independent layers, both required:
--   GRANTS decide which VERBS a role may attempt, and on which COLUMNS.
--   POLICIES decide which ROWS those verbs may touch.
-- A missing grant produces "permission denied"; a missing policy silently
-- returns nothing. Both are spelled out below for every table.
--
-- Hiding a menu item is not security (spec §36). Every rule here holds even if
-- a request is made straight against PostgREST with a stolen anon key.
-- ============================================================================

alter table public.erp_users                  enable row level security;
alter table public.erp_settings               enable row level security;
alter table public.erp_audit_logs             enable row level security;
alter table public.erp_document_counters      enable row level security;
alter table public.erp_doctors                enable row level security;
alter table public.erp_chemists               enable row level security;
alter table public.erp_distributors           enable row level security;
alter table public.erp_suppliers              enable row level security;
alter table public.erp_products               enable row level security;
alter table public.erp_product_batches        enable row level security;
alter table public.erp_doctor_visits          enable row level security;
alter table public.erp_chemist_visits         enable row level security;
alter table public.erp_doctor_visit_products  enable row level security;
alter table public.erp_field_orders           enable row level security;
alter table public.erp_field_order_items      enable row level security;
alter table public.erp_followups              enable row level security;
alter table public.erp_targets                enable row level security;
alter table public.erp_purchase_invoices      enable row level security;
alter table public.erp_purchase_invoice_items enable row level security;
alter table public.erp_sales_invoices         enable row level security;
alter table public.erp_sales_invoice_items    enable row level security;
alter table public.erp_inventory_transactions enable row level security;

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Nothing in the ERP is public. anon gets no access at all.
revoke all on public.erp_users, public.erp_settings, public.erp_audit_logs,
              public.erp_document_counters, public.erp_doctors, public.erp_chemists,
              public.erp_distributors, public.erp_suppliers, public.erp_products,
              public.erp_product_batches, public.erp_doctor_visits, public.erp_chemist_visits,
              public.erp_doctor_visit_products, public.erp_field_orders,
              public.erp_field_order_items, public.erp_followups, public.erp_targets,
              public.erp_purchase_invoices, public.erp_purchase_invoice_items,
              public.erp_sales_invoices, public.erp_sales_invoice_items,
              public.erp_inventory_transactions
  from anon;

grant select on public.erp_settings to authenticated;
grant update on public.erp_settings to authenticated;

grant select, insert, update on public.erp_users        to authenticated;
grant select                 on public.erp_audit_logs   to authenticated;

-- No DELETE anywhere in the master data: records with visit history are
-- deactivated, not removed (spec §34).
grant select, insert, update         on public.erp_doctors      to authenticated;
grant select, insert, update         on public.erp_chemists     to authenticated;
grant select, insert, update         on public.erp_distributors to authenticated;
grant select, insert, update         on public.erp_suppliers    to authenticated;
grant select, insert, update         on public.erp_products      to authenticated;

-- Column-scoped on purpose: current_quantity and opening_quantity are owned by
-- the ledger trigger. No app role can write a stock number by any route (D5).
grant select on public.erp_product_batches to authenticated;
grant insert (product_id, batch_number, manufacturing_date, expiry_date,
              mrp, purchase_rate, sale_rate, created_by)
  on public.erp_product_batches to authenticated;
grant update (batch_number, manufacturing_date, expiry_date,
              mrp, purchase_rate, sale_rate)
  on public.erp_product_batches to authenticated;

grant select, insert, update, delete on public.erp_doctor_visits         to authenticated;
grant select, insert, update, delete on public.erp_chemist_visits        to authenticated;
grant select, insert, update, delete on public.erp_doctor_visit_products to authenticated;
grant select, insert, update, delete on public.erp_field_orders          to authenticated;
grant select, insert, update, delete on public.erp_field_order_items     to authenticated;
grant select, insert, update, delete on public.erp_followups             to authenticated;
grant select, insert, update, delete on public.erp_targets               to authenticated;

-- Invoices are created by erp_save_*_invoice(), which runs as the table owner.
-- Direct UPDATE exists only to record a payment or fix a note — never to
-- restate a total, so the money columns are not grantable (spec §52).
grant select on public.erp_purchase_invoices to authenticated;
grant select on public.erp_sales_invoices    to authenticated;
grant update (amount_paid, remarks, updated_by) on public.erp_purchase_invoices to authenticated;
grant update (amount_paid, remarks, updated_by) on public.erp_sales_invoices    to authenticated;
grant select on public.erp_purchase_invoice_items to authenticated;
grant select on public.erp_sales_invoice_items    to authenticated;

-- The ledger has exactly one writer: the SECURITY DEFINER functions. No INSERT,
-- UPDATE or DELETE grant is issued to anybody (spec §15).
grant select on public.erp_inventory_transactions to authenticated;

-- erp_document_counters gets no grants at all — number issuing is a DB concern.

-- ============================================================================
-- POLICIES — staff directory
-- ============================================================================

drop policy if exists erp_users_select on public.erp_users;
create policy erp_users_select on public.erp_users
  for select to authenticated
  using (auth_user_id = auth.uid() or public.erp_is_admin() or public.erp_can_read_all_field());

drop policy if exists erp_users_insert on public.erp_users;
create policy erp_users_insert on public.erp_users
  for insert to authenticated
  with check (public.erp_is_admin());

drop policy if exists erp_users_update on public.erp_users;
create policy erp_users_update on public.erp_users
  for update to authenticated
  using (public.erp_is_admin() or auth_user_id = auth.uid())
  with check (public.erp_is_admin() or auth_user_id = auth.uid());
-- No DELETE policy: staff are deactivated, never deleted, so history survives.

-- Belt to the policy's braces: without this a non-admin could edit their own
-- row and promote themselves to ADMIN, since the policy above lets them write it.
create or replace function public.erp_guard_user_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.erp_is_admin() then
    return new;
  end if;

  if new.role         is distinct from old.role
     or new.active       is distinct from old.active
     or new.mr_code      is distinct from old.mr_code
     or new.territory    is distinct from old.territory
     or new.reports_to   is distinct from old.reports_to
     or new.auth_user_id is distinct from old.auth_user_id
     or new.email        is distinct from old.email
  then
    raise exception 'Only an administrator can change role, MR code, territory, email or account status'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists erp_users_self_update_guard on public.erp_users;
create trigger erp_users_self_update_guard
  before update on public.erp_users
  for each row execute function public.erp_guard_user_self_update();

-- ============================================================================
-- POLICIES — settings & audit
-- ============================================================================

drop policy if exists erp_settings_select on public.erp_settings;
create policy erp_settings_select on public.erp_settings
  for select to authenticated using (public.erp_is_staff());

drop policy if exists erp_settings_update on public.erp_settings;
create policy erp_settings_update on public.erp_settings
  for update to authenticated using (public.erp_is_admin()) with check (public.erp_is_admin());

drop policy if exists erp_audit_select on public.erp_audit_logs;
create policy erp_audit_select on public.erp_audit_logs
  for select to authenticated using (public.erp_is_admin());
-- Writes come only from the audit trigger, which runs as the table owner.

-- ============================================================================
-- POLICIES — customer masters
-- Shared company records. Any staff member may read and search them; MRs may
-- add new ones (that is the whole point of the visit workflow) but may not
-- rewrite records other people created (spec §10, §11, §34).
-- ============================================================================

drop policy if exists erp_doctors_select on public.erp_doctors;
create policy erp_doctors_select on public.erp_doctors
  for select to authenticated using (public.erp_is_staff());

drop policy if exists erp_doctors_insert on public.erp_doctors;
create policy erp_doctors_insert on public.erp_doctors
  for insert to authenticated
  with check (public.erp_is_admin() or public.erp_current_role() = 'MR');

drop policy if exists erp_doctors_update on public.erp_doctors;
create policy erp_doctors_update on public.erp_doctors
  for update to authenticated
  using (
    public.erp_is_admin()
    or (created_by = public.erp_current_user_id() and public.erp_within_edit_window(created_at))
  )
  with check (
    public.erp_is_admin()
    or (created_by = public.erp_current_user_id() and public.erp_within_edit_window(created_at))
  );
-- No DELETE policy: deactivate instead, so visit history keeps its subject.

drop policy if exists erp_chemists_select on public.erp_chemists;
create policy erp_chemists_select on public.erp_chemists
  for select to authenticated using (public.erp_is_staff());

drop policy if exists erp_chemists_insert on public.erp_chemists;
create policy erp_chemists_insert on public.erp_chemists
  for insert to authenticated
  with check (public.erp_is_admin() or public.erp_current_role() = 'MR');

drop policy if exists erp_chemists_update on public.erp_chemists;
create policy erp_chemists_update on public.erp_chemists
  for update to authenticated
  using (
    public.erp_is_admin()
    or (created_by = public.erp_current_user_id() and public.erp_within_edit_window(created_at))
  )
  with check (
    public.erp_is_admin()
    or (created_by = public.erp_current_user_id() and public.erp_within_edit_window(created_at))
  );

-- ============================================================================
-- POLICIES — trade partners
-- Distributors are visible to the whole field force (an MR may need to know who
-- serves an area). Suppliers are a purchasing concern only.
-- ============================================================================

drop policy if exists erp_distributors_select on public.erp_distributors;
create policy erp_distributors_select on public.erp_distributors
  for select to authenticated using (public.erp_is_staff());

drop policy if exists erp_distributors_write on public.erp_distributors;
create policy erp_distributors_write on public.erp_distributors
  for insert to authenticated with check (public.erp_can_write_billing());

drop policy if exists erp_distributors_update on public.erp_distributors;
create policy erp_distributors_update on public.erp_distributors
  for update to authenticated
  using (public.erp_can_write_billing()) with check (public.erp_can_write_billing());

drop policy if exists erp_suppliers_select on public.erp_suppliers;
create policy erp_suppliers_select on public.erp_suppliers
  for select to authenticated using (public.erp_can_read_billing());

drop policy if exists erp_suppliers_write on public.erp_suppliers;
create policy erp_suppliers_write on public.erp_suppliers
  for insert to authenticated with check (public.erp_can_write_billing());

drop policy if exists erp_suppliers_update on public.erp_suppliers;
create policy erp_suppliers_update on public.erp_suppliers
  for update to authenticated
  using (public.erp_can_write_billing()) with check (public.erp_can_write_billing());

-- ============================================================================
-- POLICIES — product master & batches
-- MRs must be able to pick products; only admins may define them (spec §13).
-- ============================================================================

drop policy if exists erp_products_select on public.erp_products;
create policy erp_products_select on public.erp_products
  for select to authenticated using (public.erp_is_staff());

drop policy if exists erp_products_insert on public.erp_products;
create policy erp_products_insert on public.erp_products
  for insert to authenticated with check (public.erp_is_admin());

drop policy if exists erp_products_update on public.erp_products;
create policy erp_products_update on public.erp_products
  for update to authenticated
  using (public.erp_is_admin()) with check (public.erp_is_admin());

drop policy if exists erp_batches_select on public.erp_product_batches;
create policy erp_batches_select on public.erp_product_batches
  for select to authenticated using (public.erp_is_staff());

drop policy if exists erp_batches_insert on public.erp_product_batches;
create policy erp_batches_insert on public.erp_product_batches
  for insert to authenticated with check (public.erp_can_write_billing());

drop policy if exists erp_batches_update on public.erp_product_batches;
create policy erp_batches_update on public.erp_product_batches
  for update to authenticated
  using (public.erp_can_write_billing()) with check (public.erp_can_write_billing());

-- ============================================================================
-- POLICIES — visits
-- An MR sees and files their own work. The WITH CHECK on insert is what makes
-- MR identity unforgeable: crafting a request with someone else's mr_id is
-- rejected by the database, not merely by the form (spec §36).
-- ============================================================================

drop policy if exists erp_doctor_visits_select on public.erp_doctor_visits;
create policy erp_doctor_visits_select on public.erp_doctor_visits
  for select to authenticated
  using (mr_id = public.erp_current_user_id() or public.erp_can_read_all_field());

drop policy if exists erp_doctor_visits_insert on public.erp_doctor_visits;
create policy erp_doctor_visits_insert on public.erp_doctor_visits
  for insert to authenticated
  with check (mr_id = public.erp_current_user_id() or public.erp_is_admin());

drop policy if exists erp_doctor_visits_update on public.erp_doctor_visits;
create policy erp_doctor_visits_update on public.erp_doctor_visits
  for update to authenticated
  using (
    public.erp_is_admin()
    or (mr_id = public.erp_current_user_id() and public.erp_within_edit_window(created_at))
  )
  with check (mr_id = public.erp_current_user_id() or public.erp_is_admin());

drop policy if exists erp_doctor_visits_delete on public.erp_doctor_visits;
create policy erp_doctor_visits_delete on public.erp_doctor_visits
  for delete to authenticated using (public.erp_is_admin());

drop policy if exists erp_chemist_visits_select on public.erp_chemist_visits;
create policy erp_chemist_visits_select on public.erp_chemist_visits
  for select to authenticated
  using (mr_id = public.erp_current_user_id() or public.erp_can_read_all_field());

drop policy if exists erp_chemist_visits_insert on public.erp_chemist_visits;
create policy erp_chemist_visits_insert on public.erp_chemist_visits
  for insert to authenticated
  with check (mr_id = public.erp_current_user_id() or public.erp_is_admin());

drop policy if exists erp_chemist_visits_update on public.erp_chemist_visits;
create policy erp_chemist_visits_update on public.erp_chemist_visits
  for update to authenticated
  using (
    public.erp_is_admin()
    or (mr_id = public.erp_current_user_id() and public.erp_within_edit_window(created_at))
  )
  with check (mr_id = public.erp_current_user_id() or public.erp_is_admin());

drop policy if exists erp_chemist_visits_delete on public.erp_chemist_visits;
create policy erp_chemist_visits_delete on public.erp_chemist_visits
  for delete to authenticated using (public.erp_is_admin());

-- Visit line items inherit their parent's visibility exactly.
drop policy if exists erp_visit_products_select on public.erp_doctor_visit_products;
create policy erp_visit_products_select on public.erp_doctor_visit_products
  for select to authenticated
  using (exists (
    select 1 from public.erp_doctor_visits v
     where v.id = visit_id
       and (v.mr_id = public.erp_current_user_id() or public.erp_can_read_all_field())
  ));

drop policy if exists erp_visit_products_write on public.erp_doctor_visit_products;
create policy erp_visit_products_write on public.erp_doctor_visit_products
  for insert to authenticated
  with check (exists (
    select 1 from public.erp_doctor_visits v
     where v.id = visit_id
       and (v.mr_id = public.erp_current_user_id() or public.erp_is_admin())
  ));

drop policy if exists erp_visit_products_update on public.erp_doctor_visit_products;
create policy erp_visit_products_update on public.erp_doctor_visit_products
  for update to authenticated
  using (exists (
    select 1 from public.erp_doctor_visits v
     where v.id = visit_id
       and (public.erp_is_admin()
            or (v.mr_id = public.erp_current_user_id() and public.erp_within_edit_window(v.created_at)))
  ));

drop policy if exists erp_visit_products_delete on public.erp_doctor_visit_products;
create policy erp_visit_products_delete on public.erp_doctor_visit_products
  for delete to authenticated
  using (exists (
    select 1 from public.erp_doctor_visits v
     where v.id = visit_id
       and (public.erp_is_admin()
            or (v.mr_id = public.erp_current_user_id() and public.erp_within_edit_window(v.created_at)))
  ));

-- ============================================================================
-- POLICIES — field orders
-- ============================================================================

drop policy if exists erp_field_orders_select on public.erp_field_orders;
create policy erp_field_orders_select on public.erp_field_orders
  for select to authenticated
  using (mr_id = public.erp_current_user_id() or public.erp_can_read_all_field());

drop policy if exists erp_field_orders_insert on public.erp_field_orders;
create policy erp_field_orders_insert on public.erp_field_orders
  for insert to authenticated
  with check (mr_id = public.erp_current_user_id() or public.erp_is_admin());

-- Admins and managers move orders through the fulfilment statuses; an MR may
-- still correct their own paperwork inside the edit window.
drop policy if exists erp_field_orders_update on public.erp_field_orders;
create policy erp_field_orders_update on public.erp_field_orders
  for update to authenticated
  using (
    public.erp_can_read_all_field()
    or (mr_id = public.erp_current_user_id() and public.erp_within_edit_window(created_at))
  );

drop policy if exists erp_field_orders_delete on public.erp_field_orders;
create policy erp_field_orders_delete on public.erp_field_orders
  for delete to authenticated using (public.erp_is_admin());

drop policy if exists erp_field_order_items_select on public.erp_field_order_items;
create policy erp_field_order_items_select on public.erp_field_order_items
  for select to authenticated
  using (exists (
    select 1 from public.erp_field_orders o
     where o.id = field_order_id
       and (o.mr_id = public.erp_current_user_id() or public.erp_can_read_all_field())
  ));

drop policy if exists erp_field_order_items_insert on public.erp_field_order_items;
create policy erp_field_order_items_insert on public.erp_field_order_items
  for insert to authenticated
  with check (exists (
    select 1 from public.erp_field_orders o
     where o.id = field_order_id
       and (o.mr_id = public.erp_current_user_id() or public.erp_is_admin())
  ));

drop policy if exists erp_field_order_items_update on public.erp_field_order_items;
create policy erp_field_order_items_update on public.erp_field_order_items
  for update to authenticated
  using (exists (
    select 1 from public.erp_field_orders o
     where o.id = field_order_id
       and (public.erp_is_admin()
            or (o.mr_id = public.erp_current_user_id() and public.erp_within_edit_window(o.created_at)))
  ));

drop policy if exists erp_field_order_items_delete on public.erp_field_order_items;
create policy erp_field_order_items_delete on public.erp_field_order_items
  for delete to authenticated
  using (exists (
    select 1 from public.erp_field_orders o
     where o.id = field_order_id
       and (public.erp_is_admin()
            or (o.mr_id = public.erp_current_user_id() and public.erp_within_edit_window(o.created_at)))
  ));

-- ============================================================================
-- POLICIES — follow-ups & targets
-- ============================================================================

drop policy if exists erp_followups_select on public.erp_followups;
create policy erp_followups_select on public.erp_followups
  for select to authenticated
  using (mr_id = public.erp_current_user_id() or public.erp_can_read_all_field());

drop policy if exists erp_followups_insert on public.erp_followups;
create policy erp_followups_insert on public.erp_followups
  for insert to authenticated
  with check (mr_id = public.erp_current_user_id() or public.erp_is_admin());

-- No edit window here: closing a follow-up weeks later is the normal workflow.
drop policy if exists erp_followups_update on public.erp_followups;
create policy erp_followups_update on public.erp_followups
  for update to authenticated
  using (mr_id = public.erp_current_user_id() or public.erp_is_admin())
  with check (mr_id = public.erp_current_user_id() or public.erp_is_admin());

drop policy if exists erp_followups_delete on public.erp_followups;
create policy erp_followups_delete on public.erp_followups
  for delete to authenticated using (public.erp_is_admin());

drop policy if exists erp_targets_select on public.erp_targets;
create policy erp_targets_select on public.erp_targets
  for select to authenticated
  using (mr_id = public.erp_current_user_id() or public.erp_can_read_all_field());

drop policy if exists erp_targets_insert on public.erp_targets;
create policy erp_targets_insert on public.erp_targets
  for insert to authenticated with check (public.erp_is_admin());

drop policy if exists erp_targets_update on public.erp_targets;
create policy erp_targets_update on public.erp_targets
  for update to authenticated
  using (public.erp_is_admin()) with check (public.erp_is_admin());

drop policy if exists erp_targets_delete on public.erp_targets;
create policy erp_targets_delete on public.erp_targets
  for delete to authenticated using (public.erp_is_admin());

-- ============================================================================
-- POLICIES — billing
-- MRs are absent from every policy here by design: field staff have no business
-- reading company invoices or margins (spec §5).
-- ============================================================================

drop policy if exists erp_purchase_invoices_select on public.erp_purchase_invoices;
create policy erp_purchase_invoices_select on public.erp_purchase_invoices
  for select to authenticated using (public.erp_can_read_billing());

drop policy if exists erp_purchase_invoices_update on public.erp_purchase_invoices;
create policy erp_purchase_invoices_update on public.erp_purchase_invoices
  for update to authenticated
  using (public.erp_is_admin() or (public.erp_can_write_billing() and payment_status <> 'PAID'))
  with check (public.erp_can_write_billing());

drop policy if exists erp_purchase_items_select on public.erp_purchase_invoice_items;
create policy erp_purchase_items_select on public.erp_purchase_invoice_items
  for select to authenticated using (public.erp_can_read_billing());

drop policy if exists erp_sales_invoices_select on public.erp_sales_invoices;
create policy erp_sales_invoices_select on public.erp_sales_invoices
  for select to authenticated using (public.erp_can_read_billing());

drop policy if exists erp_sales_invoices_update on public.erp_sales_invoices;
create policy erp_sales_invoices_update on public.erp_sales_invoices
  for update to authenticated
  using (public.erp_is_admin() or (public.erp_can_write_billing() and payment_status <> 'PAID'))
  with check (public.erp_can_write_billing());

drop policy if exists erp_sales_items_select on public.erp_sales_invoice_items;
create policy erp_sales_items_select on public.erp_sales_invoice_items
  for select to authenticated using (public.erp_can_read_billing());

-- ============================================================================
-- POLICIES — inventory ledger
-- Readable by the money roles; writable through erp_save_*_invoice() and
-- erp_adjust_inventory() alone. There is deliberately no INSERT policy: even
-- with a grant, no direct write would pass.
-- ============================================================================

drop policy if exists erp_inventory_select on public.erp_inventory_transactions;
create policy erp_inventory_select on public.erp_inventory_transactions
  for select to authenticated using (public.erp_can_read_billing());

-- ============================================================================
-- Service role — mirrors 20260724000002 so ERP admin tooling keeps working.
-- ============================================================================

grant usage on schema public to service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;


-- ============================================================================
-- FILE: supabase/migrations/20260904000007_erp_reporting.sql
-- ============================================================================
-- ============================================================================
-- LEOMED PHARMA ERP — 7 · REPORTING
--
-- Dashboards and reports are aggregate questions, so they are answered in
-- PostgreSQL and return one small row set each. The alternative — pulling
-- visits, orders and invoices into Node to count them — is exactly what spec
-- §55 rules out.
--
-- Every function here is SECURITY INVOKER: RLS applies to the caller, so the
-- same function returns company-wide numbers to an admin and only their own to
-- an MR, with no role checks written into the SQL.
-- ============================================================================

-- ─── Owner / admin dashboard ────────────────────────────────────────────────

create or replace function public.erp_dashboard_summary(
  p_from      date,
  p_to        date,
  p_mr        uuid default null,
  p_territory text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with doctor_visits as (
    select v.id, v.doctor_status
      from public.erp_doctor_visits v
      join public.erp_users u on u.id = v.mr_id
     where v.visit_date between p_from and p_to
       and (p_mr is null or v.mr_id = p_mr)
       and (p_territory is null or u.territory = p_territory)
  ),
  chemist_visits as (
    select v.id
      from public.erp_chemist_visits v
      join public.erp_users u on u.id = v.mr_id
     where v.visit_date between p_from and p_to
       and (p_mr is null or v.mr_id = p_mr)
       and (p_territory is null or u.territory = p_territory)
  ),
  field_orders as (
    select o.id, o.estimated_value, o.customer_type
      from public.erp_field_orders o
      join public.erp_users u on u.id = o.mr_id
     where o.order_date between p_from and p_to
       and (p_mr is null or o.mr_id = p_mr)
       and (p_territory is null or u.territory = p_territory)
  ),
  -- Company sales and purchases are not attributable to an MR or a territory,
  -- so those filters deliberately do not apply to them.
  sales as (
    select grand_total, amount_paid
      from public.erp_sales_invoices
     where invoice_date between p_from and p_to
  ),
  purchases as (
    select grand_total
      from public.erp_purchase_invoices
     where invoice_date between p_from and p_to
  )
  select jsonb_build_object(
    'doctor_visits',      (select count(*) from doctor_visits),
    'new_doctors',        (select count(*) from doctor_visits where doctor_status = 'NEW'),
    'existing_doctors',   (select count(*) from doctor_visits where doctor_status = 'EXISTING'),
    'chemist_visits',     (select count(*) from chemist_visits),
    'field_orders',       (select count(*) from field_orders),
    'field_order_value',  (select coalesce(sum(estimated_value), 0) from field_orders),
    'doctor_orders',      (select count(*) from field_orders where customer_type = 'DOCTOR'),
    'chemist_orders',     (select count(*) from field_orders where customer_type = 'CHEMIST'),
    'sales_count',        (select count(*) from sales),
    'sales_value',        (select coalesce(sum(grand_total), 0) from sales),
    'sales_outstanding',  (select coalesce(sum(grand_total - amount_paid), 0) from sales),
    'purchase_count',     (select count(*) from purchases),
    'purchase_value',     (select coalesce(sum(grand_total), 0) from purchases)
  );
$$;

-- ─── MR performance (spec §30, §40) ─────────────────────────────────────────
-- One row per MR. Counts are computed as correlated subqueries rather than
-- joins so that an MR with visits but no orders still appears, with zeroes.

create or replace function public.erp_mr_performance(
  p_from date,
  p_to   date
)
returns table (
  mr_id            uuid,
  mr_name          text,
  mr_code          text,
  territory        text,
  doctor_visits    bigint,
  chemist_visits   bigint,
  new_doctors      bigint,
  doctors_covered  bigint,
  chemists_covered bigint,
  field_orders     bigint,
  order_value      numeric,
  followups_open   bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    u.id,
    u.name,
    u.mr_code,
    u.territory,
    (select count(*) from public.erp_doctor_visits v
      where v.mr_id = u.id and v.visit_date between p_from and p_to),
    (select count(*) from public.erp_chemist_visits v
      where v.mr_id = u.id and v.visit_date between p_from and p_to),
    (select count(*) from public.erp_doctor_visits v
      where v.mr_id = u.id and v.visit_date between p_from and p_to and v.doctor_status = 'NEW'),
    -- Distinct doctors reached, not visit count: five calls on one doctor is
    -- one doctor covered.
    (select count(distinct v.doctor_id) from public.erp_doctor_visits v
      where v.mr_id = u.id and v.visit_date between p_from and p_to),
    (select count(distinct v.chemist_id) from public.erp_chemist_visits v
      where v.mr_id = u.id and v.visit_date between p_from and p_to),
    (select count(*) from public.erp_field_orders o
      where o.mr_id = u.id and o.order_date between p_from and p_to),
    (select coalesce(sum(o.estimated_value), 0) from public.erp_field_orders o
      where o.mr_id = u.id and o.order_date between p_from and p_to),
    (select count(*) from public.erp_followups f
      where f.mr_id = u.id and f.status = 'PENDING')
    from public.erp_users u
   where u.role = 'MR' and u.active
   order by 5 desc, 10 desc;   -- doctor_visits, then field_orders
$$;

-- ─── Product performance: field demand vs actual sales (spec §40) ───────────
-- The two columns are deliberately side by side: what doctors and chemists
-- asked MRs for, against what Leomed actually invoiced. They are different
-- numbers and are supposed to be.

create or replace function public.erp_product_performance(
  p_from date,
  p_to   date
)
returns table (
  product_id       uuid,
  product_name     text,
  product_code     text,
  demand_quantity  bigint,
  demand_value     numeric,
  sold_quantity    bigint,
  sold_value       numeric,
  stock_on_hand    bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.id,
    p.product_name,
    p.product_code,
    coalesce(d.qty, 0),
    coalesce(d.value, 0),
    coalesce(s.qty, 0),
    coalesce(s.value, 0),
    coalesce(b.qty, 0)
    from public.erp_products p
    left join (
      select i.product_id, sum(i.quantity)::bigint as qty, sum(i.line_value) as value
        from public.erp_field_order_items i
        join public.erp_field_orders o on o.id = i.field_order_id
       where o.order_date between p_from and p_to
       group by i.product_id
    ) d on d.product_id = p.id
    left join (
      select i.product_id, sum(i.quantity)::bigint as qty, sum(i.line_total) as value
        from public.erp_sales_invoice_items i
        join public.erp_sales_invoices inv on inv.id = i.sales_invoice_id
       where inv.invoice_date between p_from and p_to
       group by i.product_id
    ) s on s.product_id = p.id
    left join (
      select product_id, sum(current_quantity)::bigint as qty
        from public.erp_product_batches
       group by product_id
    ) b on b.product_id = p.id
   where p.active
     and (coalesce(d.qty, 0) > 0 or coalesce(s.qty, 0) > 0 or coalesce(b.qty, 0) > 0)
   order by coalesce(s.value, 0) desc, coalesce(d.value, 0) desc
   limit 200;
$$;

-- ─── Distributor sales and outstanding ──────────────────────────────────────

create or replace function public.erp_distributor_performance(
  p_from date,
  p_to   date
)
returns table (
  distributor_id   uuid,
  distributor_name text,
  distributor_code text,
  city             text,
  invoice_count    bigint,
  sales_value      numeric,
  outstanding      numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    d.id, d.distributor_name, d.distributor_code, d.city,
    count(i.id),
    coalesce(sum(i.grand_total), 0),
    coalesce(sum(i.grand_total - i.amount_paid), 0)
    from public.erp_distributors d
    join public.erp_sales_invoices i
      on i.distributor_id = d.id and i.invoice_date between p_from and p_to
   group by d.id, d.distributor_name, d.distributor_code, d.city
   order by 6 desc
   limit 100;
$$;

-- ─── Territory activity ─────────────────────────────────────────────────────
-- Territory is free text on the MR record (plan Q8), so rows are grouped by
-- the MR's territory rather than by a territory master.

create or replace function public.erp_territory_performance(
  p_from date,
  p_to   date
)
returns table (
  territory      text,
  mr_count       bigint,
  doctor_visits  bigint,
  chemist_visits bigint,
  new_doctors    bigint,
  field_orders   bigint,
  order_value    numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  -- Per-MR figures first, then rolled up. Computing them inside the grouped
  -- query would mean referencing an aggregate from a correlated subquery,
  -- which PostgreSQL does not allow.
  with mr_stats as (
    select
      u.id,
      coalesce(u.territory, 'Unassigned') as territory,
      (select count(*) from public.erp_doctor_visits v
        where v.mr_id = u.id and v.visit_date between p_from and p_to) as doctor_visits,
      (select count(*) from public.erp_chemist_visits v
        where v.mr_id = u.id and v.visit_date between p_from and p_to) as chemist_visits,
      (select count(*) from public.erp_doctor_visits v
        where v.mr_id = u.id and v.visit_date between p_from and p_to
          and v.doctor_status = 'NEW') as new_doctors,
      (select count(*) from public.erp_field_orders o
        where o.mr_id = u.id and o.order_date between p_from and p_to) as field_orders,
      (select coalesce(sum(o.estimated_value), 0) from public.erp_field_orders o
        where o.mr_id = u.id and o.order_date between p_from and p_to) as order_value
      from public.erp_users u
     where u.role = 'MR' and u.active
  )
  select
    territory,
    count(*)::bigint,
    sum(doctor_visits)::bigint,
    sum(chemist_visits)::bigint,
    sum(new_doctors)::bigint,
    sum(field_orders)::bigint,
    sum(order_value)
    from mr_stats
   group by territory
   order by 7 desc;   -- order_value
$$;

-- ─── Target progress ────────────────────────────────────────────────────────
-- Achievement is counted from the live tables for the target's own period, so
-- it is always current and never needs a nightly job to stay honest.

create or replace function public.erp_target_progress()
returns table (
  target_id    uuid,
  mr_id        uuid,
  mr_name      text,
  mr_code      text,
  territory    text,
  target_type  public.erp_target_type,
  target_value numeric,
  achieved     numeric,
  period_start date,
  period_end   date
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.id, t.mr_id, u.name, u.mr_code, t.territory, t.target_type, t.target_value,
    case t.target_type
      when 'DOCTOR_VISITS' then (
        select count(*)::numeric from public.erp_doctor_visits v
         where v.visit_date between t.period_start and t.period_end
           and (t.mr_id is null or v.mr_id = t.mr_id))
      when 'CHEMIST_VISITS' then (
        select count(*)::numeric from public.erp_chemist_visits v
         where v.visit_date between t.period_start and t.period_end
           and (t.mr_id is null or v.mr_id = t.mr_id))
      when 'NEW_DOCTORS' then (
        select count(*)::numeric from public.erp_doctor_visits v
         where v.visit_date between t.period_start and t.period_end
           and v.doctor_status = 'NEW'
           and (t.mr_id is null or v.mr_id = t.mr_id))
      when 'FIELD_ORDERS' then (
        select count(*)::numeric from public.erp_field_orders o
         where o.order_date between t.period_start and t.period_end
           and (t.mr_id is null or o.mr_id = t.mr_id))
      -- SALES means company invoice value, which no single MR owns, so an
      -- MR-scoped sales target is measured against total sales for the period.
      when 'SALES' then (
        select coalesce(sum(i.grand_total), 0) from public.erp_sales_invoices i
         where i.invoice_date between t.period_start and t.period_end)
    end,
    t.period_start, t.period_end
    from public.erp_targets t
    left join public.erp_users u on u.id = t.mr_id
   order by t.period_end desc, u.mr_code nulls last;
$$;

-- ─── Grants ─────────────────────────────────────────────────────────────────

revoke all on function public.erp_dashboard_summary(date, date, uuid, text) from public;
revoke all on function public.erp_mr_performance(date, date)                from public;
revoke all on function public.erp_product_performance(date, date)           from public;
revoke all on function public.erp_distributor_performance(date, date)       from public;
revoke all on function public.erp_territory_performance(date, date)         from public;
revoke all on function public.erp_target_progress()                         from public;

grant execute on function public.erp_dashboard_summary(date, date, uuid, text) to authenticated;
grant execute on function public.erp_mr_performance(date, date)                to authenticated;
grant execute on function public.erp_product_performance(date, date)           to authenticated;
grant execute on function public.erp_distributor_performance(date, date)       to authenticated;
grant execute on function public.erp_territory_performance(date, date)         to authenticated;
grant execute on function public.erp_target_progress()                         to authenticated;


-- ============================================================================
-- FILE: supabase/migrations/20260905000001_erp_payment_tracking.sql
-- ============================================================================
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


-- ============================================================================
-- FILE: supabase/migrations/20260905000002_erp_field_order_value.sql
-- ============================================================================
-- ============================================================================
-- LEOMED PHARMA ERP — 9 · FIELD ORDER VALUE (Q2) + AUDIT COMPLETENESS (Q3)
--
-- Q2 confirmed: a field order carries an ESTIMATED monetary value — product,
-- quantity, rate, discount, estimated line value, estimated order total.
--
-- What that value is NOT, and what this migration takes care to keep true:
--   · it does not reduce inventory
--   · it does not create a sale
--   · it does not create a receivable
--   · it does not touch financial accounting
--
-- It exists for MR performance, demand tracking and field analysis. The
-- absence of any link from erp_field_orders to erp_sales_invoices,
-- erp_inventory_transactions or erp_sales_receipts is the guarantee, and
-- supabase/tests/erp_business_rules.sql asserts it.
-- ============================================================================

-- ─── Discount on a field order line ─────────────────────────────────────────
-- Percent rather than a rupee amount, matching how discounts are already
-- expressed on purchase and sales invoice lines — one mental model across the
-- system, and it survives a rate change without being recalculated.

alter table public.erp_field_order_items
  add column if not exists discount_percent numeric(5,2) not null default 0
    check (discount_percent >= 0 and discount_percent <= 100);

-- line_value is a generated column, so changing its formula means replacing
-- it. Nothing is lost: every value is derived from columns that remain.
alter table public.erp_field_order_items drop column if exists line_value;

alter table public.erp_field_order_items
  add column line_value numeric(14,2)
  generated always as (
    round(quantity * unit_rate * (1 - discount_percent / 100), 2)
  ) stored;

-- Existing orders were totalled before discounts existed; the item trigger
-- only fires on item changes, so the parents are recomputed once here.
update public.erp_field_orders o
   set estimated_value = coalesce((
         select sum(i.line_value)
           from public.erp_field_order_items i
          where i.field_order_id = o.id
       ), 0);

comment on column public.erp_field_order_items.line_value is
  'Estimated value of this line: quantity x rate less discount. Indicative demand only — never a sale, a receivable, or a stock movement.';

comment on column public.erp_field_orders.estimated_value is
  'Estimated field order value, summed from its lines. Used for MR performance and demand tracking. Not revenue.';

-- ─── One place that builds field order lines ────────────────────────────────
-- Extracted so the doctor and chemist visit workflows cannot drift apart, and
-- so a future change to how a line is priced happens once.

create or replace function public.erp_insert_field_order_items(
  p_order uuid,
  p_items jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item  jsonb;
  v_count integer := 0;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into public.erp_field_order_items (
      field_order_id, product_id, quantity, unit, unit_rate, discount_percent, remarks
    )
    select p_order,
           p.id,
           (v_item->>'quantity')::integer,
           coalesce(nullif(v_item->>'unit', ''), p.unit),
           -- Snapshot of today's list rate unless the MR was quoted another.
           coalesce(nullif(v_item->>'unit_rate', '')::numeric, p.sale_rate),
           coalesce(nullif(v_item->>'discount_percent', '')::numeric, 0),
           nullif(v_item->>'remarks', '')
      from public.erp_products p
     where p.id = (v_item->>'product_id')::uuid;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.erp_insert_field_order_items(uuid, jsonb) from public;
grant execute on function public.erp_insert_field_order_items(uuid, jsonb) to authenticated;

-- ─── Visit workflows, updated to carry the discount through ─────────────────
-- Re-declared in full because a function body cannot be patched in place.
-- Behaviour is unchanged except that order lines now accept discount_percent
-- and are built by the shared helper above.

create or replace function public.erp_create_doctor_visit(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor      uuid;
  v_mr         uuid;
  v_doctor     uuid;
  v_visit      uuid;
  v_is_new     boolean := false;
  v_order      uuid;
  v_order_no   text;
  v_client_req uuid;
  v_new_doc    jsonb;
  v_item       jsonb;
  v_order_json jsonb;
begin
  v_actor := public.erp_current_user_id();
  if v_actor is null then
    raise exception 'Your account is not an active Leomed staff account'
      using errcode = 'insufficient_privilege';
  end if;

  v_mr := v_actor;
  if (p_payload ? 'mr_id') and public.erp_is_admin() then
    v_mr := nullif(p_payload->>'mr_id', '')::uuid;
  end if;

  v_client_req := nullif(p_payload->>'client_request_id', '')::uuid;
  if v_client_req is not null then
    select id into v_visit from public.erp_doctor_visits where client_request_id = v_client_req;
    if v_visit is not null then
      return jsonb_build_object('visit_id', v_visit, 'duplicate', true);
    end if;
  end if;

  v_new_doc := p_payload -> 'new_doctor';
  if v_new_doc is not null and jsonb_typeof(v_new_doc) = 'object' then
    insert into public.erp_doctors (
      doctor_name, specialization, qualification, phone, email,
      address, city, area, territory, clinic_name, created_by, updated_by
    ) values (
      trim(v_new_doc->>'doctor_name'),
      nullif(v_new_doc->>'specialization', ''),
      nullif(v_new_doc->>'qualification', ''),
      nullif(v_new_doc->>'phone', ''),
      nullif(v_new_doc->>'email', ''),
      nullif(v_new_doc->>'address', ''),
      nullif(v_new_doc->>'city', ''),
      nullif(v_new_doc->>'area', ''),
      nullif(v_new_doc->>'territory', ''),
      nullif(v_new_doc->>'clinic_name', ''),
      v_actor, v_actor
    )
    returning id into v_doctor;
    v_is_new := true;
  else
    v_doctor := nullif(p_payload->>'doctor_id', '')::uuid;
    if v_doctor is null then
      raise exception 'Select an existing doctor or fill in the new-doctor details';
    end if;
  end if;

  insert into public.erp_doctor_visits (
    doctor_id, mr_id, visit_date, visit_time, purpose, discussion, remarks,
    doctor_status, follow_up_required, follow_up_date, latitude, longitude,
    client_request_id, created_by, updated_by
  ) values (
    v_doctor, v_mr,
    coalesce(nullif(p_payload->>'visit_date', '')::date, current_date),
    nullif(p_payload->>'visit_time', '')::time,
    coalesce(nullif(p_payload->>'purpose', '')::public.erp_visit_purpose, 'PRODUCT_DETAILING'),
    nullif(p_payload->>'discussion', ''),
    nullif(p_payload->>'remarks', ''),
    case when v_is_new then 'NEW' else 'EXISTING' end::public.erp_doctor_status,
    coalesce((p_payload->>'follow_up_required')::boolean, false),
    nullif(p_payload->>'follow_up_date', '')::date,
    nullif(p_payload->>'latitude', '')::numeric,
    nullif(p_payload->>'longitude', '')::numeric,
    v_client_req, v_actor, v_actor
  )
  returning id into v_visit;

  if v_is_new then
    perform public.erp_link_doctor_to_visit(v_doctor, v_visit);
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'products', '[]'::jsonb))
  loop
    insert into public.erp_doctor_visit_products (
      visit_id, product_id, discussion_type, sample_quantity, remarks
    ) values (
      v_visit,
      (v_item->>'product_id')::uuid,
      coalesce(nullif(v_item->>'discussion_type', '')::public.erp_discussion_type, 'DETAILED'),
      coalesce((v_item->>'sample_quantity')::integer, 0),
      nullif(v_item->>'remarks', '')
    )
    on conflict (visit_id, product_id) do nothing;
  end loop;

  -- An order taken during the visit is a FIELD ORDER: a priced demand signal.
  -- It creates no sales invoice, no receivable and no stock movement (Q2).
  v_order_json := p_payload -> 'order';
  if v_order_json is not null and jsonb_typeof(v_order_json) = 'object'
     and coalesce((v_order_json->>'received')::boolean, false) then

    v_order_no := public.erp_next_document_number('field_order', 'FO');

    insert into public.erp_field_orders (
      order_number, customer_type, doctor_id, mr_id, doctor_visit_id,
      order_date, order_book_number, remarks, created_by, updated_by
    ) values (
      v_order_no, 'DOCTOR', v_doctor, v_mr, v_visit,
      coalesce(nullif(p_payload->>'visit_date', '')::date, current_date),
      nullif(v_order_json->>'order_book_number', ''),
      nullif(v_order_json->>'remarks', ''),
      v_actor, v_actor
    )
    returning id into v_order;

    perform public.erp_insert_field_order_items(v_order, v_order_json->'items');

    if not exists (select 1 from public.erp_field_order_items where field_order_id = v_order) then
      raise exception 'An order was marked as received but has no product lines';
    end if;
  end if;

  if coalesce((p_payload->>'follow_up_required')::boolean, false) then
    insert into public.erp_followups (
      mr_id, customer_type, doctor_id, doctor_visit_id, followup_date,
      description, priority, created_by, updated_by
    ) values (
      v_mr, 'DOCTOR', v_doctor, v_visit,
      (p_payload->>'follow_up_date')::date,
      nullif(p_payload->>'follow_up_description', ''),
      coalesce(nullif(p_payload->>'follow_up_priority', '')::public.erp_followup_priority, 'MEDIUM'),
      v_actor, v_actor
    );
  end if;

  return jsonb_build_object(
    'visit_id',      v_visit,
    'doctor_id',     v_doctor,
    'doctor_status', case when v_is_new then 'NEW' else 'EXISTING' end,
    'order_id',      v_order,
    'order_number',  v_order_no,
    'order_value',   (select estimated_value from public.erp_field_orders where id = v_order),
    'duplicate',     false
  );
end;
$$;

create or replace function public.erp_create_chemist_visit(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor      uuid;
  v_mr         uuid;
  v_chemist    uuid;
  v_visit      uuid;
  v_is_new     boolean := false;
  v_order      uuid;
  v_order_no   text;
  v_client_req uuid;
  v_new_chem   jsonb;
  v_order_json jsonb;
begin
  v_actor := public.erp_current_user_id();
  if v_actor is null then
    raise exception 'Your account is not an active Leomed staff account'
      using errcode = 'insufficient_privilege';
  end if;

  v_mr := v_actor;
  if (p_payload ? 'mr_id') and public.erp_is_admin() then
    v_mr := nullif(p_payload->>'mr_id', '')::uuid;
  end if;

  v_client_req := nullif(p_payload->>'client_request_id', '')::uuid;
  if v_client_req is not null then
    select id into v_visit from public.erp_chemist_visits where client_request_id = v_client_req;
    if v_visit is not null then
      return jsonb_build_object('visit_id', v_visit, 'duplicate', true);
    end if;
  end if;

  v_new_chem := p_payload -> 'new_chemist';
  if v_new_chem is not null and jsonb_typeof(v_new_chem) = 'object' then
    insert into public.erp_chemists (
      chemist_name, owner_name, phone, email, address, city,
      area, territory, gst_number, drug_license_number, created_by, updated_by
    ) values (
      trim(v_new_chem->>'chemist_name'),
      nullif(v_new_chem->>'owner_name', ''),
      nullif(v_new_chem->>'phone', ''),
      nullif(v_new_chem->>'email', ''),
      nullif(v_new_chem->>'address', ''),
      nullif(v_new_chem->>'city', ''),
      nullif(v_new_chem->>'area', ''),
      nullif(v_new_chem->>'territory', ''),
      nullif(v_new_chem->>'gst_number', ''),
      nullif(v_new_chem->>'drug_license_number', ''),
      v_actor, v_actor
    )
    returning id into v_chemist;
    v_is_new := true;
  else
    v_chemist := nullif(p_payload->>'chemist_id', '')::uuid;
    if v_chemist is null then
      raise exception 'Select an existing chemist or fill in the new-chemist details';
    end if;
  end if;

  insert into public.erp_chemist_visits (
    chemist_id, mr_id, visit_date, visit_time, purpose, discussion, remarks,
    follow_up_required, follow_up_date, latitude, longitude,
    client_request_id, created_by, updated_by
  ) values (
    v_chemist, v_mr,
    coalesce(nullif(p_payload->>'visit_date', '')::date, current_date),
    nullif(p_payload->>'visit_time', '')::time,
    coalesce(nullif(p_payload->>'purpose', '')::public.erp_visit_purpose, 'ORDER_COLLECTION'),
    nullif(p_payload->>'discussion', ''),
    nullif(p_payload->>'remarks', ''),
    coalesce((p_payload->>'follow_up_required')::boolean, false),
    nullif(p_payload->>'follow_up_date', '')::date,
    nullif(p_payload->>'latitude', '')::numeric,
    nullif(p_payload->>'longitude', '')::numeric,
    v_client_req, v_actor, v_actor
  )
  returning id into v_visit;

  if v_is_new then
    perform public.erp_link_chemist_to_visit(v_chemist, v_visit);
  end if;

  v_order_json := p_payload -> 'order';
  if v_order_json is not null and jsonb_typeof(v_order_json) = 'object'
     and coalesce((v_order_json->>'received')::boolean, false) then

    v_order_no := public.erp_next_document_number('field_order', 'FO');

    insert into public.erp_field_orders (
      order_number, customer_type, chemist_id, mr_id, chemist_visit_id,
      order_date, order_book_number, remarks, created_by, updated_by
    ) values (
      v_order_no, 'CHEMIST', v_chemist, v_mr, v_visit,
      coalesce(nullif(p_payload->>'visit_date', '')::date, current_date),
      nullif(v_order_json->>'order_book_number', ''),
      nullif(v_order_json->>'remarks', ''),
      v_actor, v_actor
    )
    returning id into v_order;

    perform public.erp_insert_field_order_items(v_order, v_order_json->'items');

    if not exists (select 1 from public.erp_field_order_items where field_order_id = v_order) then
      raise exception 'An order was marked as received but has no product lines';
    end if;
  end if;

  if coalesce((p_payload->>'follow_up_required')::boolean, false) then
    insert into public.erp_followups (
      mr_id, customer_type, chemist_id, chemist_visit_id, followup_date,
      description, priority, created_by, updated_by
    ) values (
      v_mr, 'CHEMIST', v_chemist, v_visit,
      (p_payload->>'follow_up_date')::date,
      nullif(p_payload->>'follow_up_description', ''),
      coalesce(nullif(p_payload->>'follow_up_priority', '')::public.erp_followup_priority, 'MEDIUM'),
      v_actor, v_actor
    );
  end if;

  return jsonb_build_object(
    'visit_id',     v_visit,
    'chemist_id',   v_chemist,
    'is_new',       v_is_new,
    'order_id',     v_order,
    'order_number', v_order_no,
    'order_value',  (select estimated_value from public.erp_field_orders where id = v_order),
    'duplicate',    false
  );
end;
$$;

-- ============================================================================
-- Q3 · AUDIT COMPLETENESS
-- The 24-hour MR edit window and its server-side enforcement already exist
-- (erp_settings.mr_edit_window_hours, erp_within_edit_window(), and the RLS
-- policies on visits, orders and customer masters). These fill the two gaps in
-- "maintain created_at / created_by / updated_at / updated_by, and an audit
-- trail of important changes".
-- ============================================================================

alter table public.erp_followups
  add column if not exists updated_by uuid references public.erp_users(id) on delete set null;

-- Field orders carry a monetary value and a fulfilment status that management
-- can change, so who changed what is worth keeping.
drop trigger if exists erp_field_orders_audit on public.erp_field_orders;
create trigger erp_field_orders_audit
  after insert or update or delete on public.erp_field_orders
  for each row execute function public.erp_audit_trigger();


-- ============================================================================
-- FILE: supabase/migrations/20260905000003_erp_expiry_override.sql
-- ============================================================================
-- ============================================================================
-- LEOMED PHARMA ERP — 10 · EXPIRED STOCK (Q9) + INVOICE ↔ PAYMENT WIRING (Q6)
--
-- Q9 confirmed: expired batches are BLOCKED from normal sale. An override is
-- an administrator's deliberate, explained, recorded act — never a quiet
-- setting. Two gates now stand in front of it:
--
--   1. erp_settings.allow_expired_sale   the business decision, off by default
--   2. per invoice: administrator + mandatory reason + approver + timestamp
--                   + an audit record
--
-- Before this migration the settings flag alone was enough, with no reason and
-- no record of who allowed it. That was weaker than Q9 requires.
--
-- Both invoice functions are also re-declared here so that money paid at
-- billing time becomes a row in the payment history introduced in migration 8,
-- rather than a figure written straight onto the invoice.
-- ============================================================================

-- ─── The override, recorded on the invoice that used it ─────────────────────

alter table public.erp_sales_invoices
  add column if not exists expired_sale_override    boolean not null default false,
  add column if not exists expired_sale_reason      text,
  add column if not exists expired_sale_approved_by uuid references public.erp_users(id) on delete set null,
  add column if not exists expired_sale_approved_at timestamptz;

-- An override with no reason, no approver or no timestamp is not an override,
-- it is an unexplained sale of expired medicine.
alter table public.erp_sales_invoices
  drop constraint if exists erp_sales_expired_override_complete;
alter table public.erp_sales_invoices
  add constraint erp_sales_expired_override_complete check (
    not expired_sale_override
    or (
      expired_sale_reason is not null
      and length(trim(expired_sale_reason)) > 0
      and expired_sale_approved_by is not null
      and expired_sale_approved_at is not null
    )
  );

create index if not exists erp_sales_invoices_expired_override_idx
  on public.erp_sales_invoices (invoice_date desc)
  where expired_sale_override;

comment on column public.erp_sales_invoices.expired_sale_override is
  'True when this invoice knowingly sold an expired batch. Requires an administrator, a reason, and an audit record (Q9).';

-- ─── Purchase invoice → stock in, and any payment made at billing time ──────

create or replace function public.erp_save_purchase_invoice(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid;
  v_invoice  uuid;
  v_item     jsonb;
  v_batch    uuid;
  v_date     date;
  v_gross    numeric(14,2);
  v_disc     numeric(14,2);
  v_taxable  numeric(14,2);
  v_tax      numeric(14,2);
  v_line     numeric(14,2);
  v_sum_gross numeric(14,2) := 0;
  v_sum_disc  numeric(14,2) := 0;
  v_sum_tax   numeric(14,2) := 0;
  v_sum_total numeric(14,2) := 0;
  v_qty      integer;
  v_free     integer;
  v_initial  numeric(14,2);
begin
  if not public.erp_can_write_billing() then
    raise exception 'Only an administrator or accountant may record purchases'
      using errcode = 'insufficient_privilege';
  end if;
  v_actor := public.erp_current_user_id();
  v_date  := coalesce(nullif(p_payload->>'invoice_date', '')::date, current_date);

  if jsonb_array_length(coalesce(p_payload->'items', '[]'::jsonb)) = 0 then
    raise exception 'A purchase invoice needs at least one product line';
  end if;

  -- amount_paid is deliberately absent: it is derived from erp_purchase_payments.
  insert into public.erp_purchase_invoices (
    invoice_number, supplier_id, invoice_date, is_interstate, remarks,
    created_by, updated_by
  ) values (
    trim(p_payload->>'invoice_number'),
    (p_payload->>'supplier_id')::uuid,
    v_date,
    coalesce((p_payload->>'is_interstate')::boolean, false),
    nullif(p_payload->>'remarks', ''),
    v_actor, v_actor
  )
  returning id into v_invoice;

  for v_item in select * from jsonb_array_elements(p_payload->'items')
  loop
    v_qty  := (v_item->>'quantity')::integer;
    v_free := coalesce((v_item->>'free_quantity')::integer, 0);

    select id into v_batch
      from public.erp_product_batches
     where product_id = (v_item->>'product_id')::uuid
       and batch_number = trim(v_item->>'batch_number');

    if v_batch is null then
      insert into public.erp_product_batches (
        product_id, batch_number, manufacturing_date, expiry_date,
        mrp, purchase_rate, sale_rate, created_by
      ) values (
        (v_item->>'product_id')::uuid,
        trim(v_item->>'batch_number'),
        nullif(v_item->>'manufacturing_date', '')::date,
        (v_item->>'expiry_date')::date,
        coalesce(nullif(v_item->>'mrp', '')::numeric, 0),
        (v_item->>'purchase_rate')::numeric,
        coalesce(nullif(v_item->>'sale_rate', '')::numeric, 0),
        v_actor
      )
      returning id into v_batch;
    else
      update public.erp_product_batches
         set mrp           = coalesce(nullif(v_item->>'mrp', '')::numeric, mrp),
             purchase_rate = (v_item->>'purchase_rate')::numeric,
             sale_rate     = coalesce(nullif(v_item->>'sale_rate', '')::numeric, sale_rate)
       where id = v_batch;
    end if;

    v_gross   := round(v_qty * (v_item->>'purchase_rate')::numeric, 2);
    v_disc    := round(v_gross * coalesce((v_item->>'discount_percent')::numeric, 0) / 100, 2);
    v_taxable := v_gross - v_disc;
    v_tax     := round(v_taxable * coalesce((v_item->>'gst_rate')::numeric, 0) / 100, 2);
    v_line    := v_taxable + v_tax;

    insert into public.erp_purchase_invoice_items (
      purchase_invoice_id, product_id, batch_id, quantity, free_quantity,
      purchase_rate, discount_percent, gst_rate, taxable_amount, tax_amount, line_total
    ) values (
      v_invoice, (v_item->>'product_id')::uuid, v_batch, v_qty, v_free,
      (v_item->>'purchase_rate')::numeric,
      coalesce((v_item->>'discount_percent')::numeric, 0),
      coalesce((v_item->>'gst_rate')::numeric, 0),
      v_taxable, v_tax, v_line
    );

    insert into public.erp_inventory_transactions (
      product_id, batch_id, transaction_type, reference_type, reference_id,
      quantity, unit_rate, transaction_date, remarks, created_by
    ) values (
      (v_item->>'product_id')::uuid, v_batch, 'PURCHASE', 'PURCHASE_INVOICE', v_invoice,
      v_qty + v_free, (v_item->>'purchase_rate')::numeric, v_date,
      'Purchase invoice ' || trim(p_payload->>'invoice_number'), v_actor
    );

    v_sum_gross := v_sum_gross + v_gross;
    v_sum_disc  := v_sum_disc  + v_disc;
    v_sum_tax   := v_sum_tax   + v_tax;
    v_sum_total := v_sum_total + v_line;
  end loop;

  update public.erp_purchase_invoices
     set subtotal = v_sum_gross, discount = v_sum_disc,
         tax = v_sum_tax, grand_total = v_sum_total
   where id = v_invoice;

  -- Any amount settled at billing time becomes the first payment. Recorded
  -- AFTER the totals so the overpayment guard compares against a real balance.
  v_initial := coalesce(nullif(p_payload->>'initial_payment', '')::numeric, 0);
  if v_initial > 0 then
    if v_initial > v_sum_total then
      raise exception 'Payment of % is more than the invoice total of %',
        to_char(v_initial, 'FM999999990.00'), to_char(v_sum_total, 'FM999999990.00')
        using errcode = 'check_violation';
    end if;

    insert into public.erp_purchase_payments (
      purchase_invoice_id, payment_date, amount, payment_method,
      reference_number, remarks, created_by
    ) values (
      v_invoice, v_date, v_initial,
      coalesce(nullif(p_payload->>'payment_method', '')::public.erp_payment_method, 'BANK_TRANSFER'),
      nullif(p_payload->>'payment_reference', ''),
      'Paid when the invoice was recorded', v_actor
    );
  end if;

  return jsonb_build_object(
    'invoice_id',  v_invoice,
    'grand_total', v_sum_total,
    'subtotal',    v_sum_gross,
    'tax',         v_sum_tax,
    'amount_paid', v_initial,
    'balance',     v_sum_total - v_initial
  );
end;
$$;

-- ─── Sales invoice → stock out, receipts, and the expiry gate ───────────────

create or replace function public.erp_save_sales_invoice(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid;
  v_invoice  uuid;
  v_number   text;
  v_item     jsonb;
  v_date     date;
  v_batch    record;
  v_gross    numeric(14,2);
  v_disc     numeric(14,2);
  v_taxable  numeric(14,2);
  v_tax      numeric(14,2);
  v_line     numeric(14,2);
  v_sum_gross numeric(14,2) := 0;
  v_sum_disc  numeric(14,2) := 0;
  v_sum_tax   numeric(14,2) := 0;
  v_sum_total numeric(14,2) := 0;
  v_qty      integer;
  v_free     integer;
  v_allow_expired boolean;
  v_reason        text;
  v_used_expired  boolean := false;
  v_expired_list  text := '';
  v_initial  numeric(14,2);
begin
  if not public.erp_can_write_billing() then
    raise exception 'Only an administrator or accountant may raise sales invoices'
      using errcode = 'insufficient_privilege';
  end if;
  v_actor := public.erp_current_user_id();
  v_date  := coalesce(nullif(p_payload->>'invoice_date', '')::date, current_date);
  v_reason := nullif(trim(coalesce(p_payload->>'expired_sale_reason', '')), '');

  select allow_expired_sale into v_allow_expired from public.erp_settings where id = 1;

  if jsonb_array_length(coalesce(p_payload->'items', '[]'::jsonb)) = 0 then
    raise exception 'A sales invoice needs at least one product line';
  end if;

  v_number := coalesce(
    nullif(p_payload->>'invoice_number', ''),
    public.erp_next_document_number('sales_invoice', 'INV', v_date)
  );

  insert into public.erp_sales_invoices (
    invoice_number, distributor_id, invoice_date, is_interstate, remarks,
    created_by, updated_by
  ) values (
    v_number,
    (p_payload->>'distributor_id')::uuid,
    v_date,
    coalesce((p_payload->>'is_interstate')::boolean, false),
    nullif(p_payload->>'remarks', ''),
    v_actor, v_actor
  )
  returning id into v_invoice;

  for v_item in select * from jsonb_array_elements(p_payload->'items')
  loop
    v_qty  := (v_item->>'quantity')::integer;
    v_free := coalesce((v_item->>'free_quantity')::integer, 0);

    select b.id, b.batch_number, b.current_quantity, b.expiry_date, p.product_name
      into v_batch
      from public.erp_product_batches b
      join public.erp_products p on p.id = b.product_id
     where b.id = (v_item->>'batch_id')::uuid
     for update of b;

    if not found then
      raise exception 'Batch % not found', v_item->>'batch_id';
    end if;

    -- ── Q9: expired stock is unavailable for normal sale ──
    if v_batch.expiry_date < v_date then
      if not coalesce(v_allow_expired, false) then
        raise exception
          'Batch % of % expired on % and cannot be sold. Selling expired stock is switched off in Settings.',
          v_batch.batch_number, v_batch.product_name,
          to_char(v_batch.expiry_date, 'DD Mon YYYY')
          using errcode = 'check_violation';
      end if;

      if not public.erp_is_admin() then
        raise exception
          'Batch % of % expired on %. Only an administrator may authorise selling expired stock.',
          v_batch.batch_number, v_batch.product_name,
          to_char(v_batch.expiry_date, 'DD Mon YYYY')
          using errcode = 'insufficient_privilege';
      end if;

      if v_reason is null then
        raise exception
          'Batch % of % expired on %. A written reason is required to authorise this sale.',
          v_batch.batch_number, v_batch.product_name,
          to_char(v_batch.expiry_date, 'DD Mon YYYY')
          using errcode = 'check_violation';
      end if;

      v_used_expired := true;
      v_expired_list := v_expired_list
        || case when v_expired_list = '' then '' else ', ' end
        || v_batch.product_name || ' (batch ' || v_batch.batch_number
        || ', expired ' || to_char(v_batch.expiry_date, 'DD Mon YYYY') || ')';
    end if;

    if v_batch.current_quantity < (v_qty + v_free) then
      raise exception 'Only % units of % (batch %) in stock — % requested',
        v_batch.current_quantity, v_batch.product_name, v_batch.batch_number, v_qty + v_free
        using errcode = 'check_violation';
    end if;

    v_gross   := round(v_qty * (v_item->>'sale_rate')::numeric, 2);
    v_disc    := round(v_gross * coalesce((v_item->>'discount_percent')::numeric, 0) / 100, 2);
    v_taxable := v_gross - v_disc;
    v_tax     := round(v_taxable * coalesce((v_item->>'gst_rate')::numeric, 0) / 100, 2);
    v_line    := v_taxable + v_tax;

    insert into public.erp_sales_invoice_items (
      sales_invoice_id, product_id, batch_id, quantity, free_quantity,
      sale_rate, discount_percent, gst_rate, taxable_amount, tax_amount, line_total
    ) values (
      v_invoice, (v_item->>'product_id')::uuid, v_batch.id, v_qty, v_free,
      (v_item->>'sale_rate')::numeric,
      coalesce((v_item->>'discount_percent')::numeric, 0),
      coalesce((v_item->>'gst_rate')::numeric, 0),
      v_taxable, v_tax, v_line
    );

    insert into public.erp_inventory_transactions (
      product_id, batch_id, transaction_type, reference_type, reference_id,
      quantity, unit_rate, transaction_date, remarks, created_by
    ) values (
      (v_item->>'product_id')::uuid, v_batch.id, 'SALE', 'SALES_INVOICE', v_invoice,
      -(v_qty + v_free), (v_item->>'sale_rate')::numeric, v_date,
      'Sales invoice ' || v_number, v_actor
    );

    v_sum_gross := v_sum_gross + v_gross;
    v_sum_disc  := v_sum_disc  + v_disc;
    v_sum_tax   := v_sum_tax   + v_tax;
    v_sum_total := v_sum_total + v_line;
  end loop;

  update public.erp_sales_invoices
     set subtotal = v_sum_gross, discount = v_sum_disc,
         tax = v_sum_tax, grand_total = v_sum_total,
         expired_sale_override    = v_used_expired,
         expired_sale_reason      = case when v_used_expired then v_reason end,
         expired_sale_approved_by = case when v_used_expired then v_actor end,
         expired_sale_approved_at = case when v_used_expired then now() end
   where id = v_invoice;

  -- Selling expired medicine gets its own audit entry, not just the invoice
  -- row, so it is findable without knowing which invoice to look at.
  if v_used_expired then
    insert into public.erp_audit_logs (user_id, action, table_name, record_id, new_data)
    values (
      v_actor, 'EXPIRED_SALE_OVERRIDE', 'erp_sales_invoices', v_invoice,
      jsonb_build_object(
        'invoice_number', v_number,
        'reason',         v_reason,
        'batches',        v_expired_list,
        'approved_at',    now()
      )
    );
  end if;

  v_initial := coalesce(nullif(p_payload->>'initial_payment', '')::numeric, 0);
  if v_initial > 0 then
    if v_initial > v_sum_total then
      raise exception 'Receipt of % is more than the invoice total of %',
        to_char(v_initial, 'FM999999990.00'), to_char(v_sum_total, 'FM999999990.00')
        using errcode = 'check_violation';
    end if;

    insert into public.erp_sales_receipts (
      sales_invoice_id, receipt_date, amount, payment_method,
      reference_number, remarks, created_by
    ) values (
      v_invoice, v_date, v_initial,
      coalesce(nullif(p_payload->>'payment_method', '')::public.erp_payment_method, 'BANK_TRANSFER'),
      nullif(p_payload->>'payment_reference', ''),
      'Received when the invoice was raised', v_actor
    );
  end if;

  return jsonb_build_object(
    'invoice_id',       v_invoice,
    'invoice_number',   v_number,
    'grand_total',      v_sum_total,
    'subtotal',         v_sum_gross,
    'tax',              v_sum_tax,
    'amount_paid',      v_initial,
    'balance',          v_sum_total - v_initial,
    'expired_override', v_used_expired
  );
end;
$$;


-- ============================================================================
-- FILE: supabase/migrations/20260905000004_erp_rls_hardening.sql
-- ============================================================================
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


