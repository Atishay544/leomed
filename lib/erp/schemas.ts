import { z } from 'zod'
import {
  ATTENDANCE_STATUSES, BILLING_CUSTOMER_TYPES, CALCULATION_BASES, CALCULATION_METHODS,
  DISCUSSION_TYPES, ERP_ROLES, EXPENSE_CATEGORIES, FIELD_ORDER_STATUSES, FOLLOWUP_PRIORITIES,
  FOLLOWUP_STATUSES, LEAVE_STATUSES, MANUAL_TXN_TYPES, PAYMENT_METHODS, PAYROLL_ITEM_TYPES,
  SCHEME_TYPES, TARGET_TYPES, VISIT_PURPOSES,
} from './types'

/**
 * Server-side validation for every ERP mutation.
 *
 * These schemas run inside server actions, i.e. after the network boundary —
 * frontend validation is a convenience, this is the gate (spec §35, §51).
 * Database CHECK constraints then re-assert the same invariants, so a bug here
 * still cannot corrupt data.
 */

// ─── Primitives ─────────────────────────────────────────────────────────────

const uuid = z.uuid()
const optionalUuid = z.union([uuid, z.literal('')]).transform(v => (v === '' ? undefined : v)).optional()

/** Trims, then treats an empty string as "not provided". Form inputs post ""
 *  for untouched optional fields; storing those as empty strings instead of
 *  NULL would break `is null` filters and COALESCE fallbacks everywhere. */
const optionalText = (max = 255) =>
  z.string().trim().max(max).optional().transform(v => (v ? v : undefined))

const requiredText = (label: string, max = 255) =>
  z.string().trim().min(1, `${label} is required`).max(max)

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date')
const optionalDate = z.union([dateString, z.literal('')]).transform(v => (v === '' ? undefined : v)).optional()

const money = z.coerce.number().min(0, 'Cannot be negative').max(99_999_999)
const positiveInt = z.coerce.number().int('Enter a whole number').positive('Must be more than zero')
const nonNegativeInt = z.coerce.number().int().min(0)
const percent = z.coerce.number().min(0).max(100)
const gstRate = z.coerce.number().min(0).max(28, 'GST cannot exceed 28%')

const phone = z.string().trim()
  .regex(/^[0-9+\-\s()]{6,20}$/, 'Enter a valid phone number')
  .optional()
  .or(z.literal('').transform(() => undefined))

const email = z.union([z.email('Enter a valid email address'), z.literal('')])
  .transform(v => (v === '' ? undefined : v))
  .optional()

// ─── Authentication ─────────────────────────────────────────────────────────

export const ErpLoginSchema = z.object({
  email:    z.email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
})

// ─── Staff ──────────────────────────────────────────────────────────────────

export const ErpUserSchema = z.object({
  name:          requiredText('Name', 100),
  email:         z.email('Enter a valid email address'),
  phone,
  role:          z.enum(ERP_ROLES),
  mr_code:       optionalText(20),
  territory:     optionalText(100),
  department:    optionalText(100),
  employee_code: optionalText(30),
  // Defaults to false, not true: an unchecked checkbox is simply absent from
  // FormData, so defaulting to true would make "deactivate this account"
  // silently do nothing. The edit form always renders the checkbox.
  active:    z.coerce.boolean().default(false),
}).refine(v => v.role !== 'MR' || !!v.mr_code, {
  message: 'An MR code is required for medical representatives',
  path: ['mr_code'],
})

export const ErpUserCreateSchema = z.object({
  name:          requiredText('Name', 100),
  email:         z.email('Enter a valid email address'),
  phone,
  role:          z.enum(ERP_ROLES),
  mr_code:       optionalText(20),
  territory:     optionalText(100),
  department:    optionalText(100),
  employee_code: optionalText(30),
  password:  z.string().min(8, 'Password must be at least 8 characters').max(128),
}).refine(v => v.role !== 'MR' || !!v.mr_code, {
  message: 'An MR code is required for medical representatives',
  path: ['mr_code'],
})

// ─── Customer masters ───────────────────────────────────────────────────────

export const DoctorSchema = z.object({
  doctor_name:    requiredText('Doctor name', 150),
  specialization: optionalText(100),
  qualification:  optionalText(100),
  phone,
  email,
  address:        optionalText(500),
  city:           optionalText(100),
  area:           optionalText(100),
  territory:      optionalText(100),
  clinic_name:    optionalText(150),
  notes:          optionalText(1000),
})

