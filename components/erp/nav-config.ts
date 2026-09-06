import {
  LayoutDashboard, Stethoscope, Store, UserRound, Users, Package, Boxes,
  ClipboardList, CalendarClock, Receipt, ShoppingCart, Warehouse, Truck,
  Factory, BarChart3, Target, Settings, ScrollText, Globe, Fingerprint,
  CalendarDays, SlidersHorizontal, type LucideIcon,
} from 'lucide-react'
import { can, type Capability } from '@/lib/erp/permissions'
import type { ErpRole } from '@/lib/erp/types'

/**
 * Navigation is derived from the same capability matrix that guards the pages
 * and the server actions. A menu entry can never appear for someone who would
 * be refused on arrival, and hiding one is never the only thing stopping them.
 */

export interface ErpNavItem {
  href: string
  label: string
  icon: LucideIcon
  capability: Capability
  /** ADMIN structurally holds every capability (see ADMIN_CAPABILITIES in
   *  permissions.ts) but must never see attendance/leave self-service —
   *  admins don't clock in. This filters an item out for specific roles even
   *  though their capability check alone would pass. */
  excludeRoles?: ErpRole[]
}

export interface ErpNavGroup {
  label: string
  items: ErpNavItem[]
}

const ALL_GROUPS: ErpNavGroup[] = [
  {
    label: 'Overview',
    items: [
      { href: '/erp/dashboard', label: 'Dashboard', icon: LayoutDashboard, capability: 'reports.read.all' },
      { href: '/erp/mr',        label: 'My Day',    icon: ClipboardList,   capability: 'visits.read.own' },
      {
        href: '/erp/attendance', label: 'My Attendance', icon: Fingerprint,
        capability: 'attendance.checkin', excludeRoles: ['ADMIN'],
      },
      {
        href: '/erp/leave', label: 'My Leave', icon: CalendarDays,
        capability: 'leave.apply', excludeRoles: ['ADMIN'],
      },
    ],
  },
  {
    label: 'Field Work',
    items: [
      { href: '/erp/mr/doctor-visits',  label: 'Doctor Visits',  icon: Stethoscope,    capability: 'visits.read.own' },
      { href: '/erp/mr/chemist-visits', label: 'Chemist Visits', icon: Store,          capability: 'visits.read.own' },
      { href: '/erp/mr/orders',         label: 'Field Orders',   icon: ClipboardList,  capability: 'orders.read.own' },
      { href: '/erp/mr/followups',      label: 'Follow-ups',     icon: CalendarClock,  capability: 'followups.manage' },
    ],
  },
  {
    label: 'Customers',
    items: [
      { href: '/erp/masters/doctors',      label: 'Doctors',      icon: UserRound, capability: 'masters.read' },
      { href: '/erp/masters/chemists',     label: 'Chemists',     icon: Store,     capability: 'masters.read' },
      { href: '/erp/masters/distributors', label: 'Distributors', icon: Truck,     capability: 'masters.read' },
      { href: '/erp/masters/suppliers',    label: 'Suppliers',    icon: Factory,   capability: 'billing.purchase.read' },
    ],
  },
  {
    label: 'Products',
    items: [
      { href: '/erp/masters/products', label: 'Product Master', icon: Package, capability: 'masters.read' },
      { href: '/erp/masters/batches',  label: 'Batches',        icon: Boxes,   capability: 'inventory.read' },
    ],
  },
  {
    label: 'Accounting',
    items: [
      { href: '/erp/accounting/purchases', label: 'Purchases', icon: Receipt,      capability: 'billing.purchase.read' },
      { href: '/erp/accounting/sales',     label: 'Sales',     icon: ShoppingCart, capability: 'billing.sales.read' },
      { href: '/erp/accounting/inventory', label: 'Inventory', icon: Warehouse,    capability: 'inventory.read' },
    ],
  },
  {
    label: 'Insight',
    items: [
      { href: '/erp/reports', label: 'Reports', icon: BarChart3, capability: 'reports.read.all' },
      { href: '/erp/targets', label: 'Targets', icon: Target,    capability: 'targets.manage' },
    ],
  },
  {
    label: 'HR',
    items: [
      { href: '/erp/attendance/admin', label: 'Attendance',       icon: Fingerprint,        capability: 'attendance.read.all' },
      { href: '/erp/leave/admin',      label: 'Leave Requests',   icon: CalendarDays,       capability: 'leave.manage' },
      { href: '/erp/attendance/rules', label: 'Attendance Rules', icon: SlidersHorizontal,  capability: 'attendance.manage' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { href: '/erp/users',       label: 'Staff',            icon: Users,      capability: 'users.manage' },
      { href: '/erp/audit',       label: 'Audit Log',        icon: ScrollText, capability: 'users.manage' },
      { href: '/erp/settings',    label: 'Settings',         icon: Settings,   capability: 'settings.manage' },
      // Storefront admin (catalogue, banners, announcements, news, launches,
      // about) is a separate app section under /admin — same ADMIN-only
      // staff identity, no capability of its own to gate on, so this reuses
      // settings.manage (ADMIN-exclusive) purely as a role check.
      { href: '/admin/dashboard', label: 'Storefront Admin', icon: Globe,      capability: 'settings.manage' },
    ],
  },
]

export function navGroupsFor(role: ErpRole): ErpNavGroup[] {
  return ALL_GROUPS
    .map(group => ({
      ...group,
      items: group.items.filter(i => can(role, i.capability) && !i.excludeRoles?.includes(role)),
    }))
    .filter(group => group.items.length > 0)
}

/**
 * The MR phone bar. Four thumb-sized destinations, no accounting, no reports —
 * an MR standing in a clinic doorway needs speed, not a full menu (spec §31, §42).
 */
export const MR_BOTTOM_NAV: ErpNavItem[] = [
  { href: '/erp/mr',                label: 'Today',    icon: LayoutDashboard, capability: 'visits.read.own' },
  { href: '/erp/mr/doctor-visits',  label: 'Doctors',  icon: Stethoscope,     capability: 'visits.read.own' },
  { href: '/erp/mr/chemist-visits', label: 'Chemists', icon: Store,           capability: 'visits.read.own' },
  { href: '/erp/mr/followups',      label: 'Follow-up', icon: CalendarClock,  capability: 'followups.manage' },
]
