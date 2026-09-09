import type { FieldSpec } from './form/Field'

/**
 * Field definitions for the master-data dialogs. Kept as data so the six
 * screens share one form component — see MasterFormDialog.
 * These mirror the Zod schemas in lib/erp/schemas.ts; the schema is the gate,
 * this is the presentation.
 */

export const DOCTOR_FIELDS: FieldSpec[] = [
  { name: 'doctor_name',    label: 'Doctor name', required: true, placeholder: 'Dr. Rajesh Kumar', span: 2 },
  { name: 'specialization', label: 'Specialisation', placeholder: 'Paediatrics' },
  { name: 'qualification',  label: 'Qualification', placeholder: 'MBBS, MD' },
  { name: 'clinic_name',    label: 'Clinic / hospital', span: 2 },
  { name: 'phone',          label: 'Phone', type: 'tel', placeholder: '98765 43210' },
  { name: 'email',          label: 'Email', type: 'email' },
  { name: 'address',        label: 'Address', type: 'textarea', span: 2 },
  { name: 'area',           label: 'Area' },
  { name: 'city',           label: 'City' },
  { name: 'territory',      label: 'Territory', hint: 'Used to group field reports' },
  { name: 'notes',          label: 'Notes', type: 'textarea', span: 2 },
]

export const CHEMIST_FIELDS: FieldSpec[] = [
  { name: 'chemist_name',        label: 'Chemist / store name', required: true, span: 2 },
  { name: 'owner_name',          label: 'Owner name' },
  { name: 'phone',               label: 'Phone', type: 'tel' },
  { name: 'email',               label: 'Email', type: 'email' },
  { name: 'gst_number',          label: 'GST number' },
  { name: 'drug_license_number', label: 'Drug licence number', span: 2 },
  { name: 'address',             label: 'Address', type: 'textarea', span: 2 },
  { name: 'area',                label: 'Area' },
  { name: 'city',                label: 'City' },
  { name: 'territory',           label: 'Territory' },
  { name: 'notes',               label: 'Notes', type: 'textarea', span: 2 },
]

export const DISTRIBUTOR_FIELDS: FieldSpec[] = [
  { name: 'distributor_name',    label: 'Distributor name', required: true, span: 2 },
  { name: 'contact_person',      label: 'Contact person' },
  { name: 'phone',               label: 'Phone', type: 'tel' },
  { name: 'email',               label: 'Email', type: 'email' },
  { name: 'gst_number',          label: 'GST number' },
  { name: 'drug_license_number', label: 'Drug licence number' },
  { name: 'payment_terms',       label: 'Payment terms', placeholder: '30 days' },
  { name: 'credit_limit',        label: 'Credit limit (₹)', type: 'number', step: '0.01', min: '0' },
  { name: 'territory',           label: 'Territory' },
  { name: 'address',             label: 'Address', type: 'textarea', span: 2 },
  { name: 'city',                label: 'City' },
  { name: 'state',               label: 'State' },
]

export const SUPPLIER_FIELDS: FieldSpec[] = [
  { name: 'supplier_name',       label: 'Supplier name', required: true, span: 2 },
  { name: 'contact_person',      label: 'Contact person' },
  { name: 'phone',               label: 'Phone', type: 'tel' },
  { name: 'email',               label: 'Email', type: 'email' },
  { name: 'gst_number',          label: 'GST number' },
  { name: 'drug_license_number', label: 'Drug licence number' },
  { name: 'payment_terms',       label: 'Payment terms' },
  { name: 'address',             label: 'Address', type: 'textarea', span: 2 },
  { name: 'city',                label: 'City' },
  { name: 'state',               label: 'State' },
]

const DOSAGE_FORMS = [
  'Tablet', 'Capsule', 'Syrup', 'Suspension', 'Injection', 'Ointment',
  'Cream', 'Gel', 'Drops', 'Powder', 'Sachet', 'Spray', 'Lotion',
].map(v => ({ value: v, label: v }))

const UNITS = ['BOX', 'STRIP', 'BOTTLE', 'VIAL', 'TUBE', 'PACK', 'PIECE']
  .map(v => ({ value: v, label: v }))

// India's pharma GST slabs.
const GST_RATES = ['0', '5', '12', '18', '28'].map(v => ({ value: v, label: `${v}%` }))

