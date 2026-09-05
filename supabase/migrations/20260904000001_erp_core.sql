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
