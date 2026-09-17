import type { ErpRole } from './types'

/**
 * The single source of truth for who may do what.
 *
 * The spec is explicit that authorization must not be hard-coded across dozens
 * of components (§5) and that hiding a menu is not security (§36). So:
 *
 *   - This file decides what the UI OFFERS and what a server action ACCEPTS.
 *   - PostgreSQL RLS decides what the database ACTUALLY ALLOWS.
 *
 * The two are intentionally redundant. If they ever disagree the database
 * wins, which is the safe direction. Adding a role later (Sales Manager, Area
 * Manager, Warehouse Manager…) means one entry in ROLE_CAPABILITIES plus the
 * matching RLS policy — no component changes.
 */

export const CAPABILITIES = [
  // Master data
  'masters.read',            // see products, doctors, chemists, distributors
  'masters.write',           // create/edit distributor & supplier masters (trade partners)
  'products.write',          // create/edit the product master — ADMIN only, deliberately
                              // separate from masters.write: erp_products' RLS is
                              // erp_is_admin()-only, so this capability must never be
                              // granted to ACCOUNTANT even though ACCOUNTANT holds
                              // masters.write for distributors/suppliers. Conflating the
                              // two previously let an accountant reach the product-edit
                              // UI, submit successfully past this check, and have the
                              // write silently dropped by RLS (found in pre-PR review).
  'masters.create_customer', // add a doctor or chemist (MRs do this in the field)

  // Field force
  'visits.create',
  'visits.read.own',
  'visits.read.all',
  'orders.create',
  'orders.read.own',
  'orders.read.all',
  'orders.manage_status',
  // Reviewing an MR's self-reported invoice (accept/reject) decides what
  // counts toward incentive calculation — ADMIN only, deliberately not
  // added to MANAGER_CAPABILITIES even though orders.manage_status is.
  'orders.review_invoice',
  'followups.manage',

  // Money
  'billing.purchase.read',
  'billing.purchase.write',
  'billing.sales.read',
  'billing.sales.write',
  // Deleting a raised invoice rewrites financial and stock history — ADMIN
  // only, deliberately separate from billing.*.write which ACCOUNTANT also
  // holds. The RPC itself independently checks erp_is_admin() too (database
  // wins if the two ever disagree, per this file's own rule).
  'billing.purchase.delete',
  'billing.sales.delete',

  // Stock
  'inventory.read',
  'inventory.adjust',
  // Landing cost and MRP valuation of stock on hand — deliberately
  // ADMIN-only (granted to no other role below): it reveals purchase
  // pricing and margin, unlike inventory.read's plain quantities, which
  // accountants and managers already need for day-to-day billing.
  'inventory.valuation',

  // Negotiated pricing and schemes — ADMIN-only. An accountant raises sales
  // invoices (billing.sales.write) and sees the resulting selling rate, but
  // never the margin %, pricing-rule detail or scheme configuration behind
  // it (spec §30) — that distinction is enforced by which capability this
  // is, not by hiding a field in a component.
  'pricing.manage',

  // Administration
  // Staff accounts — held by ADMIN and HR. The RLS layer still refuses HR
  // the one thing this capability alone would otherwise let them do: create
  // or edit an ADMIN account (see erp_users_insert/update in
  // 20260918000006_hr_role.sql) — "admin has master role for everything"
  // means HR administers everyone ELSE, never admin itself.
  'users.manage',
  'targets.manage',
  'reports.read.all',
  'settings.manage',
  // Company-wide change history — deliberately its own capability rather
  // than reusing users.manage (which it did until HR needed users.manage
  // too): audit log rows span every table in the ERP, not just HR's own
  // ground, so granting HR staff-management must not also hand them that.
  // ADMIN-only, held by no other role below.
  'audit.read',
  // Offer letters — compensation data on a candidate who isn't even a staff
  // member yet, and the flow that eventually creates one (users.manage).
  // Held by ADMIN and HR — this IS routine HR work.
  'offers.manage',
  // Territories & areas — who covers what, and which distributor owns
  // which territory. Held by ADMIN and HR: HR owns field-force org
  // structure (who's assigned where), same as it owns who's on staff at all.
  'territories.manage',

  // HR: attendance — every non-admin employee checks in; ADMIN deliberately
  // never holds 'attendance.checkin' in spirit (enforced in the RPCs and in
  // nav-config's excludeRoles, since ADMIN structurally inherits every
  // capability below — see the note on ADMIN_CAPABILITIES).
  'attendance.checkin',
  'attendance.read.own',
  'attendance.read.all',
  'attendance.manage',   // rules, holidays, MR visit-target overrides, corrections

  // HR: leave
  'leave.apply',
  'leave.read.own',
  'leave.manage',        // approve/reject/cancel/create on anyone's behalf

  // HR: payroll & salary — held by ADMIN and HR only (see
  // ACCOUNTANT_CAPABILITIES' note on why billing access does not imply
  // payroll access — that reasoning is about ACCOUNTANT specifically, not
  // about payroll being admin-exclusive, which it no longer is now HR exists).
  'payroll.manage',      // salary structures, generate/finalize/reopen payroll
  'payroll.read.own',    // an employee's own payslips — never another's

  // HR: expenses
  'expenses.submit',
  'expenses.read.own',
  'expenses.manage',     // approve/reject/mark paid, read every employee's
] as const