export const PRODUCT_FIELDS: FieldSpec[] = [
  { name: 'product_name',  label: 'Product name', required: true, span: 2, placeholder: 'Amoxiclav 625' },
  { name: 'generic_name',  label: 'Generic name', placeholder: 'Amoxicillin + Clavulanic acid' },
  { name: 'brand_name',    label: 'Brand name' },
  { name: 'composition',   label: 'Composition', type: 'textarea', span: 2, placeholder: 'e.g. Amoxicillin 500mg + Clavulanic acid 125mg',
    hint: 'Shown to MRs on the price reference screen for detailing.' },
  { name: 'category',      label: 'Therapeutic category', placeholder: 'Antibiotic' },
  { name: 'dosage_form',   label: 'Dosage form', type: 'select', options: DOSAGE_FORMS },
  { name: 'strength',      label: 'Strength', placeholder: '625 mg' },
  { name: 'pack_size',     label: 'Pack size', placeholder: '10x10' },
  { name: 'unit',          label: 'Unit', type: 'select', options: UNITS, required: true },
  { name: 'hsn_code',      label: 'HSN code' },
  { name: 'purchase_rate', label: 'Purchase rate (₹)', type: 'number', step: '0.01', min: '0', required: true,
    hint: 'What we pay our supplier — unrelated to MRP.' },
  // MRP, distributor price, and retailer price as one linked block — see
  // components/erp/form/PricingFields.tsx. This one FieldSpec entry emits
  // three real named inputs (mrp, distributor_price, retailer_price).
  { name: '__pricing', label: 'Pricing', type: 'pricing', span: 2 },
  { name: 'gst_rate',      label: 'GST rate', type: 'select', options: GST_RATES, required: true },
  {
    name: 'min_stock_level', label: 'Low-stock alert at', type: 'number', min: '0',
    hint: 'Flagged on the dashboard below this quantity',
  },
]

/**
 * PRODUCT_FIELDS plus the optional storefront-catalogue link, whose options
 * (the list of public.products) can only be known at request time. Pass the
 * result of listStorefrontProductOptions() from the page.
 */
export function productFieldsWithStorefrontLink(storefrontOptions: { value: string; label: string }[]): FieldSpec[] {
  return [
    ...PRODUCT_FIELDS,
    {
      name: 'storefront_product_id',
      label: 'Storefront catalogue listing',
      type: 'select',
      span: 2,
      options: [{ value: '', label: '— Not shown on the website —' }, ...storefrontOptions],
      hint: 'Optional — links this product to its listing on the public catalogue, if it has one. Does not change what shows there.',
    },
  ]
}

/** Batches carry no quantity field on purpose: stock arrives only through a
 *  purchase invoice or a recorded adjustment (spec §15). */
export const BATCH_FIELDS: FieldSpec[] = [
  { name: 'batch_number',       label: 'Batch number', required: true },
  { name: 'expiry_date',        label: 'Expiry date', type: 'date', required: true },
  { name: 'manufacturing_date', label: 'Manufacturing date', type: 'date' },
  { name: 'mrp',                label: 'MRP (₹)', type: 'number', step: '0.01', min: '0' },
  { name: 'purchase_rate',      label: 'Purchase rate (₹)', type: 'number', step: '0.01', min: '0' },
  { name: 'sale_rate',          label: 'Sale rate (₹)', type: 'number', step: '0.01', min: '0' },
]

// ─── HR: attendance & leave ─────────────────────────────────────────────────

/** One incentive bracket — mr_id is supplied separately as a hiddenField on
 *  MasterFormDialog (company-wide dialogs omit it; per-MR dialogs fix it to
 *  the MR the admin is currently editing). */
export const INCENTIVE_TIER_FIELDS: FieldSpec[] = [
  { name: 'min_amount', label: 'From (₹)', type: 'number', step: '0.01', min: '0', required: true },
  { name: 'max_amount', label: 'To (₹) — blank means no upper limit', type: 'number', step: '0.01', min: '0' },
  { name: 'percentage', label: 'Incentive %', type: 'number', step: '0.01', min: '0', max: '100', required: true },
]

/** A flat incentive rate for one MR — mr_id supplied as a hiddenField on
 *  MasterFormDialog, fixed to whichever MR the admin is editing. */
export const FLAT_INCENTIVE_FIELDS: FieldSpec[] = [
  { name: 'flat_percentage', label: 'Flat incentive %', type: 'number', step: '0.01', min: '0', max: '100', required: true },
]

export const HOLIDAY_FIELDS: FieldSpec[] = [
  { name: 'holiday_date', label: 'Date',          type: 'date', required: true },
  { name: 'name',         label: 'Holiday name',  required: true },
]

/** Per-MR visit-target override. The MR list can only be known at request
 *  time, so this is a function like productFieldsWithStorefrontLink(). */
export function mrTargetFields(mrOptions: { value: string; label: string }[]): FieldSpec[] {
  return [
    { name: 'mr_id', label: 'MR', type: 'select', options: mrOptions, required: true, span: 2 },
    { name: 'required_doctor_visits',  label: 'Doctor visits required per day',  type: 'number', min: '0', required: true },
    { name: 'required_chemist_visits', label: 'Chemist visits required per day', type: 'number', min: '0', required: true },
  ]
}

export const LEAVE_TYPE_FIELDS: FieldSpec[] = [
  { name: 'name',       label: 'Leave type name', required: true, span: 2 },
  { name: 'is_paid',    label: 'Paid leave',      type: 'checkbox' },
  { name: 'active',     label: 'Active',          type: 'checkbox' },
  { name: 'sort_order', label: 'Display order',   type: 'number', min: '0' },
]
