# Leomed Pharma — Field Force, Sales, Billing & Inventory System

An internal business system for medical representatives, doctors, chemists, distributors,
purchases, sales, batch inventory and reporting. It lives inside the same Next.js app as the
public storefront but is otherwise a separate system.

**Where it lives:** `/erp` · **Who can use it:** staff accounts only, created by an administrator.

---

## 1. Three things that must never be confused

| | Field order | Purchase invoice | Sales invoice |
|---|---|---|---|
| Who | Doctor / chemist → MR | Supplier → Leomed | Leomed → distributor |
| What it measures | Demand and MR performance | What Leomed bought | Actual company revenue |
| Inventory | **No effect** | Adds stock | Deducts stock |
| Money | **Estimated value only** | Payable to supplier | Receivable from distributor |
| Table | `erp_field_orders` | `erp_purchase_invoices` | `erp_sales_invoices` |
| Payments | none | `erp_purchase_payments` | `erp_sales_receipts` |
| Screen | Field Orders | Accounting → Purchases | Accounting → Sales |

**A field order never becomes a sales invoice.** There is no foreign key, no trigger and no code
path between them. When an MR records "Dr Sharma wants 20 boxes of Product A", that is a demand
signal — fulfilment usually happens through the distributor network. Leomed's own sale of 100
boxes to Distributor X is a separate event with its own invoice, its own stock movement and its
own receipts.

### Field orders do carry money — but it is an estimate

Each order line records product, quantity, rate and discount, giving an **estimated field order
value**. That figure exists for MR performance evaluation, demand tracking and understanding
potential business. It is labelled "estimated" everywhere it appears, and it:

- does **not** reduce inventory
- does **not** count as a sale
- does **not** create anything to collect
- does **not** appear in financial accounting

The schema enforces this rather than relying on discipline: `erp_field_orders` has no payment
columns, no batch column, and no reference to any invoice — and the test suite asserts all of it.

---

## 2. Setup

### 2.1 Apply the migrations

Ten migrations, applied in filename order:

```
supabase/migrations/20260904000001_erp_core.sql              enums, staff, settings, audit, helpers
supabase/migrations/20260904000002_erp_masters.sql           doctors, chemists, distributors,
                                                             suppliers, products, batches
supabase/migrations/20260904000003_erp_field_force.sql       visits, field orders, follow-ups, targets
supabase/migrations/20260904000004_erp_billing_inventory.sql purchases, sales, inventory ledger
supabase/migrations/20260904000005_erp_functions.sql         transactional business logic
supabase/migrations/20260904000006_erp_rls.sql               grants and row-level security
supabase/migrations/20260904000007_erp_reporting.sql         dashboard and report aggregates
supabase/migrations/20260905000001_erp_payment_tracking.sql  payment & receipt history
supabase/migrations/20260905000002_erp_field_order_value.sql field order pricing, audit gaps
supabase/migrations/20260905000003_erp_expiry_override.sql   expired-stock authorisation
```

The last three are additive: they alter and extend what the first seven create, so the set applies
cleanly whether or not the earlier ones have already been run against this database.

With the Supabase CLI:

```bash
supabase db push
```

Or paste each file, in order, into the Supabase SQL editor.

They are additive: they create only `erp_`-prefixed objects and touch nothing belonging to the
storefront. Re-running them is safe.

### 2.2 Environment