export const ChemistSchema = z.object({
  chemist_name:        requiredText('Chemist name', 150),
  owner_name:          optionalText(150),
  phone,
  email,
  address:             optionalText(500),
  city:                optionalText(100),
  area:                optionalText(100),
  territory:           optionalText(100),
  gst_number:          optionalText(20),
  drug_license_number: optionalText(50),
  notes:               optionalText(1000),
})

export const DistributorSchema = z.object({
  distributor_name:    requiredText('Distributor name', 150),
  contact_person:      optionalText(100),
  phone,
  email,
  address:             optionalText(500),
  city:                optionalText(100),
  state:               optionalText(100),
  territory:           optionalText(100),
  gst_number:          optionalText(20),
  drug_license_number: optionalText(50),
  payment_terms:       optionalText(100),
  credit_limit:        z.union([money, z.literal('')]).transform(v => (v === '' ? undefined : v)).optional(),
})

export const SupplierSchema = z.object({
  supplier_name:       requiredText('Supplier name', 150),
  contact_person:      optionalText(100),
  phone,
  email,
  address:             optionalText(500),
  city:                optionalText(100),
  state:               optionalText(100),
  gst_number:          optionalText(20),
  drug_license_number: optionalText(50),
  payment_terms:       optionalText(100),
})

// ─── Product master ─────────────────────────────────────────────────────────

export const ErpProductSchema = z.object({
  product_name:    requiredText('Product name', 200),
  generic_name:    optionalText(200),
  brand_name:      optionalText(200),
  composition:     optionalText(500),
  uses:            optionalText(500),
  category:        optionalText(100),
  dosage_form:     optionalText(50),
  strength:        optionalText(50),
  pack_size:       optionalText(50),
  unit:            z.string().trim().min(1).max(20).default('BOX'),
  mrp:             money,
  purchase_rate:   money,
  // Trade prices, set as a discount off MRP in the form (the percentage
  // itself is a UI convenience, not stored — these two numbers are the
  // source of truth).
  distributor_price: money,
  retailer_price:    money,
  gst_rate:        gstRate,
  hsn_code:        optionalText(20),
  min_stock_level: nonNegativeInt,
  // Optional cross-reference to the public storefront catalogue listing
  // (public.products) — purely a link, not a data pull in either direction.
  storefront_product_id: optionalUuid,
}).transform(data => ({
  ...data,
  // sale_rate is what purchase/sales invoice lookups suggest as the default
  // rate (lib/erp/actions/lookup.ts) — kept in lockstep with distributor
  // price so that existing invoicing code needs no changes at all.
  sale_rate: data.distributor_price,
}))

export const ProductBatchSchema = z.object({
  product_id:         uuid,
  batch_number:       requiredText('Batch number', 50),
  manufacturing_date: optionalDate,
  expiry_date:        dateString,
  mrp:                money,
  purchase_rate:      money,
  sale_rate:          money,
}).refine(v => !v.manufacturing_date || v.expiry_date > v.manufacturing_date, {
  message: 'Expiry date must be after the manufacturing date',
  path: ['expiry_date'],
})

// ─── Visits ─────────────────────────────────────────────────────────────────

/**
 * An order captured during a visit — just enough to track that one was
 * placed and find it again later. Business value no longer comes from
 * product/rate lines typed in the field (too easy to invent, disconnected
 * from what actually gets billed); it comes from the invoice number,
 * amount and photo the MR submits later against this order book number,
 * once the real invoice exists — see erp_submit_order_invoice().
 */
const FieldOrderInput = z.object({
  received:          z.coerce.boolean().default(false),
  order_book_number: optionalText(50),
  remarks:           optionalText(500),
}).refine(v => !v.received || !!v.order_book_number, {
  message: 'Enter the order book number',
  path: ['order_book_number'],
})

const VisitBase = {
  visit_date:  dateString,
  visit_time:  z.union([z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/), z.literal('')])
                .transform(v => (v === '' ? undefined : v)).optional(),
  purpose:     z.enum(VISIT_PURPOSES),
  discussion:  optionalText(2000),
  remarks:     optionalText(1000),
  follow_up_required:    z.coerce.boolean().default(false),
  follow_up_date:        optionalDate,
  follow_up_description: optionalText(500),
  follow_up_priority:    z.enum(FOLLOWUP_PRIORITIES).default('MEDIUM'),
  // Mandatory: every visit must carry proof of where the MR actually was.
  latitude:    z.coerce.number().min(-90).max(90),
  longitude:   z.coerce.number().min(-180).max(180),
  /** A public Supabase Storage URL of a photo taken by the MR during the
   *  visit — proof-of-visit, not a document requiring validation beyond URL shape. */
  photo_url:   z.union([z.string().url(), z.literal('')]).optional(),
  /** Idempotency key — a retried save must not create a second visit (D11). */
  client_request_id: uuid,
  order: FieldOrderInput.optional(),
}

