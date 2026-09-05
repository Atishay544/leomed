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
  'followups.manage',

  // Money
  'billing.purchase.read',
  'billing.purchase.write',
  'billing.sales.read',
  'billing.sales.write',

  // Stock
  'inventory.read',
  'inventory.adjust',

  // Administration
  'users.manage',
  'targets.manage',
  'reports.read.all',
  'settings.manage',
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
  VIEWER:     'Viewer',
}

/** Where each role lands after signing in. */
export function homeRouteFor(role: ErpRole): string {
  switch (role) {
    case 'MR':         return '/erp/mr'
    case 'ACCOUNTANT': return '/erp/accounting/sales'
    default:           return '/erp/dashboard'
  }
}