The ERP needs the same three variables the storefront already uses. Nothing new:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # server-side only, never exposed to the browser
```

### 2.3 First administrator

Every staff account is created by another administrator, so the first one is made by hand.

Either run the seed (below), which creates one, or create it directly: add the person in Supabase
Auth, then insert their staff record —

```sql
insert into public.erp_users (auth_user_id, name, email, role)
values ('<auth.users.id>', 'Your Name', 'you@leomedpharma.com', 'ADMIN');
```

Sign in at `/erp/login`.

### 2.4 Sample data (development only)

```bash
npm run erp:seed
```

Creates four logins — an admin, two MRs and an accountant — plus doctors, chemists,
distributors, suppliers, eight products with mixed-expiry batches, a week of visits, field
orders, a purchase invoice and three sales invoices in different payment states. It is
re-runnable and skips what already exists.

The passwords it prints are development passwords. Change them before the database holds anything
real.

---

## 3. Roles

| Role | Sees | Can change |
|---|---|---|
| **Admin** | Everything | Everything |
| **MR** | Own visits, own field orders, own follow-ups, shared customer and product masters | Own visits and orders (within the edit window), new doctors and chemists |
| **Accountant** | Purchases, sales, inventory, suppliers, distributors | Invoices, stock via billing, trade partners |
| **Manager** | Whole field force, plus billing and inventory read-only | Field-order status |
| **Viewer** | Reports and masters, read-only | Nothing |

An MR cannot read another MR's numbers, company invoices, or the inventory ledger — and cannot
reprice a product, adjust stock, or promote themselves. None of that depends on the interface:
it is enforced by row-level security in PostgreSQL, so it holds against a direct API call too.

Adding a role later (Area Manager, Warehouse Manager) means one entry in
`lib/erp/permissions.ts` and the matching RLS policy. No component changes.

---

## 4. Daily use

### An MR records a visit

`/erp/mr` → **Doctor visit** or **Chemist visit**

1. Search for the doctor, or switch to **New doctor** and add them. If the name or phone looks
   like someone already in the master, the form says so before creating a duplicate.
2. Fill in the visit — date, purpose, what was discussed.
3. Add every product detailed. One visit can cover several.
4. If an order was given: switch **Order received** on, enter the physical order-book number,
   and add the products and quantities.
5. Schedule a follow-up if one is needed.
6. Save.

The whole thing lands in one database transaction. A dropped connection saves nothing rather than
half of it, and tapping Save twice records one visit, not two.

Whether the doctor was **new** or **existing** is stamped at the moment of saving, from the
workflow the MR actually used — not guessed later from a creation date.

### Accounting records a purchase

`/erp/accounting/purchases` → **Record purchase**

Choose the supplier and enter their invoice number. Each line needs a batch number and expiry —
that is what makes the stock recallable later. Free quantity adds stock without adding cost.
Saving creates the batches and adds the stock.

If anything was paid on the spot, enter it under **Paid now**; it becomes the first entry in the
invoice's payment history. Leave it at zero for an unpaid bill.

### Accounting raises a sale

`/erp/accounting/sales` → **New sales invoice**

Choose the distributor, add products; the batch expiring soonest is offered first. Saving deducts
the stock. If a batch is short, the whole invoice is refused — stock and paperwork never disagree.
Expired batches are blocked outright (see below).

Invoice numbers are issued by the system, per financial year: `INV/2026-27/00001`.

### Recording payments and receipts

Open any invoice → the **Payments** or **Receipts** panel.

An invoice can be settled over as many payments as it takes. Each entry records the amount, date,
method (cash, cheque, bank transfer, UPI, card, credit note) and a reference such as a cheque or
UTR number, along with who entered it and when.

A ₹1,00,000 supplier bill paid ₹40,000 on the 5th and ₹30,000 on the 15th reads:

```
Total     ₹1,00,000
Paid        ₹70,000
Balance     ₹30,000
Status    PARTIALLY_PAID
```

Nothing here is typed in as a balance. The total paid, the outstanding amount and the status are
all derived by the database from the payment rows, and a payment that would take the total past
the invoice value is refused. Removing a payment (administrators only) puts the balance back and
leaves a record in the audit log.

### Selling expired stock

Expired batches cannot be sold. That is the default and it needs no configuration.

If the business decides to allow exceptions, an administrator turns on **Allow expired stock to
be sold** in Settings. Even then, every such invoice requires:

- an **administrator** raising it — an accountant cannot
- a **written reason**, recorded on the invoice itself
- the approver's name and the time, stored alongside it
- an entry in the audit log, findable under `EXPIRED_SALE_OVERRIDE`

The invoice then carries a permanent, visible notice explaining why expired stock was sold and
who authorised it. A line whose batch is short, or an expired line without all of the above,
aborts the entire invoice.

### Adjusting stock

`/erp/accounting/inventory` → **Adjust stock**

Pick the batch, the kind of movement, the quantity and — required — the reason. The adjustment is
added to the ledger and the audit log. Nothing overwrites a stock figure; corrections are new
entries, so the history stays readable.

---

## 5. How inventory is kept honest

`erp_inventory_transactions` is the truth. Every row is signed: positive adds stock, negative
removes it, so a batch's balance is a plain sum. The ledger is append-only — a trigger refuses
updates and deletes, and corrections are posted as reversing entries.

`erp_product_batches.current_quantity` is a cache of that sum, maintained by a trigger so stock
screens stay fast. No application code can write it: the `UPDATE` grant to `authenticated`
excludes the column entirely.

To prove the two agree:

```sql
select * from public.erp_reconcile_batch_quantities();
```

An empty result means everything matches. Any rows are shown as a warning at the top of the
inventory screen, and the seed script checks it as its last step.

**Invoice balances work the same way.** `erp_purchase_payments` and `erp_sales_receipts` are the
truth; `amount_paid` on each invoice is a trigger-maintained sum of them, and its UPDATE grant is
revoked so no request can restate it. The equivalent check:

```sql
select * from public.erp_reconcile_invoice_payments();
```

---

## 6. Testing

```bash
# Business rules, against a database with the migrations applied
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/erp_business_rules.sql

