/**
 * Row and enum types for the Leomed Pharma ERP.
 *
 * These mirror supabase/migrations/20260904000001..6_erp_*.sql. The `erp_`
 * table prefix exists because this database also serves the live D2C
 * storefront, which owns public.products / public.orders / public.profiles.
 */

// ─── Enums (must match the PostgreSQL enum types exactly) ───────────────────

export const ERP_ROLES = ['ADMIN', 'MR', 'ACCOUNTANT', 'MANAGER', 'VIEWER'] as const
export type ErpRole = (typeof ERP_ROLES)[number]

export const CUSTOMER_TYPES = ['DOCTOR', 'CHEMIST'] as const
export type CustomerType = (typeof CUSTOMER_TYPES)[number]

export const DOCTOR_STATUSES = ['NEW', 'EXISTING'] as const
export type DoctorStatus = (typeof DOCTOR_STATUSES)[number]

export const VISIT_PURPOSES = [
  'INTRODUCTION', 'FOLLOW_UP', 'PRODUCT_DETAILING', 'ORDER_COLLECTION',
  'PAYMENT_FOLLOW_UP', 'COMPLAINT', 'OTHER',
] as const
export type VisitPurpose = (typeof VISIT_PURPOSES)[number]

export const DISCUSSION_TYPES = [
  'DETAILED', 'SAMPLE_GIVEN', 'LITERATURE_GIVEN', 'REMINDER', 'NEW_LAUNCH',
] as const
export type DiscussionType = (typeof DISCUSSION_TYPES)[number]

export const FIELD_ORDER_STATUSES = [
  'RECEIVED', 'FORWARDED_TO_DISTRIBUTOR', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED',
] as const
export type FieldOrderStatus = (typeof FIELD_ORDER_STATUSES)[number]

/** Whether an MR has submitted proof of the real invoice against a field
 *  order yet — PENDING until they do, SUBMITTED once they have (the
 *  default an admin should treat as "counts" for incentive purposes),
 *  REJECTED if an admin found the submission wrong (strictly excluded from
 *  incentive-relevant business-generated figures). Distinct from
 *  FieldOrderStatus, which tracks distributor fulfilment, not this. */
export const ORDER_INVOICE_STATUSES = ['PENDING', 'SUBMITTED', 'REJECTED'] as const
export type OrderInvoiceStatus = (typeof ORDER_INVOICE_STATUSES)[number]

export const INVENTORY_TXN_TYPES = [
  'OPENING', 'PURCHASE', 'SALE', 'SALE_RETURN', 'PURCHASE_RETURN',
  'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRY',
] as const
export type InventoryTxnType = (typeof INVENTORY_TXN_TYPES)[number]

/** The subset an admin may post by hand; the rest are produced by billing. */
export const MANUAL_TXN_TYPES = [
  'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRY', 'OPENING',
  'SALE_RETURN', 'PURCHASE_RETURN',
] as const
export type ManualTxnType = (typeof MANUAL_TXN_TYPES)[number]

export const PAYMENT_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const PAYMENT_METHODS = [
  'CASH', 'CHEQUE', 'BANK_TRANSFER', 'UPI', 'CARD', 'CREDIT_NOTE', 'OTHER',
] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const FOLLOWUP_STATUSES = ['PENDING', 'COMPLETED', 'CANCELLED'] as const
export type FollowupStatus = (typeof FOLLOWUP_STATUSES)[number]

export const FOLLOWUP_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const
export type FollowupPriority = (typeof FOLLOWUP_PRIORITIES)[number]

export const TARGET_TYPES = [
  'DOCTOR_VISITS', 'CHEMIST_VISITS', 'NEW_DOCTORS', 'FIELD_ORDERS', 'SALES',
] as const
export type TargetType = (typeof TARGET_TYPES)[number]

// ─── Rows ───────────────────────────────────────────────────────────────────

