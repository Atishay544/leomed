import { z } from 'zod'
import {
  DISCUSSION_TYPES, ERP_ROLES, FIELD_ORDER_STATUSES, FOLLOWUP_PRIORITIES,
  FOLLOWUP_STATUSES, MANUAL_TXN_TYPES, PAYMENT_METHODS, TARGET_TYPES,
  VISIT_PURPOSES,
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
  name:      requiredText('Name', 100),
  email:     z.email('Enter a valid email address'),
  phone,
  role:      z.enum(ERP_ROLES),
  mr_code:   optionalText(20),
  territory: optionalText(100),
  // Defaults to false, not true: an unchecked checkbox is simply absent from
  // FormData, so defaulting to true would make "deactivate this account"
  // silently do nothing. The edit form always renders the checkbox.
  active:    z.coerce.boolean().default(false),
}).refine(v => v.role !== 'MR' || !!v.mr_code, {
  message: 'An MR code is required for medical representatives',
  path: ['mr_code'],
})

export const ErpUserCreateSchema = z.object({
  name:      requiredText('Name', 100),
  email:     z.email('Enter a valid email address'),
  phone,
  role:      z.enum(ERP_ROLES),
  mr_code:   optionalText(20),
  territory: optionalText(100),
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
 * A priced line on a field order (Q2). Rate and discount give the order an
 * ESTIMATED value for MR performance and demand tracking — it is not a sale,
 * moves no stock, and creates no receivable.
 */
const FieldOrderItemInput = z.object({
  product_id:       uuid,
  quantity:         positiveInt,
  unit:             optionalText(20),
  unit_rate:        z.union([money, z.literal('')]).transform(v => (v === '' ? undefined : v)).optional(),
  discount_percent: percent.default(0),
  remarks:          optionalText(200),
})

/** An order captured during a visit. This is a demand signal, never an
 *  invoice — see the note on erp_field_orders (spec §4, §29). */
const FieldOrderInput = z.object({
  received:          z.coerce.boolean().default(false),
  order_book_number: optionalText(50),
  remarks:           optionalText(500),
  items:             z.array(FieldOrderItemInput).default([]),
}).refine(v => !v.received || v.items.length > 0, {
  message: 'Add at least one product to the order',
  path: ['items'],
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
  latitude:    z.union([z.coerce.number().min(-90).max(90), z.literal('')]).optional(),
  longitude:   z.union([z.coerce.number().min(-180).max(180), z.literal('')]).optional(),
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
  // Exactly one buyer — a sale is either to a distributor or direct to a
  // chemist, never both, never neither. The database re-checks this too
  // (erp_sales_invoice_buyer_xor).
  distributor_id: optionalUuid,
  chemist_id:     optionalUuid,
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
}).refine(data => !!data.distributor_id !== !!data.chemist_id, {
  message: 'Choose either a distributor or a chemist to bill.',
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

export const FollowupUpdateSchema = z.object({
  followup_id: uuid,
  status:      z.enum(FOLLOWUP_STATUSES),
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