export type Capability = (typeof CAPABILITIES)[number]

const ADMIN_CAPABILITIES: readonly Capability[] = CAPABILITIES

/**
 * An MR sees their own work and the shared customer/product masters, and
 * nothing about company money. They cannot touch inventory, invoices,
 * products, distributors, other users, or another MR's numbers (spec §5).
 */
const MR_CAPABILITIES: readonly Capability[] = [
  'masters.read',
  'masters.create_customer',
  'visits.create',
  'visits.read.own',
  'orders.create',
  'orders.read.own',
  'followups.manage',
  'attendance.checkin',
  'attendance.read.own',
  'leave.apply',
  'leave.read.own',
  'payroll.read.own',
  'expenses.submit',
  'expenses.read.own',
]

/**
 * Purchases, sales, inventory and the trade partners behind them. Deliberately
 * without users.manage or targets.manage: accounting access must not imply
 * field-force administration (spec §5, §36).
 *
 * Deliberately without products.write, too: an accountant enters purchase
 * rates on invoices but does not define the product master (spec §13,
 * "only admins may define products") — erp_products' RLS enforces the same
 * line, so this list must not add products.write without also changing that.
 *
 * inventory.adjust IS included: an accountant owns the ledger end-to-end —
 * purchase/sales invoices already move stock through their hands, and manual
 * corrections (damage, expiry write-off, opening balance) are part of the
 * same job. erp_adjust_inventory() checks erp_can_write_billing() (ADMIN or
 * ACCOUNTANT) to match, not erp_is_admin() alone.
 *
 * billing.purchase.read/write are ALSO deliberately kept, even though the
 * pricing-engine spec says an Accountant must never see landing/purchase
 * cost: that rule is about the SALES side (never let selling-price screens
 * leak the margin behind them — see erp_explain_price()'s role-filtered
 * shape and masters/batches' inventory.valuation gate). An accountant who
 * enters a supplier's purchase invoice necessarily sees the cost on that
 * invoice — it IS the record they're keying in — so restricting it there
 * would break their actual job. Confirmed as the intended scope with the
 * business (2026-09-07); do not "fix" this without a product decision to
 * change it.
 */
const ACCOUNTANT_CAPABILITIES: readonly Capability[] = [
  'masters.read',
  'masters.write',
  'billing.purchase.read',
  'billing.purchase.write',
  'billing.sales.read',
  'billing.sales.write',
  'inventory.read',
  'inventory.adjust',
  'attendance.checkin',
  'attendance.read.own',
  'leave.apply',
  'leave.read.own',
  'payroll.read.own',
  'expenses.submit',
  'expenses.read.own',
]