export const DoctorVisitSchema = z.object({
  ...VisitBase,
  doctor_id:  optionalUuid,
  new_doctor: DoctorSchema.optional(),
  products: z.array(z.object({
    product_id:      uuid,
    discussion_type: z.enum(DISCUSSION_TYPES).default('DETAILED'),
    sample_quantity: nonNegativeInt.default(0),
    remarks:         optionalText(200),
  })).default([]),
})
  .refine(v => !!v.doctor_id || !!v.new_doctor, {
    message: 'Choose an existing doctor or enter the details of a new one',
    path: ['doctor_id'],
  })
  // Both would make "new vs existing" ambiguous, which is the one thing this
  // workflow exists to record accurately (spec §18).
  .refine(v => !(v.doctor_id && v.new_doctor), {
    message: 'Choose an existing doctor or create a new one, not both',
    path: ['doctor_id'],
  })
  .refine(v => !v.follow_up_required || !!v.follow_up_date, {
    message: 'Set a date for the follow-up',
    path: ['follow_up_date'],
  })

export const ChemistVisitSchema = z.object({
  ...VisitBase,
  chemist_id:  optionalUuid,
  new_chemist: ChemistSchema.optional(),
})
  .refine(v => !!v.chemist_id || !!v.new_chemist, {
    message: 'Choose an existing chemist or enter the details of a new one',
    path: ['chemist_id'],
  })
  .refine(v => !(v.chemist_id && v.new_chemist), {
    message: 'Choose an existing chemist or create a new one, not both',
    path: ['chemist_id'],
  })
  .refine(v => !v.follow_up_required || !!v.follow_up_date, {
    message: 'Set a date for the follow-up',
    path: ['follow_up_date'],
  })

// ─── Billing ────────────────────────────────────────────────────────────────
// Note what is absent: subtotal, tax and grand_total. Totals are computed in
// PostgreSQL from these lines; a client-submitted total is never accepted.

export const PurchaseItemSchema = z.object({
  product_id:         uuid,
  batch_number:       requiredText('Batch number', 50),
  manufacturing_date: optionalDate,
  expiry_date:        dateString,
  mrp:                money.optional(),
  sale_rate:          money.optional(),
  quantity:           positiveInt,
  free_quantity:      nonNegativeInt.default(0),
  purchase_rate:      money,
  discount_percent:   percent.default(0),
  gst_rate:           gstRate.default(0),
})

export const PurchaseInvoiceSchema = z.object({
  supplier_id:    uuid,
  invoice_number: requiredText('Invoice number', 50),
  invoice_date:   dateString,
  is_interstate:  z.coerce.boolean().default(false),
  // Anything settled at billing time. Recorded as the first row in the
  // payment history, not written onto the invoice (Q6).
  initial_payment:   money.default(0),
  payment_method:    z.enum(PAYMENT_METHODS).default('BANK_TRANSFER'),
  payment_reference: optionalText(50),
  remarks:        optionalText(500),
  items:          z.array(PurchaseItemSchema).min(1, 'Add at least one product line'),
})

export const SalesItemSchema = z.object({
  product_id:       uuid,
  batch_id:         uuid,
  quantity:         positiveInt,
  free_quantity:    nonNegativeInt.default(0),
  sale_rate:        money,
  discount_percent: percent.default(0),
  gst_rate:         gstRate.default(0),
})

