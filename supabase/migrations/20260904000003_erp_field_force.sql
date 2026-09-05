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
