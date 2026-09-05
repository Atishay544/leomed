# Leomed Pharma — Field Force, Sales, Billing & Inventory System
## Implementation Plan

**Date:** 2026-09-04
**Target repo:** `Atishay544/leomed` (existing Next.js 16 + Supabase D2C storefront)
**Status:** Plan — implementation follows phase-by-phase

---

## 0. Context that changes the design

This repository is **not empty**. It is a live direct-to-consumer pharmacy storefront:

| Existing subsystem | Tables / routes |
|---|---|
| Storefront catalog | `products`, `product_variants`, `product_skus`, `categories`, `health_concerns` |
| D2C orders | `orders`, `order_items`, `cart_items`, Razorpay checkout, Delhivery shipping |
| Storefront admin | `/admin/**` (products, orders, banners, coupons, chat, membership) |
| Identity | `auth.users` → `public.profiles` with `role in ('customer','admin')` |
| Edge guard | `proxy.ts` (Next 16's renamed middleware) checks `app_metadata.role === 'admin'` for `/admin` |

The ERP specified in the brief is a **different business system** that happens to live in the
same codebase. Three names collide head-on with the storefront: `products`, `orders`, `/admin`.
Silently reusing them would break a live store. Everything below is designed around that.

---

## A. Architecture decisions

| # | Decision | Rationale |
|---|---|---|
| **D1** | All 21 new tables carry an **`erp_` prefix** (`erp_products`, `erp_doctors`, …) | `public.products`/`public.orders` are load-bearing for the storefront. Prefixing in the **`public` schema** (not a separate `erp` schema) keeps PostgREST working with zero Supabase dashboard config — a separate schema would need "Exposed schemas" changed by hand and would break on any fresh deploy. |
| **D2** | ERP mounts at **`/erp/**`** | `/admin` is the storefront admin. `/erp/dashboard`, `/erp/mr/*`, `/erp/masters/*`, `/erp/accounting/*`, `/erp/reports/*`. One `proxy.ts` rule, one layout, no route collisions ever. |
| **D3** | Staff identity is **`erp_users`**, separate from `public.profiles` | Storefront customers and pharma field staff are different populations with different role vocabularies. A person can be both (same `auth.users` row, two profile rows). `profiles.role` CHECK constraint stays untouched → zero storefront regression risk. |
| **D4** | `erp_products` is an **independent pharma SKU master** | Storefront `products` has slug/images/price-for-consumers; the pharma master needs generic name, dosage form, strength, pack size, MRP, purchase/sale rate, GST rate, batch tracking. A nullable `storefront_product_id` FK is provided for optional future reconciliation, with **no sync logic**. |
| **D5** | Inventory truth is an **append-only ledger** | `erp_inventory_transactions` holds signed quantities (`+` in, `−` out). `erp_product_batches.current_quantity` is a trigger-maintained cache for fast reads, plus `erp_reconcile_batch_quantities()` to prove them equal. No table has a directly-writable stock column. |
| **D6** | New-vs-existing doctor uses a **nullable back-reference set inside one transaction** | `erp_doctors.created_from_visit_id → erp_doctor_visits.id`, nullable, populated by the `erp_create_doctor_visit` RPC after both rows exist. Avoids the circular-FK deadlock. The visit *also* stores a denormalized `doctor_status` so historical reports stay correct even if masters are later edited. |
| **D7** | Field orders and sales invoices are **structurally unrelated** | No FK, no trigger, no code path from `erp_field_orders` to `erp_sales_invoices`. Field orders never touch inventory. |
| **D8** | Every money total is **recomputed in PostgreSQL** | Line totals, tax, and grand totals are computed by DB functions from quantity/rate/discount/GST. Client-submitted totals are discarded, not trusted. |
| **D9** | Normal reads/writes use the **RLS-enforced cookie client** | The storefront admin uses the service-role key (bypasses RLS). The ERP deliberately does not: it uses `createServerClient()` so RLS is a *real* enforcement layer, not decoration. Service-role is reserved for exactly two things — provisioning `auth.users`, and writing `erp_audit_logs`. |
| **D10** | Document numbers are **generated server-side** | `erp_next_document_number(kind)` with a per-financial-year prefix and a unique constraint. The physical `order_book_number` an MR types is a plain business field, never a key. |
| **D11** | Every field-created record carries a **`client_request_id`** | Unique per table. An MR on a flaky clinic connection who taps Save twice gets one record, not two. This is the foundation the later offline queue plugs into. |

---

## B. Entity-relationship overview

```
auth.users
   │ 1:1
   ▼
erp_users ────────────────────────────────────────────────┐
   │ (role: ADMIN | MR | ACCOUNTANT | MANAGER | VIEWER)    │
   │                                                       │
   ├── mr_id ──┬── erp_doctor_visits ──┬── erp_doctor_visit_products
   │           │         │             └── erp_field_orders (1:0..1)
   │           │         │
   │           │         └── created_from_visit_id ◄── erp_doctors
   │           │
   │           ├── erp_chemist_visits ─── erp_field_orders (1:0..1)
   │           ├── erp_field_orders ────── erp_field_order_items
   │           ├── erp_followups
   │           └── erp_targets
   │
   └── created_by / updated_by on every transactional table


erp_doctors ──┬── erp_doctor_visits          erp_chemists ──┬── erp_chemist_visits
              ├── erp_field_orders                          ├── erp_field_orders
              └── erp_followups                             └── erp_followups

erp_products ─┬── erp_product_batches ──┬── erp_inventory_transactions
              │                          ├── erp_purchase_invoice_items
              │                          └── erp_sales_invoice_items
              ├── erp_field_order_items
              └── erp_doctor_visit_products

erp_suppliers ──── erp_purchase_invoices ──── erp_purchase_invoice_items ──┐
                                                                           ├─► inventory IN
erp_distributors ── erp_sales_invoices ────── erp_sales_invoice_items ─────┴─► inventory OUT

erp_audit_logs   (user, action, table, record, old/new jsonb)
erp_settings     (singleton config: expiry threshold, MR edit window, FY prefix)
```

**Two order concepts, deliberately disjoint:**

```
FIELD ORDER                              SALES INVOICE
doctor/chemist → MR                      Leomed → distributor
measures demand & MR performance         actual company revenue
NO inventory effect                      REDUCES inventory
NO money owed to Leomed                  payment status tracked
erp_field_orders                         erp_sales_invoices
        ╳ no relationship whatsoever ╳
```

---

## C. Schema — table by table

Conventions: every table has `id uuid pk default gen_random_uuid()`, `created_at timestamptz not null default now()`,
`updated_at timestamptz not null default now()` (trigger-maintained). FK columns are indexed.
`created_by`/`updated_by` reference `erp_users(id)`.

### C.1 Enums

| Enum | Values |
|---|---|
| `erp_role` | ADMIN, MR, ACCOUNTANT, MANAGER, VIEWER |
| `erp_customer_type` | DOCTOR, CHEMIST |
| `erp_doctor_status` | NEW, EXISTING |
| `erp_visit_purpose` | INTRODUCTION, FOLLOW_UP, PRODUCT_DETAILING, ORDER_COLLECTION, PAYMENT_FOLLOW_UP, COMPLAINT, OTHER |
| `erp_discussion_type` | DETAILED, SAMPLE_GIVEN, LITERATURE_GIVEN, REMINDER, NEW_LAUNCH |
| `erp_field_order_status` | RECEIVED, FORWARDED_TO_DISTRIBUTOR, PARTIALLY_FULFILLED, FULFILLED, CANCELLED |
| `erp_inventory_txn_type` | OPENING, PURCHASE, SALE, SALE_RETURN, PURCHASE_RETURN, ADJUSTMENT_IN, ADJUSTMENT_OUT, DAMAGE, EXPIRY |
| `erp_reference_type` | PURCHASE_INVOICE, SALES_INVOICE, ADJUSTMENT, OPENING |
| `erp_payment_status` | UNPAID, PARTIAL, PAID |
| `erp_followup_status` | PENDING, COMPLETED, CANCELLED |
| `erp_followup_priority` | LOW, MEDIUM, HIGH |
| `erp_target_type` | DOCTOR_VISITS, CHEMIST_VISITS, NEW_DOCTORS, FIELD_ORDERS, SALES |

### C.2 `erp_users` — staff directory

| Column | Type | Null | Default | Key | Purpose |
|---|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK | |
| auth_user_id | uuid | no | | UQ, FK→auth.users ON DELETE CASCADE | Supabase Auth link |
| name | text | no | | | Display name |
| email | citext | no | | UQ | Login email |
| phone | text | yes | | | |
| role | erp_role | no | 'MR' | | Authorization source of truth |
| mr_code | text | yes | | UQ (partial, where not null) | MR001… — business code, never a key |
| territory | text | yes | | idx | Free text (see Ambiguity Q8) |
| reports_to | uuid | yes | | FK→erp_users | Future manager hierarchy |
| active | boolean | no | true | idx | Soft-disable; never hard-delete staff |
| created_at / updated_at | timestamptz | no | now() | | |

Constraint: `role = 'MR' → mr_code IS NOT NULL`.

### C.3 `erp_doctors`

`doctor_code` (UQ, auto `DR00001`), `doctor_name` (idx trigram), `specialization`, `qualification`,
`phone` (idx), `email`, `address`, `city`, `area`, `territory`, `clinic_name`, `latitude`, `longitude`,
`created_from_visit_id` (FK→`erp_doctor_visits`, **nullable, deferrable**), `created_by`, `updated_by`,
`active` (default true), `notes`.

**No `mr_id` column.** Doctors belong to the company master; any MR may visit any doctor.

### C.4 `erp_chemists`

`chemist_code` (UQ, `CH00001`), `chemist_name` (idx trigram), `owner_name`, `phone` (idx), `email`,
`address`, `city`, `area`, `territory`, `gst_number`, `drug_license_number`, `latitude`, `longitude`,
`created_from_visit_id` (FK→`erp_chemist_visits`, nullable), `created_by`, `updated_by`, `active`.

**No `mr_id` column.**

### C.5 `erp_distributors`

`distributor_code` (UQ), `distributor_name`, `contact_person`, `phone`, `email`, `address`, `city`,
`state`, `territory`, `gst_number`, `drug_license_number`, `payment_terms` (text), `credit_limit`
(numeric(12,2)), `active`, audit columns.

### C.6 `erp_suppliers`

`supplier_code` (UQ), `supplier_name`, `contact_person`, `phone`, `email`, `address`, `city`, `state`,
`gst_number`, `drug_license_number`, `payment_terms`, `active`, audit columns.

### C.7 `erp_products` — pharma SKU master

| Column | Type | Notes |
|---|---|---|
| product_code | text | UQ, auto `PRD00001` |
| product_name | text | not null, trigram idx |
| generic_name / brand_name | text | searchable |
| category | text | free text (pharma therapeutic class) |
| dosage_form | text | Tablet / Syrup / Injection / Capsule / Ointment |
| strength | text | "500 mg" |
| pack_size | text | "10x10" |
| unit | text | default 'BOX' |
| mrp / purchase_rate / sale_rate | numeric(12,2) | `>= 0` |
| gst_rate | numeric(5,2) | default 12, `0..28` |
| hsn_code | text | |
| min_stock_level | integer | default 0 — drives low-stock alerts |
| storefront_product_id | uuid | nullable FK→`public.products`, informational only (D4) |
| active | boolean | default true |

### C.8 `erp_product_batches`

`product_id` (FK, idx), `batch_number`, `manufacturing_date`, `expiry_date` (idx),
`mrp`, `purchase_rate`, `sale_rate`, `opening_quantity` (default 0),
`current_quantity` (**trigger-maintained, `>= 0`**), audit columns.
Unique `(product_id, batch_number)`. Check `expiry_date > manufacturing_date`.

### C.9 `erp_inventory_transactions` — the ledger

| Column | Type | Notes |
|---|---|---|
| product_id / batch_id | uuid | FK, both required, idx |
| transaction_type | erp_inventory_txn_type | |
| reference_type | erp_reference_type | |
| reference_id | uuid | invoice/adjustment id — no FK (polymorphic), indexed |
| quantity | integer | **signed**: `+` increases stock, `−` decreases. `<> 0` |
| unit_rate | numeric(12,2) | for valuation |
| transaction_date | date | default current_date, idx |
| remarks | text | required for manual adjustments |
| created_by | uuid | FK→erp_users |

Append-only: `UPDATE`/`DELETE` revoked from all app roles; corrections are new reversing rows.
Trigger `erp_apply_inventory_txn()` keeps `erp_product_batches.current_quantity` in step and
raises if a transaction would drive a batch negative.

### C.10 `erp_doctor_visits`

`doctor_id` (FK, idx), `mr_id` (FK→erp_users, idx), `visit_date` (date, idx), `visit_time` (time),
`purpose` (enum), `discussion` (text), `remarks`, `doctor_status` (enum, denormalized at write time),
`follow_up_required` (bool), `follow_up_date`, `latitude`, `longitude`, `client_request_id` (uuid UQ),
audit columns.

**No unique constraint on `doctor_id` or `(doctor_id, mr_id)`** — repeat visits by any MR are the norm.
Composite index `(mr_id, visit_date desc)` and `(doctor_id, visit_date desc)` for reporting.

### C.11 `erp_doctor_visit_products` — 1:N products per visit

`visit_id` (FK ON DELETE CASCADE, idx), `product_id` (FK, idx), `discussion_type` (enum),
`sample_quantity` (integer, default 0), `remarks`. Unique `(visit_id, product_id)`.

### C.12 `erp_chemist_visits`

Same shape as C.10 with `chemist_id`; no `doctor_status`.

### C.13 `erp_field_orders`

| Column | Type | Notes |
|---|---|---|
| order_number | text | UQ, auto `FO/2026-27/00001` |
| customer_type | erp_customer_type | |
| doctor_id / chemist_id | uuid | FK, nullable — **XOR-constrained** |
| mr_id | uuid | FK→erp_users, idx |
| doctor_visit_id / chemist_visit_id | uuid | FK, nullable, XOR-consistent with customer_type |
| order_date | date | idx |
| order_book_number | text | MR's physical book ref — UQ `(mr_id, order_book_number)` where not null |
| status | erp_field_order_status | default RECEIVED |
| estimated_value | numeric(12,2) | derived from items, trigger-maintained (indicative only) |
| remarks, client_request_id (UQ), audit columns | | |

Check constraint:
```sql
(customer_type='DOCTOR' AND doctor_id IS NOT NULL AND chemist_id IS NULL)
OR
(customer_type='CHEMIST' AND chemist_id IS NOT NULL AND doctor_id IS NULL)
```

### C.14 `erp_field_order_items`

`field_order_id` (FK CASCADE, idx), `product_id` (FK, idx), `quantity` (integer `> 0`),
`unit` (text), `unit_rate` (numeric — snapshot of `erp_products.sale_rate` at capture time,
**indicative, not a price quote**), `line_value` (generated `quantity * unit_rate`), `remarks`.

### C.15 `erp_purchase_invoices` / `erp_purchase_invoice_items`

Invoice: `invoice_number` (UQ per supplier), `supplier_id` (FK), `invoice_date`, `subtotal`,
`discount`, `tax`, `grand_total`, `amount_paid` (default 0), `payment_status` (enum),
`is_interstate` (bool — drives CGST+SGST vs IGST at print time), `remarks`, audit columns.

Items: `purchase_invoice_id` (FK CASCADE), `product_id`, `batch_id`, `quantity` (`> 0`),
`free_quantity` (default 0, `>= 0`), `purchase_rate`, `discount_percent`, `gst_rate`,
`taxable_amount`, `tax_amount`, `line_total` — **all money columns written by the RPC, never the client**.

Saving a purchase invoice creates one `PURCHASE` ledger row per item (qty + free_qty).

### C.16 `erp_sales_invoices` / `erp_sales_invoice_items`

Mirror of C.15 with `distributor_id`. Saving creates one `SALE` ledger row per item with **negative**
quantity, after validating available batch stock and (unless overridden by an admin) rejecting
expired batches.

### C.17 `erp_followups`

`mr_id`, `customer_type`, `doctor_id`/`chemist_id` (XOR), `doctor_visit_id`/`chemist_visit_id`,
`followup_date` (idx), `description`, `status` (enum, default PENDING), `priority` (enum, default MEDIUM),
`completed_at`, audit columns.

### C.18 `erp_targets`

`mr_id` (nullable — a null `mr_id` with a `territory` = territory-level target), `territory`,
`period_start`, `period_end`, `target_type` (enum), `target_value` (numeric `> 0`), audit columns.
Check `period_end >= period_start`. Unique `(mr_id, target_type, period_start, period_end)`.

### C.19 `erp_audit_logs`

`user_id` (FK→erp_users, nullable), `action` (INSERT/UPDATE/DELETE/LOGIN/ADJUST), `table_name`,
`record_id`, `old_data` jsonb, `new_data` jsonb, `ip`, `created_at` (idx).
Written by trigger on: inventory transactions, both invoice tables, `erp_products`, `erp_users`.

### C.20 `erp_settings` — singleton config

`id` (check `id = 1`), `expiry_warning_days` (default 90), `mr_edit_window_hours` (default 24),
`allow_expired_sale` (default false), `financial_year_start_month` (default 4), `low_stock_multiplier`.

---

## D. RLS strategy

RLS is enabled on **all 21 tables**. Access is decided by four `SECURITY DEFINER` helpers
(same pattern the storefront already proved out in `20260724000001_admin_policies_use_is_admin_fn.sql`,
which fixed a real recursion/permission bug — so we follow it deliberately):

```sql
erp_current_user_id()  -- erp_users.id for auth.uid(), or null
erp_current_role()     -- erp_role, or null if not staff
erp_is_admin()         -- role = 'ADMIN'
erp_is_staff()         -- active row exists in erp_users
```

`SECURITY DEFINER` matters here: without it, evaluating a policy would require the calling role to
hold `SELECT` on `erp_users`, and nested policy evaluation would recurse.

| Table group | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| Masters — doctors, chemists, products, batches | any active staff | ADMIN; MR may insert doctors/chemists only | ADMIN (+MR on rows they created, within edit window) | nobody (soft-delete via `active`) |
| Masters — distributors, suppliers | ADMIN, ACCOUNTANT, MANAGER | ADMIN, ACCOUNTANT | ADMIN, ACCOUNTANT | nobody |
| `erp_users` | own row always; ADMIN all; MANAGER reads MRs | ADMIN | ADMIN (self: name/phone only) | nobody |
| Visits, visit products | own (`mr_id = erp_current_user_id()`); ADMIN/MANAGER all | MR for self only (`mr_id` forced to own id) | own, within `mr_edit_window_hours`; ADMIN any | ADMIN only |
| Field orders + items | own; ADMIN/MANAGER all | MR for self | own within window; ADMIN any; status changes ADMIN/MANAGER | ADMIN only |
| Follow-ups | own; ADMIN/MANAGER all | MR for self | own; ADMIN | ADMIN |
| Targets | own; ADMIN/MANAGER all | ADMIN | ADMIN | ADMIN |
| Purchase + sales invoices & items | ADMIN, ACCOUNTANT, MANAGER (**not MR**) | ADMIN, ACCOUNTANT | ADMIN, ACCOUNTANT (unpaid only) | nobody |
| `erp_inventory_transactions` | ADMIN, ACCOUNTANT, MANAGER | **nobody directly** — RPC (`SECURITY DEFINER`) only | revoked | revoked |
| `erp_audit_logs` | ADMIN | service-role trigger only | revoked | revoked |
| `erp_settings` | any staff | — | ADMIN | — |

Two structural guarantees beyond policies:

1. **MR identity cannot be spoofed.** Insert policies use `WITH CHECK (mr_id = erp_current_user_id())`,
   so an MR cannot file a visit under another MR's name even by crafting the request body.
2. **Inventory cannot be written directly.** `INSERT` on the ledger is revoked from `authenticated`
   entirely; the only writer is a `SECURITY DEFINER` RPC that validates stock, batch, and expiry first.

Table grants (`GRANT SELECT, INSERT, UPDATE ON … TO authenticated`) are issued alongside the policies —
RLS filters rows, grants permit the verb; both are needed.

---

## E. Authentication & authorization architecture

```
Supabase Auth (auth.users)
        │  email + password  →  session cookie (RS256 JWT)
        ▼
proxy.ts  ── EDGE GATE (fast, ~1ms, JWT decode only)
        │   /erp/**  requires session; app_metadata.erp_role must exist
        │   not authoritative — just cheap early rejection
        ▼
lib/erp/auth.ts  ── SERVER GATE (authoritative)
        │   requireErpUser()  → DB lookup of erp_users by auth.uid(), cached per request
        │   requireCapability('billing.sales.write') → 403 redirect otherwise
        ▼
PostgreSQL RLS  ── FINAL BACKSTOP
            even a compromised server action cannot read another MR's visits
```

- **Roles never come from the client.** `app_metadata.erp_role` is written by the server (service-role
  Auth Admin API) when an admin creates or updates a staff user; it is RS256-signed and unforgeable,
  but it is treated only as a *hint* for edge routing. Every decision that matters re-reads `erp_users`.
- **Provisioning:** admins create staff at `/erp/users`. The server creates the `auth.users` row
  (service-role), inserts `erp_users`, and stamps `app_metadata.erp_role`. Deactivation sets
  `active = false` — which `erp_is_staff()` checks, so access dies immediately without deleting history.
- **Capabilities, not role checks scattered in components.** `lib/erp/permissions.ts` holds one matrix:

```ts
export type Capability =
  | 'masters.read' | 'masters.write' | 'masters.create_customer'
  | 'visits.create' | 'visits.read.own' | 'visits.read.all'
  | 'orders.create' | 'orders.read.own' | 'orders.read.all' | 'orders.manage_status'
  | 'billing.purchase.read' | 'billing.purchase.write'
  | 'billing.sales.read'    | 'billing.sales.write'
  | 'inventory.read' | 'inventory.adjust'
  | 'users.manage' | 'targets.manage' | 'reports.read.all' | 'settings.manage'

const ROLE_CAPABILITIES: Record<ErpRole, readonly Capability[]> = { ADMIN: […], MR: […], … }
export function can(role: ErpRole, cap: Capability): boolean
```

  Adding a Sales Manager role later = one entry in that map, zero component edits (spec §5 "future roles").

---

## F. Folder structure

```
app/erp/
  layout.tsx                    server guard + role-aware shell
  login/page.tsx                staff login (own route group, no shell)
  dashboard/page.tsx            owner/admin overview
  mr/
    page.tsx                    MR home (mobile-first)
    doctor-visits/page.tsx      list • new/page.tsx  wizard • [id]/page.tsx
    chemist-visits/…            same shape
    orders/page.tsx             own field orders
    followups/page.tsx
  masters/
    doctors/ chemists/ distributors/ suppliers/ products/ batches/
  accounting/
    purchases/ (list, new, [id])   sales/ (list, new, [id])
    inventory/ (stock, adjustments, expiry)
  reports/   (mr, product, distributor, territory)
  users/  targets/  settings/

lib/erp/
  auth.ts            requireErpUser, requireCapability (React cache()'d)
  permissions.ts     capability matrix — single source of truth
  schemas.ts         Zod v4 schemas, shared client + server
  types.ts           row types + enums
  constants.ts       label maps, status colors
  format.ts          currency/date/qty formatting (en-IN, ₹)
  data/              read helpers (doctors, visits, dashboard, inventory, reports)
  actions/           'use server' mutations, one file per domain

components/erp/
  ErpShell.tsx  ErpSidebar.tsx  ErpBottomNav.tsx  (MR mobile)
  DataTable.tsx  StatCard.tsx  SearchSelect.tsx  (async, paginated — never loads all rows)
  EmptyState.tsx  ErrorState.tsx  SubmitButton.tsx  DateRangeFilter.tsx

supabase/migrations/
  20260904000001_erp_core.sql          enums, erp_users, settings, helpers, audit
  20260904000002_erp_masters.sql       doctors, chemists, distributors, suppliers, products, batches
  20260904000003_erp_field_force.sql   visits, visit products, field orders, items, followups, targets
  20260904000004_erp_billing_inventory.sql  purchases, sales, ledger, triggers
  20260904000005_erp_functions.sql     transactional RPCs + numbering + reporting
  20260904000006_erp_rls.sql           grants + every policy
supabase/erp_seed.sql                  dev seed data
supabase/tests/erp_business_rules.sql  SQL assertions for §60 rules
```

---

## G. Critical workflows

**MR doctor visit (single RPC, single transaction):**
```
select/search doctor ──► exists?  ── yes ─► doctor_status = EXISTING
        │                          no  ─► duplicate check (name+phone+area, trigram)
        │                                  ─► confirm new ─► doctor_status = NEW
        ▼
purpose • discussion • products discussed (1:N) • samples
        ▼
order received? ── yes ─► order_book_number + items (1:N)
        ▼
follow-up? ── yes ─► followup_date + description
        ▼
erp_create_doctor_visit(payload jsonb)   ← ONE transaction:
   1. if new doctor: insert erp_doctors (created_from_visit_id null)
   2. insert erp_doctor_visits (doctor_status stamped)
   3. if new doctor: update doctors.created_from_visit_id = visit.id
   4. insert erp_doctor_visit_products[]
   5. if order: insert erp_field_orders + erp_field_order_items[]
   6. if follow-up: insert erp_followups
   → all-or-nothing; client_request_id makes a retry idempotent
```

**Chemist visit:** identical minus `doctor_status` and product-detailing.

**Purchase:** supplier → invoice no./date → lines (product, batch no., mfg/exp, qty, free qty, rate,
disc%, GST) → `erp_save_purchase_invoice` recomputes every total, upserts batches, writes `PURCHASE`
ledger rows (**inventory ↑**).

**Distributor sale:** distributor → lines (product → batch picker showing on-hand + expiry, FEFO-sorted)
→ `erp_save_sales_invoice` validates stock and expiry, recomputes totals, writes negative `SALE`
ledger rows (**inventory ↓**). Insufficient stock or an expired batch aborts the whole invoice.

**Inventory adjustment:** admin picks product+batch, direction, quantity, **mandatory reason** →
`erp_adjust_inventory` writes an `ADJUSTMENT_IN`/`OUT`/`DAMAGE`/`EXPIRY` ledger row + audit log.
No path overwrites a quantity.

---

## H. Ambiguities — decisions taken (flagged for your correction)

The spec (§46, §63.G) says not to assume silently. These needed a business call; each has a working
default so implementation isn't blocked. **Any of these can be changed — tell me which.**

| # | Question | Default taken |
|---|---|---|
| Q1 | Should the pharma product master be the same catalog as the D2C storefront? | **No.** Independent (`erp_products`), with an optional link field. Different shapes, different audiences. |
| Q2 | Do field orders carry money value? Dashboard asks for "field-order value". | **Yes, indicative only** — `unit_rate` snapshotted from `sale_rate`. Explicitly not a price quote or receivable. |
| Q3 | Can an MR edit a visit after saving? | **Yes, own visits, within 24h** (`erp_settings.mr_edit_window_hours`), never delete. Admin unrestricted. |
| Q4 | GST — CGST/SGST vs IGST split stored, or derived? | **Derived.** Store `gst_rate` + `tax_amount` + `is_interstate`; split at print. Avoids double bookkeeping. |
| Q5 | Full return documents (credit/debit notes)? | **Deferred.** Returns are ledger transactions with reason + reference now; full return invoices are a later phase. |
| Q6 | Distributor outstanding — full payments ledger? | **Simplified:** `amount_paid` + `payment_status` on invoices; outstanding = `grand_total − amount_paid`. A payments table is a later phase if partial-payment history is needed. |
| Q7 | Can an MR create distributors or suppliers? | **No.** Doctors and chemists only. |
| Q8 | Territory — free text or master table? | **Free text**, indexed, with autocomplete from existing values. A territory master adds joins for little gain at this size. |
| Q9 | Should expired stock ever be sellable? | **Blocked by default**; `erp_settings.allow_expired_sale` gives admins an explicit override switch. |
| Q10 | Is `order_book_number` globally unique? | **No** — unique per MR. Different MRs carry different physical books that repeat numbers. |
| Q11 | Do MRs get logins immediately, or admin-provisioned? | **Admin-provisioned only.** No self-signup on `/erp` — public signup exists for storefront customers and must not leak into staff. |
| Q12 | Offline capture in v1? | **No, but architected for it** (D11 `client_request_id`, server-recomputed totals, cached masters). Nothing is reported as saved unless the server confirmed it (spec §43). |

---

## I. Phase plan

| Phase | Deliverable | Verification gate |
|---|---|---|
| **1** | Migrations 1–2 + 6 (core, masters, RLS), `lib/erp/*` foundation, `/erp/login`, `proxy.ts` guard, shell + nav, `/erp/dashboard` skeleton | `npm run build` clean; unauthenticated `/erp/*` redirects; non-staff blocked |
| **2** | Masters CRUD: products, batches, doctors, chemists, distributors, suppliers + paginated search | Create/edit/deactivate each; search returns paginated results, never full tables |
| **3** | Doctor + chemist visits, multi-product detailing, new-vs-existing logic, duplicate detection, mobile MR flow | Two MRs visit one doctor; new doctor marked NEW; product lines persist |
| **4** | Field orders from both visit types, order-book number, MR order history, admin status management | Order saved with N items; **no sales invoice created** |
| **5** | Purchase + sales billing with server-side totals, batch selection, inventory movement | Purchase ↑ stock, sale ↓ stock, totals recomputed, duplicate invoice number rejected |
| **6** | Inventory: stock view, adjustments, expiry/near-expiry, low stock, valuation | Adjustment writes ledger row + audit; batch balance = SUM(ledger) |
| **7** | Dashboards (owner + MR), MR performance, targets, follow-ups, reports, exports | Filters by date/MR/territory/product return correct figures |
| **8** | RLS audit, business-rule SQL tests, Playwright route-protection specs, seed data, README + deployment docs | Test suite runs; RLS verified per-role |

Each phase ends with a passing `npm run build` before the next begins (spec §61).

---

## J. What I cannot verify locally

There is **no `.env.local`** in this repo and no Supabase credentials, so migrations cannot be applied
and DB-dependent flows cannot be exercised from here. Migrations are written to run via
`supabase db push` (or pasted into the SQL editor) and are ordered/idempotent. Anything I have not
actually run will be reported as unverified rather than claimed as working.

---

## K. Implementation status — 2026-09-05

All eight phases are built. Operator documentation is in [docs/ERP.md](../ERP.md).

### Delivered

| Area | Files |
|---|---|
| Schema, RLS, business logic | `supabase/migrations/20260904000001–7_erp_*.sql` — 7 migrations, 22 tables, 13 enums, 24 functions |
| Auth & authorization | `lib/erp/auth.ts`, `lib/erp/permissions.ts`, `proxy.ts` |
| Validation | `lib/erp/schemas.ts` (Zod), `lib/erp/invoice-math.ts` |
| Reads | `lib/erp/data/*` — masters, visits, billing, inventory, dashboard, users, settings |
| Writes | `lib/erp/actions/*` — masters, visits, billing, admin, lookup |
| Screens | 32 routes under `/erp` |
| Components | `components/erp/*` — shell, nav, tables, pickers, visit forms, invoice forms |
| Seed | `scripts/erp-seed.js` (`npm run erp:seed`) |
| Tests | `supabase/tests/erp_business_rules.sql`, `e2e/erp-access.spec.ts` |

### Deviations from the plan above

- **Migration count is 7, not 6.** Reporting aggregates earned their own file
  (`20260904000007_erp_reporting.sql`) rather than being folded into the functions migration.
- **`erp_link_doctor_to_visit` / `erp_link_chemist_to_visit` were added.** The visit RPCs are
  `SECURITY INVOKER` by design, but the final back-reference update on a newly created doctor is
  governed by the MR edit-window policy — and an admin setting that window to `0` would have made
  the update silently write nothing, leaving a "new" doctor with no originating visit. These two
  narrow `SECURITY DEFINER` helpers close that hole.
- **Cross-table searches resolve ids first.** PostgREST does not filter parent rows by an embedded
  table's column unless the join is inner, so batch and visit searches run a small id lookup and
  then filter on a top-level column. Correct rather than clever.

### Verified here

- `npm run build` — compiles clean; all 32 `/erp` routes registered as dynamic.
- `npx tsc --noEmit` — zero errors across `lib/erp`, `app/erp`, `components/erp`, `proxy.ts`
  (the repo has pre-existing errors elsewhere, which is why `ignoreBuildErrors` is set).
- `npx eslint` — clean across the same paths.
- All 7 migrations plus the test suite parse under a real PostgreSQL parser (`libpg-query`).

### NOT verified here — needs a database

No `.env.local` and no Docker in this environment, so nothing has been executed against
PostgreSQL. Unverified until someone runs it:

1. Migrations applying cleanly end to end.
2. `supabase/tests/erp_business_rules.sql` passing — this is the real test of the RLS policies,
   the inventory triggers and the invariants. **Run this first.**
3. `npm run erp:seed`, and the screens against real data.
4. PL/pgSQL function bodies: the parser used here validates statement syntax, not the inside of a
   `$$ … $$` body, and nothing type-checks column references without a live catalogue.

### Still open

Q1, Q4, Q5, Q7, Q8, Q10, Q11 and Q12 in section H stand as taken. Q2, Q3, Q6 and Q9 were confirmed
and refined — see section L.

---

## L. Confirmed decisions — 2026-09-05

Q2, Q3, Q6 and Q9 were confirmed by the business owner, two of them with requirements beyond what
had been assumed. Delivered in three additive migrations
(`20260905000001–3`) plus the application changes below.

### Why additive migrations rather than editing 1–7

Nothing had been applied to a database from this environment, so editing the original seven in
place would have produced a tidier history. It was rejected anyway: there is no way to verify from
here whether `supabase db push` has been run against a real Supabase project. If it had, an
in-place edit would leave that database silently diverged, because an already-applied migration is
never re-run. The additive set is correct in both worlds, and every statement is guarded
(`if not exists`, `drop … if exists`, an enum-rename check) so the whole sequence is re-runnable.

### Q2 — Field orders carry an estimated monetary value · **CONFIRMED, extended**

Value already existed as `quantity × rate`. Added: a **discount** per line, expressed as a percent
to match how purchase and sales invoice lines already work.

- `erp_field_order_items.discount_percent numeric(5,2)`, constrained to 0–100
- `line_value` regenerated as `round(quantity × unit_rate × (1 − discount_percent/100), 2)`
- existing orders' `estimated_value` recomputed once in the migration
- `erp_insert_field_order_items()` extracted so the doctor and chemist visit workflows cannot
  drift apart; both RPCs re-declared to use it and to carry the discount through
- UI relabelled from "indicative" to **Estimated field order value**, with a standing note at the
  point of entry that it is not a sale, moves no stock and creates nothing to collect

The separation is now asserted structurally in the test suite: `erp_field_orders` must have no
`sales_invoice` reference, and no `amount_paid`, `payment_status` or `batch_id` column.

### Q3 — 24-hour MR edit window · **CONFIRMED, already built**

`erp_settings.mr_edit_window_hours` (default 24), `erp_within_edit_window()` and the RLS policies
on visits, field orders, follow-ups and MR-created customers were already in place and enforced in
the database. Two gaps closed:

- `erp_followups.updated_by` added, so all four audit columns exist on every operational table
- an audit trigger added to `erp_field_orders` — it now carries a monetary value and a fulfilment
  status that management can change

### Q6 — Payment tracking on both sides · **CONFIRMED, replaced the old model**

The single `amount_paid` column was explicitly rejected as a source of truth. Replaced with:

| | |
|---|---|
| `erp_purchase_payments` | money Leomed pays suppliers |
| `erp_sales_receipts` | money distributors pay Leomed |

Both record date, amount, method, reference number, remarks, `created_by`, `created_at`. Both are
audited, RLS-protected (admin + accountant write, administrator-only delete, MRs excluded
entirely), and guarded against overpayment by a trigger that locks the invoice row first so
concurrent payments cannot jointly overshoot.

**`amount_paid` survives as a trigger-maintained cache**, the same pattern
`erp_product_batches.current_quantity` already uses for the inventory ledger. Its `UPDATE` grant is
revoked, so it can only be produced by the payment history. This is what kept the blast radius
small: every existing report, dashboard tile and outstanding calculation reads `amount_paid` and
needed no change. `erp_reconcile_invoice_payments()` proves cache and history agree.

Also: the `erp_payment_status` enum value `PARTIAL` renamed to `PARTIALLY_PAID` as specified; both
invoice RPCs re-declared so money settled at billing time becomes the first payment row rather
than a figure written onto the invoice.

Explicitly not built, per the brief: double-entry, general ledger, trial balance, P&L,
balance sheet.

### Q9 — Expired stock blocked by default · **CONFIRMED, override strengthened**

The existing implementation blocked expired sales, but its override was a single global settings
flag — no reason, no approver, no record. That was weaker than the confirmed requirement. Now two
gates stand in front of it:

1. `erp_settings.allow_expired_sale` — the business decision, off by default
2. per invoice: an **administrator**, a **mandatory written reason**, the approver and timestamp
   stored on the invoice, and a dedicated `EXPIRED_SALE_OVERRIDE` audit record

New columns on `erp_sales_invoices` (`expired_sale_override`, `_reason`, `_approved_by`,
`_approved_at`) with a CHECK constraint making an incomplete override impossible. The sales form
shows a red authorisation panel naming every expired batch, and the saved invoice carries a
permanent visible notice. Failing any gate aborts the whole invoice — no partial write.

### Verified for this change set

`npm run build` compiles clean · `tsc --noEmit` zero errors across ERP paths · `eslint` clean ·
all 10 migrations and the test suite parse under a real PostgreSQL parser.

Still **not** verified: nothing has been executed against PostgreSQL. Run
`supabase/tests/erp_business_rules.sql` first — it now also covers the worked payment examples
from the brief (₹1,00,000 paid 40k + 30k; ₹2,00,000 received 50k + 75k + 25k), overpayment
refusal, discount arithmetic, and all four expiry gates.