export const SalesInvoiceSchema = z.object({
  // Exactly one buyer — a sale is to a distributor, direct to a chemist, or
  // direct to a doctor, never more than one, never none. The database
  // re-checks this too (erp_sales_invoice_buyer_xor).
  distributor_id: optionalUuid,
  chemist_id:     optionalUuid,
  doctor_id:      optionalUuid,
  invoice_date:   dateString,
  is_interstate:  z.coerce.boolean().default(false),
  initial_payment:   money.default(0),
  payment_method:    z.enum(PAYMENT_METHODS).default('BANK_TRANSFER'),
  payment_reference: optionalText(50),
  remarks:        optionalText(500),
  // Q9: only supplied when an administrator is knowingly selling an expired
  // batch. The database re-checks the role and refuses without a reason.
  expired_sale_reason: optionalText(500),
  items:          z.array(SalesItemSchema).min(1, 'Add at least one product line'),
}).refine(data => [data.distributor_id, data.chemist_id, data.doctor_id].filter(Boolean).length === 1, {
  message: 'Choose exactly one of a distributor, a chemist or a doctor to bill.',
  path: ['distributor_id'],
})

// ─── Payments and receipts (Q6) ─────────────────────────────────────────────
// One invoice, many payments. The balance and the status are derived from
// these rows; there is no writable "amount paid" anywhere.

const PaymentBase = {
  amount:           z.coerce.number().positive('Enter an amount above zero').max(99_999_999),
  payment_method:   z.enum(PAYMENT_METHODS),
  reference_number: optionalText(50),
  remarks:          optionalText(500),
}

export const PurchasePaymentSchema = z.object({
  purchase_invoice_id: uuid,
  payment_date:        dateString,
  ...PaymentBase,
})

export const SalesReceiptSchema = z.object({
  sales_invoice_id: uuid,
  receipt_date:     dateString,
  ...PaymentBase,
})

export const DeletePaymentSchema = z.object({
  payment_id: uuid,
})

// ─── Inventory ──────────────────────────────────────────────────────────────

export const InventoryAdjustmentSchema = z.object({
  batch_id:         uuid,
  transaction_type: z.enum(MANUAL_TXN_TYPES),
  quantity:         positiveInt,
  // Not optional anywhere: an unexplained stock movement is unauditable (§16).
  remarks:          requiredText('Reason', 500),
  transaction_date: dateString,
})

// ─── Field force administration ─────────────────────────────────────────────

export const FieldOrderStatusSchema = z.object({
  order_id: uuid,
  status:   z.enum(FIELD_ORDER_STATUSES),
  remarks:  optionalText(500),
})

/** MR self-reports the real invoice against their own order book entry —
 *  the number, the amount, and a photo as evidence. Rough by design (spec:
 *  "before that leomed/admin want a general idea") — checked properly only
 *  when an admin reviews it. */
export const OrderInvoiceSubmitSchema = z.object({
  order_id:       uuid,
  invoice_number: requiredText('Invoice number', 50),
  invoice_amount: z.coerce.number().positive('Enter the invoice amount').max(99_999_999),
  photo_url:      z.union([z.string().url(), z.literal('')]).optional(),
})

/** Admin review of one MR's submission — SUBMITTED stays the default an
 *  incentive calculation counts; REJECTED is strictly excluded. A reason is
 *  required only when rejecting. */
export const OrderInvoiceReviewSchema = z.object({
  order_id: uuid,
  status:   z.enum(['SUBMITTED', 'REJECTED']),
  reason:   optionalText(500),
}).refine(v => v.status !== 'REJECTED' || !!v.reason, {
  message: 'Enter a reason for rejecting this submission',
  path: ['reason'],
})

export const FollowupUpdateSchema = z.object({
  followup_id: uuid,
  status:      z.enum(FOLLOWUP_STATUSES),
})

/** One incentive bracket. mr_id blank = a company-wide default bracket;
 *  set = overrides the default for that one MR only. max_amount blank =
 *  no upper bound. The database refuses two overlapping brackets in the
 *  same scope (its own exclusion constraint), so a bad range surfaces as a
 *  save error here rather than silently corrupting the ladder. */
export const IncentiveTierSchema = z.object({
  mr_id:      optionalUuid,
  min_amount: money,
  max_amount: z.union([money, z.literal('')]).transform(v => (v === '' ? undefined : v)).optional(),
  percentage: z.coerce.number().min(0).max(100),
})

/** A flat incentive rate for one MR, bypassing tiers entirely while set. */
export const MrFlatIncentiveSchema = z.object({
  mr_id:           uuid,
  flat_percentage: z.coerce.number().min(0).max(100),
})

export const TargetSchema = z.object({
  mr_id:        optionalUuid,
  territory:    optionalText(100),
  target_type:  z.enum(TARGET_TYPES),
  target_value: z.coerce.number().positive('Enter a target above zero'),
  period_start: dateString,
  period_end:   dateString,
})
  .refine(v => v.period_end >= v.period_start, {
    message: 'The period must end on or after it starts',
    path: ['period_end'],
  })
  .refine(v => !!v.mr_id || !!v.territory, {
    message: 'Assign the target to an MR or to a territory',
    path: ['mr_id'],
  })

