import type {
  AttendanceStatus, DiscussionType, DoctorStatus, FieldOrderStatus, FollowupPriority,
  FollowupStatus, InventoryTxnType, LeaveStatus, PaymentMethod, PaymentStatus,
  TargetType, VisitPurpose,
} from './types'

// ─── Formatting (Indian conventions — ₹, lakh/crore grouping, dd Mmm yyyy) ──

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 2,
})
const INR_COMPACT = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1,
})
const NUM = new Intl.NumberFormat('en-IN')

export function money(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? parseFloat(value) : value
  return INR.format(Number.isFinite(n as number) ? (n as number) : 0)
}

/** For dashboard tiles where ₹12.4L reads better than ₹12,40,000.00 */
export function moneyCompact(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? parseFloat(value) : value
  return INR_COMPACT.format(Number.isFinite(n as number) ? (n as number) : 0)
}

export function qty(value: number | null | undefined): string {
  return NUM.format(value ?? 0)
}

/** Formats a date-only column without timezone drift.
 *  `new Date('2026-09-04')` is parsed as UTC midnight, which renders as the
 *  3rd in any timezone behind UTC — so the parts are read directly instead. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return '—'
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return `${formatDate(value)}, ${dt.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit',
  })}`
}

/** Local clock time out of a full timestamp — "09:15 AM" from a
 *  timestamptz, as opposed to formatTime() below which formats a bare
 *  "HH:MM" time-of-day value. */
export function formatClockTime(value: string | null | undefined): string {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
}

/** Minutes → "8h 57m", the working-time format used across attendance. */
export function formatMinutes(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  const h = Math.floor(Math.abs(value) / 60)
  const m = Math.abs(value) % 60
  return `${h}h ${m}m`
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—'
  const [h, m] = value.split(':').map(Number)
  if (Number.isNaN(h)) return '—'
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m ?? 0).padStart(2, '0')} ${suffix}`
}

/** ISO date (yyyy-mm-dd) in local time — safe for <input type="date"> values. */
export function isoDate(date: Date = new Date()): string {
  const tzOffset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 10)
}

export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  if (!y) return null
  const target = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

// ─── Human labels for enum values ───────────────────────────────────────────

export const VISIT_PURPOSE_LABELS: Record<VisitPurpose, string> = {
  INTRODUCTION:      'Introduction',
  FOLLOW_UP:         'Follow-up',
  PRODUCT_DETAILING: 'Product detailing',
  ORDER_COLLECTION:  'Order collection',
  PAYMENT_FOLLOW_UP: 'Payment follow-up',
  COMPLAINT:         'Complaint',
  OTHER:             'Other',
}

export const DISCUSSION_TYPE_LABELS: Record<DiscussionType, string> = {
  DETAILED:          'Detailed',
  SAMPLE_GIVEN:      'Sample given',
  LITERATURE_GIVEN:  'Literature given',
  REMINDER:          'Reminder',
  NEW_LAUNCH:        'New launch',
}

export const FIELD_ORDER_STATUS_LABELS: Record<FieldOrderStatus, string> = {
  RECEIVED:                'Received',
  FORWARDED_TO_DISTRIBUTOR: 'Forwarded to distributor',
  PARTIALLY_FULFILLED:     'Partially fulfilled',
  FULFILLED:               'Fulfilled',
  CANCELLED:               'Cancelled',
}

export const INVENTORY_TXN_LABELS: Record<InventoryTxnType, string> = {
  OPENING:         'Opening stock',
  PURCHASE:        'Purchase',
  SALE:            'Sale',
  SALE_RETURN:     'Sales return',
  PURCHASE_RETURN: 'Purchase return',
  ADJUSTMENT_IN:   'Adjustment (in)',
  ADJUSTMENT_OUT:  'Adjustment (out)',
  DAMAGE:          'Damage',
  EXPIRY:          'Expiry write-off',
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  UNPAID: 'Unpaid', PARTIALLY_PAID: 'Partly paid', PAID: 'Paid',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH:          'Cash',
  CHEQUE:        'Cheque',
  BANK_TRANSFER: 'Bank transfer',
  UPI:           'UPI',
  CARD:          'Card',
  CREDIT_NOTE:   'Credit note',
  OTHER:         'Other',
}

export const FOLLOWUP_STATUS_LABELS: Record<FollowupStatus, string> = {
  PENDING: 'Pending', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
}

export const FOLLOWUP_PRIORITY_LABELS: Record<FollowupPriority, string> = {
  LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High',
}

export const TARGET_TYPE_LABELS: Record<TargetType, string> = {
  DOCTOR_VISITS:  'Doctor visits',
  CHEMIST_VISITS: 'Chemist visits',
  NEW_DOCTORS:    'New doctors',
  FIELD_ORDERS:   'Field orders',
  SALES:          'Sales value',
}

export const DOCTOR_STATUS_LABELS: Record<DoctorStatus, string> = {
  NEW: 'New doctor', EXISTING: 'Existing doctor',
}

// ─── Badge styling ──────────────────────────────────────────────────────────

export const FIELD_ORDER_STATUS_STYLES: Record<FieldOrderStatus, string> = {
  RECEIVED:                 'bg-blue-50 text-blue-700 ring-blue-600/20',
  FORWARDED_TO_DISTRIBUTOR: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  PARTIALLY_FULFILLED:      'bg-amber-50 text-amber-700 ring-amber-600/20',
  FULFILLED:                'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  CANCELLED:                'bg-gray-100 text-gray-600 ring-gray-500/20',
}

export const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
  UNPAID:  'bg-red-50 text-red-700 ring-red-600/20',
  PARTIALLY_PAID: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  PAID:    'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
}

export const FOLLOWUP_PRIORITY_STYLES: Record<FollowupPriority, string> = {
  LOW:    'bg-gray-100 text-gray-600 ring-gray-500/20',
  MEDIUM: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  HIGH:   'bg-red-50 text-red-700 ring-red-600/20',
}

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT:                'Present',
  PRESENT_WITH_EXCEPTION: 'Present (exception)',
  ABSENT:                 'Absent',
  HALF_DAY:               'Half day',
  LEAVE:                  'Leave',
  HOLIDAY:                'Holiday',
  WEEK_OFF:               'Week off',
  PENDING_REVIEW:         'Pending review',
}

export const ATTENDANCE_STATUS_STYLES: Record<AttendanceStatus, string> = {
  PRESENT:                'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  PRESENT_WITH_EXCEPTION: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  ABSENT:                 'bg-red-50 text-red-700 ring-red-600/20',
  HALF_DAY:               'bg-amber-50 text-amber-700 ring-amber-600/20',
  LEAVE:                  'bg-blue-50 text-blue-700 ring-blue-600/20',
  HOLIDAY:                'bg-violet-50 text-violet-700 ring-violet-600/20',
  WEEK_OFF:               'bg-gray-100 text-gray-600 ring-gray-500/20',
  PENDING_REVIEW:         'bg-amber-50 text-amber-700 ring-amber-600/20',
}

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  PENDING:   'Pending',
  APPROVED:  'Approved',
  REJECTED:  'Rejected',
  CANCELLED: 'Cancelled',
}

export const LEAVE_STATUS_STYLES: Record<LeaveStatus, string> = {
  PENDING:   'bg-amber-50 text-amber-700 ring-amber-600/20',
  APPROVED:  'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  REJECTED:  'bg-red-50 text-red-700 ring-red-600/20',
  CANCELLED: 'bg-gray-100 text-gray-600 ring-gray-500/20',
}