/** Reads the whole field force and the money, changes only order status. */
const MANAGER_CAPABILITIES: readonly Capability[] = [
  'masters.read',
  'visits.read.own',
  'visits.read.all',
  'orders.read.own',
  'orders.read.all',
  'orders.manage_status',
  'followups.manage',
  'billing.purchase.read',
  'billing.sales.read',
  'inventory.read',
  'reports.read.all',
  'attendance.checkin',
  'attendance.read.own',
  'attendance.read.all',
  'leave.apply',
  'leave.read.own',
  'payroll.read.own',
  'expenses.submit',
  'expenses.read.own',
]

/**
 * Personnel administration end to end: staff accounts, offer letters,
 * territory/area org structure, attendance, leave, payroll and expenses —
 * everything this file's capability comments tag "HR:" above. Deliberately
 * without masters.write, products.write, any billing or pricing.manage
 * capability, any inventory capability, targets.manage, reports.read.all or
 * settings.manage: none of that is personnel administration, and HR seeing
 * sales/margin/inventory data would be the same kind of capability-
 * conflation this file exists to prevent (see ACCOUNTANT_CAPABILITIES' and
 * MANAGER_CAPABILITIES' notes for the same principle applied elsewhere).
 *
 * "Admin has master role for everything" is enforced BELOW this list, not
 * by omission from it: users.manage/offers.manage alone would let HR create
 * or promote someone to ADMIN, so the RLS policies in
 * 20260918000006_hr_role.sql additionally refuse HR any write that creates,
 * edits, or targets an ADMIN account. HR is not in ADMIN_CAPABILITIES'
 * reverse either — no capability here grants oversight of admin's own
 * actions (that is audit.read, ADMIN-only, on purpose).
 */
const HR_CAPABILITIES: readonly Capability[] = [
  'users.manage',
  'offers.manage',
  'territories.manage',
  'attendance.checkin',
  'attendance.read.own',
  'attendance.read.all',
  'attendance.manage',
  'leave.apply',
  'leave.read.own',
  'leave.manage',
  'payroll.manage',
  'payroll.read.own',
  'expenses.submit',
  'expenses.read.own',
  'expenses.manage',
]

/**
 * Read-only observer — management or audit, no writes anywhere.
 *
 * `.read.own` is listed alongside `.read.all` because the visit and order
 * screens gate on `.own` (everyone reaching them has at least their own to
 * see) and widen to everything for whoever also holds `.all`. Granting only
 * `.all` would hide the very pages this role exists to look at.
 */
const VIEWER_CAPABILITIES: readonly Capability[] = [
  'masters.read',
  'visits.read.own',
  'visits.read.all',
  'orders.read.own',
  'orders.read.all',
  'reports.read.all',
]

export const ROLE_CAPABILITIES: Record<ErpRole, readonly Capability[]> = {
  ADMIN:      ADMIN_CAPABILITIES,
  MR:         MR_CAPABILITIES,
  ACCOUNTANT: ACCOUNTANT_CAPABILITIES,
  MANAGER:    MANAGER_CAPABILITIES,
  HR:         HR_CAPABILITIES,
  VIEWER:     VIEWER_CAPABILITIES,
}

export function can(role: ErpRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role]?.includes(capability) ?? false
}

export function canAny(role: ErpRole, capabilities: readonly Capability[]): boolean {
  return capabilities.some(c => can(role, c))
}

export const ROLE_LABELS: Record<ErpRole, string> = {
  ADMIN:      'Administrator',
  MR:         'Medical Representative',
  ACCOUNTANT: 'Accountant',
  MANAGER:    'Manager',
  HR:         'HR',
  VIEWER:     'Viewer',
}

/** Where each role lands after signing in. */
export function homeRouteFor(role: ErpRole): string {
  switch (role) {
    case 'MR':         return '/erp/mr'
    case 'ACCOUNTANT': return '/erp/accounting/sales'
    case 'HR':          return '/erp/hr'
    default:           return '/erp/dashboard'
  }
}