export const SettingsSchema = z.object({
  company_name:               requiredText('Company name', 150),
  company_gst_number:         optionalText(20),
  company_drug_license:       optionalText(50),
  company_address:            optionalText(500),
  expiry_warning_days:        z.coerce.number().int().min(1).max(730),
  mr_edit_window_hours:       z.coerce.number().int().min(0).max(720),
  allow_expired_sale:         z.coerce.boolean().default(false),
  financial_year_start_month: z.coerce.number().int().min(1).max(12),
})

// ─── HR: attendance ─────────────────────────────────────────────────────────
// GPS is deliberately optional here, unlike the mandatory GPS on visit forms —
// this spec is explicit that a missing/poor fix must become a reviewable
// exception, never a block on checking in or out.

const gpsCoord = z.union([z.coerce.number(), z.literal('')]).transform(v => (v === '' ? undefined : v)).optional()

export const AttendanceCheckSchema = z.object({
  latitude:  gpsCoord,
  longitude: gpsCoord,
  accuracy:  gpsCoord,
})

export const AttendanceCorrectionSchema = z.object({
  attendance_id:   uuid,
  status:          z.enum(ATTENDANCE_STATUSES).optional(),
  check_in_time:   optionalText(40),  // datetime-local string, converted at the call site
  check_out_time:  optionalText(40),
  reason:          requiredText('Reason', 500),
})

export const AttendanceRulesSchema = z.object({
  work_start_time:                  z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Enter a valid time'),
  grace_period_minutes:             z.coerce.number().int().min(0).max(180),
  min_full_day_minutes:             z.coerce.number().int().min(1).max(1440),
  min_half_day_minutes:             z.coerce.number().int().min(1).max(1440),
  late_threshold_minutes:           z.coerce.number().int().min(0).max(180),
  early_checkout_threshold_minutes: z.coerce.number().int().min(0).max(180),
  gps_required:                     z.coerce.boolean().default(false),
  min_gps_accuracy_meters:          z.coerce.number().positive().max(10_000),
  default_mr_doctor_visits:         nonNegativeInt,
  default_mr_chemist_visits:        nonNegativeInt,
}).refine(v => v.min_half_day_minutes < v.min_full_day_minutes, {
  message: 'The half-day minimum must be less than the full-day minimum',
  path: ['min_half_day_minutes'],
})

export const MrAttendanceTargetSchema = z.object({
  mr_id:                    uuid,
  required_doctor_visits:   nonNegativeInt,
  required_chemist_visits:  nonNegativeInt,
})

export const HolidaySchema = z.object({
  holiday_date: dateString,
  name:         requiredText('Holiday name', 150),
})

// ─── HR: leave ──────────────────────────────────────────────────────────────

export const LeaveTypeSchema = z.object({
  name:       requiredText('Leave type name', 60),
  // false, not true: an unchecked checkbox is simply absent from FormData, so
  // defaulting to true would make unchecking either box silently do nothing
  // (same footgun ErpUserSchema.active avoids for the same reason).
  is_paid:    z.coerce.boolean().default(false),
  active:     z.coerce.boolean().default(false),
  sort_order: z.coerce.number().int().default(0),
})

export const LeaveApplicationSchema = z.object({
  leave_type_id: uuid,
  from_date:     dateString,
  to_date:       dateString,
  reason:        optionalText(500),
}).refine(v => v.to_date >= v.from_date, {
  message: 'The end date must be on or after the start date',
  path: ['to_date'],
})

export const LeaveReviewSchema = z.object({
  leave_id:      uuid,
  status:        z.enum(['APPROVED', 'REJECTED', 'CANCELLED']),
  admin_remarks: optionalText(500),
})

export const AdminCreateLeaveSchema = z.object({
  employee_id:   uuid,
  leave_type_id: uuid,
  from_date:     dateString,
  to_date:       dateString,
  reason:        optionalText(500),
  status:        z.enum(LEAVE_STATUSES).default('APPROVED'),
}).refine(v => v.to_date >= v.from_date, {
  message: 'The end date must be on or after the start date',
  path: ['to_date'],
})

// ─── HR: salary, payroll, expenses ──────────────────────────────────────────