# Route protection, against a running app
npm run erp:test:e2e
```

The SQL suite runs in a transaction that is rolled back, so it leaves nothing behind. It covers
the rules the spec calls out: multiple MRs visiting one doctor, multiple products per visit, new
vs existing doctors, the doctor/chemist exclusivity on field orders, order-book numbering,
field-order line pricing with discounts, purchases raising stock and sales lowering it, negative
stock being refused, the ledger being immutable, duplicate invoice numbers being rejected,
multi-payment settlement with derived balances and status, overpayment being refused, expired
stock being blocked and its override requiring an administrator plus a reason plus an audit
record, and the row-level security rules for each role.

Role rules are tested in SQL rather than through the browser on purpose: the browser can only show
that a button is hidden, while these run as `authenticated` with a JWT claim — exactly what a
request from the outside looks like.

---

## 7. How the code is arranged

```
app/erp/
  login/                     staff sign-in (outside the guarded layout)
  (app)/                     everything behind the auth guard
    dashboard/  mr/  masters/  accounting/  reports/  targets/  users/  audit/  settings/

lib/erp/
  auth.ts                    who is signed in, and what they may do
  permissions.ts             the capability matrix — one place, not scattered
  schemas.ts                 Zod validation for every mutation
  invoice-math.ts            line and tax arithmetic (preview only; the server recomputes)
  data/                      reads — all paginated, all through the caller's RLS session
  actions/                   writes — 'use server', each re-checks its capability

components/erp/              shell, navigation, tables, forms, pickers
supabase/migrations/         the schema, reproducible from scratch
supabase/tests/              business-rule assertions
scripts/erp-seed.js          development data
```

### Three layers of authorization

```
proxy.ts            edge gate — is anyone signed in? (fast, not authoritative)
lib/erp/auth.ts     server gate — who are they, and may they do this?
PostgreSQL RLS      the backstop — holds even if the layers above were bypassed
```

They are deliberately redundant. If they ever disagree, the database wins.

### Conventions worth knowing

- **Every table is prefixed `erp_`.** The same database serves the live storefront, which owns
  `products`, `orders` and `profiles`. The prefix means the two can never collide.
- **Staff are `erp_users`, not `profiles`.** Shoppers and field staff are different populations
  with different roles. One person can be both.
- **Money is calculated in PostgreSQL.** Totals submitted by a browser are discarded. The figures
  on screen while typing are a preview, and say so.
- **Nothing is deleted.** Doctors, chemists, products and staff are deactivated, so past visits
  and invoices keep their subject and their author.
- **Lists are paginated and searched server-side.** No screen loads a whole table.

---

## 8. Settings

`/erp/settings` (admin only):

| Setting | Default | Effect |
|---|---|---|
| Expiry warning window | 90 days | What counts as "expiring soon" everywhere |
| MR edit window | 24 hours | How long an MR can still edit their own visits, orders, follow-ups and the customers they added; enforced in the database, not just the interface |
| Allow expired stock to be sold | Off | While off, the database refuses any sales line using an expired batch. Turning it on does not permit expired sales outright — it only makes an administrator's explained, audited override possible |
| Financial year starts | April | Used in generated invoice and order numbers |

---

## 9. Known scope

Deliberately deferred, with the reasoning recorded in
[the implementation plan](plans/2026-09-04-erp-field-force-implementation.md#h-ambiguities--decisions-taken):

- **Full accounting.** Payment tracking is deliberately simplified for version 1: no double-entry,
  no general ledger, no trial balance, no P&L, no balance sheet. The payment tables are shaped so
  those can be layered on without reworking them.
- **Credit and debit notes.** Returns are ledger movements with a reason today, not full documents.
- **Overpayments.** A payment cannot exceed the invoice balance. Allowing advances or overpayment
  would need an explicit administrator-approved workflow, which does not exist yet.
- **Offline capture.** The groundwork is in place — every field record carries an idempotency key,
  totals are recomputed server-side, and nothing reports success without the server confirming it —
  but there is no offline queue yet.
- **Territory master.** Territory is indexed free text, not a table.

Each of these is additive. None requires reworking what is here.