export interface ErpUser {
  id: string
  auth_user_id: string
  name: string
  email: string
  phone: string | null
  role: ErpRole
  mr_code: string | null
  territory: string | null
  reports_to: string | null
  active: boolean
  department: string | null
  employee_code: string | null
  week_off_days: number[] | null
  created_at: string
  updated_at: string
}

export interface Doctor {
  id: string
  doctor_code: string
  doctor_name: string
  specialization: string | null
  qualification: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  area: string | null
  territory: string | null
  clinic_name: string | null
  notes: string | null
  /** Non-null when this doctor was created inside a visit workflow (spec §18). */
  created_from_visit_id: string | null
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Chemist {
  id: string
  chemist_code: string
  chemist_name: string
  owner_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  area: string | null
  territory: string | null
  gst_number: string | null
  drug_license_number: string | null
  notes: string | null
  created_from_visit_id: string | null
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Distributor {
  id: string
  distributor_code: string
  distributor_name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  state: string | null
  territory: string | null
  gst_number: string | null
  drug_license_number: string | null
  payment_terms: string | null
  credit_limit: number | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface Supplier {
  id: string
  supplier_code: string
  supplier_name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  state: string | null
  gst_number: string | null
  drug_license_number: string | null
  payment_terms: string | null
  active: boolean
  created_at: string
  updated_at: string
}

/** The pharma SKU master — distinct from the storefront's public.products. */
export interface ErpProduct {
  id: string
  product_code: string
  product_name: string
  generic_name: string | null
  brand_name: string | null
  composition: string | null
  uses: string | null
  category: string | null
  dosage_form: string | null
  strength: string | null
  pack_size: string | null
  unit: string
  mrp: number
  purchase_rate: number
  sale_rate: number
  distributor_price: number
  retailer_price: number
  gst_rate: number
  hsn_code: string | null
  min_stock_level: number
  storefront_product_id: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface ProductBatch {
  id: string
  product_id: string
  batch_number: string
  manufacturing_date: string | null
  expiry_date: string
  mrp: number
  purchase_rate: number
  sale_rate: number
  opening_quantity: number
  /** Maintained by the ledger trigger — never written by the app. */
  current_quantity: number
  created_at: string
  updated_at: string
}

export interface DoctorVisit {
  id: string
  doctor_id: string
  mr_id: string
  visit_date: string
  visit_time: string | null
  purpose: VisitPurpose
  discussion: string | null
  remarks: string | null
  doctor_status: DoctorStatus
  follow_up_required: boolean
  follow_up_date: string | null
  created_at: string
  updated_at: string
}

export interface ChemistVisit {
  id: string
  chemist_id: string
  mr_id: string
  visit_date: string
  visit_time: string | null
  purpose: VisitPurpose
  discussion: string | null
  remarks: string | null
  follow_up_required: boolean
  follow_up_date: string | null
  created_at: string
  updated_at: string
}

export interface FieldOrder {
  id: string
  order_number: string
  customer_type: CustomerType
  doctor_id: string | null
  chemist_id: string | null
  mr_id: string
  doctor_visit_id: string | null
  chemist_visit_id: string | null
  order_date: string
  /** The MR's physical order-book reference — a business field, not a key. */
  order_book_number: string | null
  status: FieldOrderStatus
  /** Estimated demand value from product lines — legacy: new orders are
   *  never given product lines, so this is 0 for anything recorded after
   *  the switch to invoice-based reporting. reported_invoice_amount is the
   *  figure that actually matters now. */
  estimated_value: number
  /** What the MR actually generated, self-reported once the real invoice
   *  exists (distributor's or Leomed's own) — a rough figure until an
   *  admin cross-checks it against reported_invoice_photo_url. */
  invoice_status: OrderInvoiceStatus
  reported_invoice_number: string | null
  reported_invoice_amount: number | null
  reported_invoice_photo_url: string | null
  reported_by: string | null
  reported_at: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  rejection_reason: string | null
  remarks: string | null
  created_at: string
  updated_at: string
}

export interface FieldOrderItem {
  id: string
  field_order_id: string
  product_id: string
  quantity: number
  unit: string
  unit_rate: number
  discount_percent: number
  /** quantity × rate less discount. Estimated demand, never revenue. */
  line_value: number
  remarks: string | null
}

export interface PurchaseInvoice {
  id: string
  invoice_number: string
  supplier_id: string
  invoice_date: string
  subtotal: number
  discount: number
  tax: number
  grand_total: number
  /** Trigger-maintained sum of erp_purchase_payments — never written directly. */
  amount_paid: number
  payment_status: PaymentStatus
  is_interstate: boolean
  remarks: string | null
  created_at: string
}

export interface SalesInvoice {
  id: string
  invoice_number: string
  /** Exactly one of these three is set — see erp_sales_invoice_buyer_xor. */
  distributor_id: string | null
  chemist_id: string | null
  doctor_id: string | null
  invoice_date: string
  subtotal: number
  discount: number
  tax: number
  grand_total: number
  /** Trigger-maintained sum of erp_sales_receipts — never written directly. */
  amount_paid: number
  payment_status: PaymentStatus
  is_interstate: boolean
  remarks: string | null
  /** Set only when an administrator knowingly sold an expired batch (Q9). */
  expired_sale_override: boolean
  expired_sale_reason: string | null
  expired_sale_approved_by: string | null
  expired_sale_approved_at: string | null
  created_at: string
}

/** One payment against a purchase invoice. An invoice may have many. */
export interface PurchasePayment {
  id: string
  purchase_invoice_id: string
  payment_date: string
  amount: number
  payment_method: PaymentMethod
  reference_number: string | null
  remarks: string | null
  created_by: string | null
  created_at: string
}

/** One receipt against a sales invoice. An invoice may have many. */
export interface SalesReceipt {
  id: string
  sales_invoice_id: string
  receipt_date: string
  amount: number
  payment_method: PaymentMethod
  reference_number: string | null
  remarks: string | null
  created_by: string | null
  created_at: string
}

export interface InventoryTransaction {
  id: string
  product_id: string
  batch_id: string
  transaction_type: InventoryTxnType
  reference_type: string
  reference_id: string | null
  /** Signed: positive adds stock, negative removes it. */
  quantity: number
  unit_rate: number
  transaction_date: string
  remarks: string | null
  created_at: string
}

export interface Followup {
  id: string
  mr_id: string
  customer_type: CustomerType
  doctor_id: string | null
  chemist_id: string | null
  followup_date: string
  description: string | null
  status: FollowupStatus
  priority: FollowupPriority
  completed_at: string | null
  created_at: string
}

export interface Target {
  id: string
  mr_id: string | null
  territory: string | null
  period_start: string
  period_end: string
  target_type: TargetType
  target_value: number
  created_at: string
}

export interface ErpSettings {
  id: number
  company_name: string
  company_gst_number: string | null
  company_drug_license: string | null
  company_address: string | null
  company_phone: string | null
  company_email: string | null
  selected_bank_account_id: string | null
  expiry_warning_days: number
  mr_edit_window_hours: number
  allow_expired_sale: boolean
  financial_year_start_month: number
  low_stock_multiplier: number
}

/** A bank account on file — admin can keep several; whichever one is
 *  selected on erp_settings is the one printed on sales invoices. */
export interface BankAccount {
  id: string
  bank_name: string
  account_holder_name: string
  account_number: string
  ifsc_code: string
  branch: string | null
  upi_id: string | null
  active: boolean
  created_at: string
  updated_at: string
}

/** The signed-in staff member, as resolved by lib/erp/auth.ts. */
export interface ErpSession {
  id: string
  authUserId: string
  name: string
  email: string
  role: ErpRole
  mrCode: string | null
  territory: string | null
}

// ─── HR: attendance + leave ─────────────────────────────────────────────────

export const ATTENDANCE_STATUSES = [
  'PRESENT', 'PRESENT_WITH_EXCEPTION', 'ABSENT', 'HALF_DAY',
  'LEAVE', 'HOLIDAY', 'WEEK_OFF', 'PENDING_REVIEW',
] as const
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]

export const ATTENDANCE_SOURCES = ['MOBILE_APP', 'WEB', 'ADMIN_MANUAL', 'SYSTEM_AUTO'] as const
export type AttendanceSource = (typeof ATTENDANCE_SOURCES)[number]

export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const
export type LeaveStatus = (typeof LEAVE_STATUSES)[number]

export interface ErpAttendance {
  id: string
  employee_id: string
  date: string
  check_in_time: string | null
  check_out_time: string | null
  check_in_latitude: number | null
  check_in_longitude: number | null
  check_in_accuracy: number | null
  check_out_latitude: number | null
  check_out_longitude: number | null
  check_out_accuracy: number | null
  total_working_minutes: number | null
  doctor_visit_count: number
  chemist_visit_count: number
  required_doctor_visits: number | null
  required_chemist_visits: number | null
  attendance_status: AttendanceStatus
  remarks: string | null
  source: AttendanceSource
  is_manual_override: boolean
  created_at: string
  updated_at: string
}

export interface ErpAttendanceRules {
  id: 1
  work_start_time: string
  grace_period_minutes: number
  min_full_day_minutes: number
  min_half_day_minutes: number
  late_threshold_minutes: number
  early_checkout_threshold_minutes: number
  gps_required: boolean
  min_gps_accuracy_meters: number
  default_mr_doctor_visits: number
  default_mr_chemist_visits: number
  default_week_off_days: number[]
  updated_at: string
}

export interface ErpMrAttendanceTarget {
  mr_id: string
  required_doctor_visits: number
  required_chemist_visits: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ErpHoliday {
  id: string
  holiday_date: string
  name: string
  created_by: string | null
  created_at: string
}

export interface ErpLeaveType {
  id: string
  name: string
  is_paid: boolean
  active: boolean
  sort_order: number
  created_at: string
}

export interface ErpLeaveRequest {
  id: string
  employee_id: string
  leave_type_id: string
  from_date: string
  to_date: string
  reason: string | null
  status: LeaveStatus
  admin_remarks: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

// ─── HR: salary, payroll, expenses ──────────────────────────────────────────

export const PAYROLL_STATUSES = ['DRAFT', 'CALCULATED', 'UNDER_REVIEW', 'FINALIZED', 'PAID'] as const
export type PayrollStatus = (typeof PAYROLL_STATUSES)[number]

export const PAYROLL_ITEM_TYPES = ['INCENTIVE', 'BONUS', 'OTHER_EARNING', 'DEDUCTION'] as const
export type PayrollItemType = (typeof PAYROLL_ITEM_TYPES)[number]

export const EXPENSE_CATEGORIES = [
  'TRAVEL', 'FUEL', 'OFFICE', 'MARKETING', 'PROMOTIONAL', 'DOCTOR_MEETING',
  'SAMPLES', 'EVENTS', 'LOGISTICS', 'MISCELLANEOUS', 'OTHER',
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export const EXPENSE_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID'] as const
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number]

export interface ErpEmployeeSalary {
  employee_id: string
  fixed_salary: number
  basic_salary: number
  gross_salary: number
  allowances: number
  standard_deductions: number
  effective_from: string
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface ErpPayrollPeriod {
  id: string
  period_year: number
  period_month: number
  status: PayrollStatus
  finalized_at: string | null
  finalized_by: string | null
  reopened_at: string | null
  reopened_by: string | null
  reopen_reason: string | null
  created_at: string
  updated_at: string
}

export interface ErpPayrollRecord {
  id: string
  payroll_period_id: string
  employee_id: string
  employee_name: string
  designation: string | null
  department: string | null
  working_days: number
  present_days: number
  half_days: number
  paid_leave_days: number
  unpaid_leave_days: number
  absent_days: number
  holiday_days: number
  week_off_days: number
  payable_days: number
  fixed_salary: number
  basic_salary: number
  gross_salary: number
  allowances: number
  standard_deductions: number
  incentives: number
  bonus: number
  other_earnings: number
  deductions: number
  net_salary: number
  remarks: string | null
  created_at: string
  updated_at: string
}

export interface ErpPayrollItem {
  id: string
  payroll_record_id: string
  item_type: PayrollItemType
  label: string
  amount: number
  created_by: string | null
  created_at: string
}

export interface ErpExpense {
  id: string
  expense_date: string
  category: ExpenseCategory
  employee_id: string
  vendor_name: string | null
  amount: number
  description: string | null
  receipt_url: string | null
  payment_mode: PaymentMethod
  status: ExpenseStatus
  approved_by: string | null
  approved_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ─── Pricing engine: negotiated pricing, schemes ────────────────────────────

export const BILLING_CUSTOMER_TYPES = ['DISTRIBUTOR', 'CHEMIST', 'DOCTOR'] as const
export type BillingCustomerType = (typeof BILLING_CUSTOMER_TYPES)[number]

export const CALCULATION_BASES = ['MRP', 'PTR', 'PTS', 'COST', 'FIXED'] as const
export type CalculationBasis = (typeof CALCULATION_BASES)[number]

export const CALCULATION_METHODS = ['MARGIN', 'DISCOUNT', 'MARKUP', 'FIXED_PRICE'] as const
export type CalculationMethod = (typeof CALCULATION_METHODS)[number]

export const PRICING_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE', 'EXPIRED', 'CANCELLED'] as const
export type PricingStatus = (typeof PRICING_STATUSES)[number]

export const SCHEME_TYPES = ['PERCENTAGE_MARGIN', 'FREE_QUANTITY'] as const
export type SchemeType = (typeof SCHEME_TYPES)[number]

export interface ErpPricingRule {
  id: string
  distributor_id: string | null
  chemist_id: string | null
  doctor_id: string | null
  customer_type: BillingCustomerType
  product_id: string
  calculation_basis: CalculationBasis
  calculation_method: CalculationMethod
  percentage: number | null
  fixed_amount: number | null
  effective_from: string
  effective_to: string | null
  priority: number
  status: PricingStatus
  version: number
  notes: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface ErpScheme {
  id: string
  scheme_name: string
  scheme_type: SchemeType
  product_id: string
  customer_type: BillingCustomerType | null
  calculation_basis: CalculationBasis | null
  calculation_method: CalculationMethod | null
  percentage: number | null
  buy_quantity: number | null
  free_quantity: number | null
  effective_from: string
  effective_to: string | null
  priority: number
  status: PricingStatus
  version: number
  notes: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface ErpSchemeCustomer {
  id: string
  scheme_id: string
  distributor_id: string | null
  chemist_id: string | null
  doctor_id: string | null
  created_at: string
}

/** What erp_explain_price() returns — shape depends on the caller's role:
 *  an admin gets the full explanation, everyone else gets only the rupee
 *  figures they're allowed to bill with (spec §28, §30). */
export interface PriceExplanation {
  selling_rate: number
  mrp: number
  gst_rate: number
  free: { free_quantity: number }
  // Admin-only fields — absent entirely for a non-admin caller.
  source?: 'NEGOTIATED' | 'SCHEME' | 'DEFAULT'
  calculation_basis?: CalculationBasis
  calculation_method?: CalculationMethod
  percentage?: number | null
  pricing_rule_id?: string | null
  pricing_rule_version?: number | null
  scheme_id?: string | null
  scheme_version?: number | null
  scheme_name?: string | null
}