export const EmployeeSalarySchema = z.object({
  employee_id:         uuid,
  fixed_salary:        money,
  basic_salary:        money,
  gross_salary:        money,
  allowances:          money,
  standard_deductions: money,
  effective_from:      dateString,
})

export const PayrollGenerateSchema = z.object({
  period_year:  z.coerce.number().int().min(2000).max(2200),
  period_month: z.coerce.number().int().min(1).max(12),
})

export const PayrollItemSchema = z.object({
  record_id: uuid,
  item_type: z.enum(PAYROLL_ITEM_TYPES),
  label:     requiredText('Label', 100),
  amount:    z.coerce.number().positive('Enter an amount above zero').max(99_999_999),
})

export const PayrollReopenSchema = z.object({
  period_id: uuid,
  reason:    requiredText('Reason', 500),
})

export const ExpenseSchema = z.object({
  expense_date: dateString,
  category:     z.enum(EXPENSE_CATEGORIES),
  vendor_name:  optionalText(150),
  amount:       z.coerce.number().positive('Enter an amount above zero').max(99_999_999),
  description:  optionalText(1000),
  receipt_url:  z.union([z.string().url(), z.literal('')]).optional(),
  payment_mode: z.enum(PAYMENT_METHODS),
})

export const ExpenseReviewSchema = z.object({
  expense_id: uuid,
  status:     z.enum(['APPROVED', 'REJECTED', 'PAID']),
  notes:      optionalText(500),
})

// ─── Pricing engine: negotiated pricing, schemes ────────────────────────────
// Admin-only (pricing.manage) — see lib/erp/permissions.ts.

const oneOfThreeCustomers = (v: { distributor_id?: string; chemist_id?: string; doctor_id?: string }) =>
  [v.distributor_id, v.chemist_id, v.doctor_id].filter(Boolean).length

export const PricingRuleSchema = z.object({
  // At most one set = a negotiated rule for that one customer; none set = a
  // product default for the whole customer_type.
  distributor_id: optionalUuid,
  chemist_id:     optionalUuid,
  doctor_id:      optionalUuid,
  customer_type:      z.enum(BILLING_CUSTOMER_TYPES),
  product_id:         uuid,
  calculation_basis:  z.enum(CALCULATION_BASES),
  calculation_method: z.enum(CALCULATION_METHODS),
  percentage:    z.union([z.coerce.number().min(0).max(100), z.literal('')]).transform(v => v === '' ? undefined : v).optional(),
  fixed_amount:  z.union([money, z.literal('')]).transform(v => v === '' ? undefined : v).optional(),
  effective_from: dateString,
  effective_to:   optionalDate,
  notes:          optionalText(500),
}).refine(v => oneOfThreeCustomers(v) <= 1, {
  message: 'A pricing rule can target at most one specific customer',
  path: ['distributor_id'],
}).refine(v => v.calculation_method === 'FIXED_PRICE' ? v.fixed_amount != null : v.percentage != null, {
  message: 'Enter a percentage, or switch to Fixed Price and enter a fixed amount',
  path: ['percentage'],
}).refine(v => !v.effective_to || v.effective_to >= v.effective_from, {
  message: 'The end date must be on or after the start date',
  path: ['effective_to'],
})

const SchemeCustomerRef = z.object({
  distributor_id: optionalUuid,
  chemist_id:     optionalUuid,
  doctor_id:      optionalUuid,
}).refine(v => oneOfThreeCustomers(v) === 1, { message: 'Each target must be exactly one customer' })

