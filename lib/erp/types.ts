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
  /** Estimated demand value. Never a receivable and never a sales invoice. */
  estimated_value: number
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
  /** Exactly one of these two is set — see erp_sales_invoice_buyer_xor. */
  distributor_id: string | null
  chemist_id: string | null
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
  expiry_warning_days: number
  mr_edit_window_hours: number
  allow_expired_sale: boolean
  financial_year_start_month: number
  low_stock_multiplier: number
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