export const SchemeSchema = z.object({
  scheme_name:   requiredText('Scheme name', 150),
  scheme_type:   z.enum(SCHEME_TYPES),
  product_id:    uuid,
  // Empty = applies across every customer type for this product.
  customer_type: z.union([z.enum(BILLING_CUSTOMER_TYPES), z.literal('')]).transform(v => v === '' ? undefined : v).optional(),

  calculation_basis:  z.union([z.enum(CALCULATION_BASES), z.literal('')]).transform(v => v === '' ? undefined : v).optional(),
  calculation_method: z.union([z.enum(CALCULATION_METHODS), z.literal('')]).transform(v => v === '' ? undefined : v).optional(),
  percentage:    z.union([z.coerce.number().min(0).max(100), z.literal('')]).transform(v => v === '' ? undefined : v).optional(),

  buy_quantity:  z.union([positiveInt, z.literal('')]).transform(v => v === '' ? undefined : v).optional(),
  free_quantity: z.union([positiveInt, z.literal('')]).transform(v => v === '' ? undefined : v).optional(),

  effective_from: dateString,
  effective_to:   optionalDate,
  priority:       z.coerce.number().int().min(0).max(9999).default(100),
  status:         z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'EXPIRED', 'CANCELLED']).default('DRAFT'),
  notes:          optionalText(500),
  // Empty = a company-wide scheme for the chosen customer_type; non-empty =
  // targeted to exactly these customers only.
  customers:      z.array(SchemeCustomerRef).default([]),
}).refine(v => !v.effective_to || v.effective_to >= v.effective_from, {
  message: 'The end date must be on or after the start date',
  path: ['effective_to'],
}).refine(v => v.scheme_type !== 'PERCENTAGE_MARGIN' || (v.calculation_basis && v.calculation_method && v.percentage != null), {
  message: 'A percentage-margin scheme needs a basis, method and percentage',
  path: ['percentage'],
}).refine(v => v.scheme_type !== 'FREE_QUANTITY' || (v.buy_quantity != null && v.free_quantity != null), {
  message: 'A free-quantity scheme needs both a buy quantity and a free quantity',
  path: ['buy_quantity'],
})

export const SchemeStatusSchema = z.object({
  scheme_id: uuid,
  status:    z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'EXPIRED', 'CANCELLED']),
})

// ─── Inferred input types ───────────────────────────────────────────────────

export type ErpLoginInput           = z.infer<typeof ErpLoginSchema>
export type ErpUserInput            = z.infer<typeof ErpUserSchema>
export type ErpUserCreateInput      = z.infer<typeof ErpUserCreateSchema>
export type DoctorInput             = z.infer<typeof DoctorSchema>
export type ChemistInput            = z.infer<typeof ChemistSchema>
export type DistributorInput        = z.infer<typeof DistributorSchema>
export type SupplierInput           = z.infer<typeof SupplierSchema>
export type ErpProductInput         = z.infer<typeof ErpProductSchema>
export type ProductBatchInput       = z.infer<typeof ProductBatchSchema>
export type DoctorVisitInput        = z.infer<typeof DoctorVisitSchema>
export type ChemistVisitInput       = z.infer<typeof ChemistVisitSchema>
export type PurchaseInvoiceInput    = z.infer<typeof PurchaseInvoiceSchema>
export type SalesInvoiceInput       = z.infer<typeof SalesInvoiceSchema>
export type InventoryAdjustmentInput = z.infer<typeof InventoryAdjustmentSchema>
export type TargetInput             = z.infer<typeof TargetSchema>
export type SettingsInput           = z.infer<typeof SettingsSchema>
export type PurchasePaymentInput    = z.infer<typeof PurchasePaymentSchema>
export type SalesReceiptInput       = z.infer<typeof SalesReceiptSchema>
export type AttendanceCheckInput      = z.infer<typeof AttendanceCheckSchema>
export type AttendanceCorrectionInput = z.infer<typeof AttendanceCorrectionSchema>
export type AttendanceRulesInput      = z.infer<typeof AttendanceRulesSchema>
export type MrAttendanceTargetInput   = z.infer<typeof MrAttendanceTargetSchema>
export type HolidayInput              = z.infer<typeof HolidaySchema>
export type LeaveTypeInput            = z.infer<typeof LeaveTypeSchema>
export type LeaveApplicationInput     = z.infer<typeof LeaveApplicationSchema>
export type LeaveReviewInput          = z.infer<typeof LeaveReviewSchema>
export type AdminCreateLeaveInput     = z.infer<typeof AdminCreateLeaveSchema>
export type EmployeeSalaryInput       = z.infer<typeof EmployeeSalarySchema>
export type PayrollGenerateInput      = z.infer<typeof PayrollGenerateSchema>
export type PayrollItemInput          = z.infer<typeof PayrollItemSchema>
export type PayrollReopenInput        = z.infer<typeof PayrollReopenSchema>
export type ExpenseInput              = z.infer<typeof ExpenseSchema>
export type ExpenseReviewInput        = z.infer<typeof ExpenseReviewSchema>
export type PricingRuleInput          = z.infer<typeof PricingRuleSchema>
export type SchemeInput               = z.infer<typeof SchemeSchema>
export type SchemeStatusInput         = z.infer<typeof SchemeStatusSchema>
