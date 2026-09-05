// Development seed for the Leomed Pharma ERP (spec §48).
//
//   node scripts/erp-seed.js
//
// Creates four staff logins plus realistic doctors, chemists, distributors,
// suppliers, products, batches, visits, field orders, purchases and sales.
//
// Uses the service-role key, which bypasses RLS — that is the point: the
// SECURITY DEFINER business functions check auth.uid(), and a service-role
// connection has no signed-in user, so the seed writes tables directly. It
// still exercises the database triggers: batch quantities here are produced by
// the inventory ledger trigger, never written by this script.
//
// Safe to re-run: every insert is keyed and skipped if already present.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') })
const { createClient } = require('@supabase/supabase-js')

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const db = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const PASSWORD = 'Leomed@2026'

const STAFF = [
  { email: 'admin@leomedpharma.com',      name: 'Anita Deshpande', role: 'ADMIN',      mr_code: null,   territory: null },
  { email: 'mr001@leomedpharma.com',      name: 'Rahul Verma',     role: 'MR',         mr_code: 'MR001', territory: 'Indore North' },
  { email: 'mr002@leomedpharma.com',      name: 'Sneha Patil',     role: 'MR',         mr_code: 'MR002', territory: 'Indore South' },
  { email: 'accounts@leomedpharma.com',   name: 'Vikram Joshi',    role: 'ACCOUNTANT', mr_code: null,   territory: null },
]

const DOCTORS = [
  { doctor_name: 'Dr. Rajesh Kumar',   specialization: 'Paediatrics',      qualification: 'MBBS, MD', clinic_name: 'Kumar Child Care',      phone: '9876543210', area: 'Vijay Nagar',  city: 'Indore', territory: 'Indore North' },
  { doctor_name: 'Dr. Meera Sharma',   specialization: 'Gynaecology',      qualification: 'MBBS, MS', clinic_name: 'Sharma Womens Clinic',  phone: '9876543211', area: 'Palasia',      city: 'Indore', territory: 'Indore North' },
  { doctor_name: 'Dr. Anil Bhatt',     specialization: 'General Medicine', qualification: 'MBBS',     clinic_name: 'Bhatt Clinic',          phone: '9876543212', area: 'Rajwada',      city: 'Indore', territory: 'Indore South' },
  { doctor_name: 'Dr. Kavita Menon',   specialization: 'Dermatology',      qualification: 'MBBS, MD', clinic_name: 'Skin & Care Centre',    phone: '9876543213', area: 'Sudama Nagar', city: 'Indore', territory: 'Indore South' },
  { doctor_name: 'Dr. Sanjay Gupta',   specialization: 'Orthopaedics',     qualification: 'MBBS, MS', clinic_name: 'Gupta Bone Clinic',     phone: '9876543214', area: 'Vijay Nagar',  city: 'Indore', territory: 'Indore North' },
]

const CHEMISTS = [
  { chemist_name: 'Sharma Medical Store',  owner_name: 'Ramesh Sharma', phone: '9812340001', area: 'Vijay Nagar',  city: 'Indore', territory: 'Indore North', gst_number: '23AAACS1234A1Z5', drug_license_number: 'MP/IND/20B/1234' },
  { chemist_name: 'City Pharma',           owner_name: 'Pooja Jain',    phone: '9812340002', area: 'Palasia',      city: 'Indore', territory: 'Indore North', gst_number: '23AAACC5678B1Z3', drug_license_number: 'MP/IND/20B/5678' },
  { chemist_name: 'LifeLine Chemists',     owner_name: 'Imran Khan',    phone: '9812340003', area: 'Rajwada',      city: 'Indore', territory: 'Indore South', gst_number: '23AAACL9012C1Z1', drug_license_number: 'MP/IND/20B/9012' },
  { chemist_name: 'Wellness Drug House',   owner_name: 'Sunita Rao',    phone: '9812340004', area: 'Sudama Nagar', city: 'Indore', territory: 'Indore South', gst_number: null,               drug_license_number: 'MP/IND/20B/3456' },
]

const DISTRIBUTORS = [
  { distributor_name: 'Malwa Pharma Distributors', contact_person: 'Nitin Agarwal', phone: '9822110001', city: 'Indore',  state: 'Madhya Pradesh', territory: 'Indore North', gst_number: '23AAACM1111D1Z9', payment_terms: '30 days', credit_limit: 500000 },
  { distributor_name: 'Narmada Medicos',           contact_person: 'Shalini Rane',  phone: '9822110002', city: 'Bhopal',  state: 'Madhya Pradesh', territory: 'Bhopal',       gst_number: '23AAACN2222E1Z7', payment_terms: '45 days', credit_limit: 750000 },
  { distributor_name: 'Sun Healthcare Supplies',   contact_person: 'Deepak Sethi',  phone: '9822110003', city: 'Ujjain',  state: 'Madhya Pradesh', territory: 'Ujjain',       gst_number: '23AAACS3333F1Z5', payment_terms: '15 days', credit_limit: 300000 },
]

const SUPPLIERS = [
  { supplier_name: 'Zenith Formulations Pvt Ltd', contact_person: 'Arun Mehta',   phone: '9833220001', city: 'Ahmedabad', state: 'Gujarat',     gst_number: '24AAACZ1111G1Z2', payment_terms: '30 days' },
  { supplier_name: 'Aurex Life Sciences',         contact_person: 'Priya Nair',   phone: '9833220002', city: 'Hyderabad', state: 'Telangana',   gst_number: '36AAACA2222H1Z4', payment_terms: '45 days' },
]

const PRODUCTS = [
  { product_name: 'Amoxiclav 625',      generic_name: 'Amoxicillin + Clavulanic acid', brand_name: 'Amoxiclav', category: 'Antibiotic',   dosage_form: 'Tablet',  strength: '625 mg',   pack_size: '10x10', unit: 'BOX',    mrp: 168.00, purchase_rate: 92.00,  sale_rate: 118.00, gst_rate: 12, hsn_code: '30049099', min_stock_level: 50 },
  { product_name: 'Pantorex 40',        generic_name: 'Pantoprazole',                  brand_name: 'Pantorex',  category: 'Antacid',      dosage_form: 'Tablet',  strength: '40 mg',    pack_size: '10x15', unit: 'BOX',    mrp: 145.00, purchase_rate: 74.00,  sale_rate: 96.00,  gst_rate: 12, hsn_code: '30049099', min_stock_level: 60 },
  { product_name: 'Calvimax D3',        generic_name: 'Calcium + Vitamin D3',          brand_name: 'Calvimax',  category: 'Supplement',   dosage_form: 'Tablet',  strength: '500 mg',   pack_size: '10x15', unit: 'BOX',    mrp: 210.00, purchase_rate: 108.00, sale_rate: 142.00, gst_rate: 12, hsn_code: '30045090', min_stock_level: 40 },
  { product_name: 'Cofrelief Syrup',    generic_name: 'Dextromethorphan + CPM',        brand_name: 'Cofrelief', category: 'Cough & Cold', dosage_form: 'Syrup',   strength: '100 ml',   pack_size: '1x100', unit: 'BOTTLE', mrp: 96.00,  purchase_rate: 48.00,  sale_rate: 64.00,  gst_rate: 12, hsn_code: '30049011', min_stock_level: 100 },
  { product_name: 'Dermaheal Cream',    generic_name: 'Clobetasol + Neomycin',         brand_name: 'Dermaheal', category: 'Dermatology',  dosage_form: 'Cream',   strength: '15 g',     pack_size: '1x15',  unit: 'TUBE',   mrp: 132.00, purchase_rate: 66.00,  sale_rate: 88.00,  gst_rate: 12, hsn_code: '30049099', min_stock_level: 80 },
  { product_name: 'Ferrovit XT',        generic_name: 'Ferrous ascorbate + Folic acid',brand_name: 'Ferrovit',  category: 'Haematinic',   dosage_form: 'Tablet',  strength: '100 mg',   pack_size: '10x10', unit: 'BOX',    mrp: 189.00, purchase_rate: 96.00,  sale_rate: 126.00, gst_rate: 12, hsn_code: '30045010', min_stock_level: 45 },
  { product_name: 'Ortholief Gel',      generic_name: 'Diclofenac + Linseed oil',      brand_name: 'Ortholief', category: 'Analgesic',    dosage_form: 'Gel',     strength: '30 g',     pack_size: '1x30',  unit: 'TUBE',   mrp: 118.00, purchase_rate: 58.00,  sale_rate: 78.00,  gst_rate: 12, hsn_code: '30049099', min_stock_level: 70 },
  { product_name: 'Zincovit Drops',     generic_name: 'Multivitamin + Zinc',           brand_name: 'Zincovit',  category: 'Supplement',   dosage_form: 'Drops',   strength: '15 ml',    pack_size: '1x15',  unit: 'BOTTLE', mrp: 88.00,  purchase_rate: 42.00,  sale_rate: 58.00,  gst_rate: 5,  hsn_code: '30045090', min_stock_level: 90 },
]

// ── Helpers ─────────────────────────────────────────────────────────────────

function daysFromNow(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

async function upsertBy(table, keyColumn, rows) {
  const out = []
  for (const row of rows) {
    const { data: existing } = await db
      .from(table).select('*').eq(keyColumn, row[keyColumn]).maybeSingle()

    if (existing) { out.push(existing); continue }

    const { data, error } = await db.from(table).insert(row).select().single()
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(data)
  }
  return out
}

async function main() {
  console.log('Seeding Leomed Pharma ERP…\n')

  // ── Staff (auth users + erp_users) ────────────────────────────────────────
  const { data: authList, error: listErr } = await db.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) throw listErr

  const staff = {}
  for (const person of STAFF) {
    let authUser = authList.users.find(u => u.email?.toLowerCase() === person.email)

    if (!authUser) {
      const { data, error } = await db.auth.admin.createUser({
        email: person.email,
        password: PASSWORD,
        email_confirm: true,
        app_metadata: { erp_role: person.role },
        user_metadata: { full_name: person.name },
      })
      if (error) throw new Error(`auth ${person.email}: ${error.message}`)
      authUser = data.user
    }

    const { data: existing } = await db
      .from('erp_users').select('*').eq('auth_user_id', authUser.id).maybeSingle()

    if (existing) {
      staff[person.role === 'MR' ? person.mr_code : person.role] = existing
    } else {
      const { data, error } = await db.from('erp_users').insert({
        auth_user_id: authUser.id,
        name: person.name,
        email: person.email,
        role: person.role,
        mr_code: person.mr_code,
        territory: person.territory,
      }).select().single()
      if (error) throw new Error(`erp_users ${person.email}: ${error.message}`)
      staff[person.role === 'MR' ? person.mr_code : person.role] = data
    }
  }
  const admin = staff.ADMIN
  const mr1 = staff.MR001
  const mr2 = staff.MR002
  console.log(`  staff            ${STAFF.length}`)

  // ── Masters ───────────────────────────────────────────────────────────────
  const doctors = await upsertBy('erp_doctors', 'doctor_name',
    DOCTORS.map(d => ({ ...d, created_by: admin.id, updated_by: admin.id })))
  console.log(`  doctors          ${doctors.length}`)

  const chemists = await upsertBy('erp_chemists', 'chemist_name',
    CHEMISTS.map(c => ({ ...c, created_by: admin.id, updated_by: admin.id })))
  console.log(`  chemists         ${chemists.length}`)

  const distributors = await upsertBy('erp_distributors', 'distributor_name',
    DISTRIBUTORS.map(d => ({ ...d, created_by: admin.id, updated_by: admin.id })))
  console.log(`  distributors     ${distributors.length}`)

  const suppliers = await upsertBy('erp_suppliers', 'supplier_name',
    SUPPLIERS.map(s => ({ ...s, created_by: admin.id, updated_by: admin.id })))
  console.log(`  suppliers        ${suppliers.length}`)

  const products = await upsertBy('erp_products', 'product_name',
    PRODUCTS.map(p => ({ ...p, created_by: admin.id, updated_by: admin.id })))
  console.log(`  products         ${products.length}`)

  // ── Batches ───────────────────────────────────────────────────────────────
  // Deliberately mixed expiries so the dashboard has something to warn about:
  // one long-dated batch, one expiring inside the warning window, and one
  // already expired.
  const batchPlan = [
    { suffix: 'A', expiryDays: 540, qty: 300 },
    { suffix: 'B', expiryDays: 60,  qty: 80  },
    { suffix: 'C', expiryDays: -20, qty: 25  },
  ]

  const batches = []
  for (const product of products) {
    for (const plan of batchPlan) {
      // Only the first two products get an expired batch — enough to exercise
      // the warnings without making the whole catalogue look neglected.
      if (plan.expiryDays < 0 && products.indexOf(product) > 1) continue

      const batchNumber = `${product.product_code}-${plan.suffix}`
      const { data: existing } = await db
        .from('erp_product_batches')
        .select('*')
        .eq('product_id', product.id)
        .eq('batch_number', batchNumber)
        .maybeSingle()

      if (existing) { batches.push(existing); continue }

      const { data: batch, error } = await db.from('erp_product_batches').insert({
        product_id: product.id,
        batch_number: batchNumber,
        manufacturing_date: daysFromNow(plan.expiryDays - 720),
        expiry_date: daysFromNow(plan.expiryDays),
        mrp: product.mrp,
        purchase_rate: product.purchase_rate,
        sale_rate: product.sale_rate,
        created_by: admin.id,
      }).select().single()
      if (error) throw new Error(`batch ${batchNumber}: ${error.message}`)

      // Opening stock through the ledger, never by writing current_quantity —
      // the trigger derives the batch quantity from this row.
      const { error: txnError } = await db.from('erp_inventory_transactions').insert({
        product_id: product.id,
        batch_id: batch.id,
        transaction_type: 'OPENING',
        reference_type: 'OPENING',
        quantity: plan.qty,
        unit_rate: product.purchase_rate,
        transaction_date: daysFromNow(-45),
        remarks: 'Opening stock (seed data)',
        created_by: admin.id,
      })
      if (txnError) throw new Error(`opening stock ${batchNumber}: ${txnError.message}`)

      batches.push(batch)
    }
  }
  console.log(`  batches          ${batches.length}`)

  // ── Doctor visits, with products detailed and some field orders ───────────
  const { count: visitCount } = await db
    .from('erp_doctor_visits').select('id', { count: 'exact', head: true })

  if ((visitCount ?? 0) === 0) {
    let orderSeq = 0
    for (let day = 1; day <= 6; day++) {
      for (const [index, doctor] of doctors.entries()) {
        const mr = index % 2 === 0 ? mr1 : mr2
        // The same doctor is visited by both MRs across the week — the spec is
        // explicit that doctors are not owned by one rep.
        const visitor = day % 3 === 0 ? (mr === mr1 ? mr2 : mr1) : mr

        const { data: visit, error } = await db.from('erp_doctor_visits').insert({
          doctor_id: doctor.id,
          mr_id: visitor.id,
          visit_date: daysFromNow(-day),
          visit_time: `${9 + (index % 8)}:30:00`,
          purpose: index % 3 === 0 ? 'PRODUCT_DETAILING' : 'FOLLOW_UP',
          discussion: 'Discussed current prescriptions and shared clinical literature.',
          doctor_status: 'EXISTING',
          follow_up_required: false,
          created_by: visitor.id,
          updated_by: visitor.id,
        }).select().single()
        if (error) throw new Error(`doctor visit: ${error.message}`)

        const detailed = products.slice(index % 3, (index % 3) + 3)
        for (const product of detailed) {
          await db.from('erp_doctor_visit_products').insert({
            visit_id: visit.id,
            product_id: product.id,
            discussion_type: 'DETAILED',
            sample_quantity: index % 2,
          })
        }

        // Roughly every third visit produces an order.
        if ((day + index) % 3 === 0) {
          orderSeq += 1
          const { data: order, error: orderErr } = await db.from('erp_field_orders').insert({
            order_number: `FO/SEED/${String(orderSeq).padStart(5, '0')}`,
            customer_type: 'DOCTOR',
            doctor_id: doctor.id,
            mr_id: visitor.id,
            doctor_visit_id: visit.id,
            order_date: daysFromNow(-day),
            order_book_number: `OB-${visitor.mr_code}-${String(orderSeq).padStart(4, '0')}`,
            status: 'RECEIVED',
            created_by: visitor.id,
            updated_by: visitor.id,
          }).select().single()
          if (orderErr) throw new Error(`field order: ${orderErr.message}`)

          for (const [lineIndex, product] of detailed.slice(0, 2).entries()) {
            await db.from('erp_field_order_items').insert({
              field_order_id: order.id,
              product_id: product.id,
              quantity: 5 + ((day + index) % 15),
              unit: product.unit,
              unit_rate: product.sale_rate,
              // Some lines carry a trade discount so the estimated value is
              // exercised, not just quantity x rate (Q2).
              discount_percent: lineIndex === 0 && day % 2 === 0 ? 5 : 0,
            })
          }
        }
      }
    }

    // A brand-new doctor recorded during a visit, which is what makes the
    // "new vs existing" reporting meaningful.
    const { data: newVisit } = await db.from('erp_doctor_visits').insert({
      doctor_id: doctors[0].id,
      mr_id: mr1.id,
      visit_date: daysFromNow(0),
      purpose: 'INTRODUCTION',
      discussion: 'First meeting — introduced the paediatric range.',
      doctor_status: 'NEW',
      created_by: mr1.id,
      updated_by: mr1.id,
    }).select().single()

    const { data: newDoctor } = await db.from('erp_doctors').insert({
      doctor_name: 'Dr. Nikhil Saxena',
      specialization: 'Paediatrics',
      qualification: 'MBBS, DCH',
      clinic_name: 'Saxena Kids Clinic',
      phone: '9876543299',
      area: 'Bengali Square',
      city: 'Indore',
      territory: 'Indore North',
      created_from_visit_id: newVisit.id,
      created_by: mr1.id,
      updated_by: mr1.id,
    }).select().single()

    await db.from('erp_doctor_visits').update({ doctor_id: newDoctor.id }).eq('id', newVisit.id)

    console.log(`  doctor visits    ${doctors.length * 6 + 1}`)
    console.log(`  field orders     ${orderSeq}`)
  } else {
    console.log('  doctor visits    (already seeded, skipped)')
  }

  // ── Chemist visits ────────────────────────────────────────────────────────
  const { count: chemistVisitCount } = await db
    .from('erp_chemist_visits').select('id', { count: 'exact', head: true })

  if ((chemistVisitCount ?? 0) === 0) {
    for (let day = 1; day <= 4; day++) {
      for (const [index, chemist] of chemists.entries()) {
        const visitor = index % 2 === 0 ? mr1 : mr2
        await db.from('erp_chemist_visits').insert({
          chemist_id: chemist.id,
          mr_id: visitor.id,
          visit_date: daysFromNow(-day),
          purpose: 'ORDER_COLLECTION',
          discussion: 'Checked stock position and collected the pending order book.',
          created_by: visitor.id,
          updated_by: visitor.id,
        })
      }
    }
    console.log(`  chemist visits   ${chemists.length * 4}`)
  } else {
    console.log('  chemist visits   (already seeded, skipped)')
  }

  // ── Follow-ups ────────────────────────────────────────────────────────────
  const { count: followupCount } = await db
    .from('erp_followups').select('id', { count: 'exact', head: true })

  if ((followupCount ?? 0) === 0) {
    await db.from('erp_followups').insert([
      { mr_id: mr1.id, customer_type: 'DOCTOR', doctor_id: doctors[0].id, followup_date: daysFromNow(-2), description: 'Collect feedback on the trial pack', priority: 'HIGH', created_by: mr1.id },
      { mr_id: mr1.id, customer_type: 'DOCTOR', doctor_id: doctors[1].id, followup_date: daysFromNow(0),  description: 'Share paediatric dosage chart',     priority: 'MEDIUM', created_by: mr1.id },
      { mr_id: mr2.id, customer_type: 'CHEMIST', chemist_id: chemists[2].id, followup_date: daysFromNow(1), description: 'Confirm restock quantity',        priority: 'LOW', created_by: mr2.id },
    ])
    console.log('  follow-ups       3')
  } else {
    console.log('  follow-ups       (already seeded, skipped)')
  }

  // ── Purchase invoice ──────────────────────────────────────────────────────
  const { count: purchaseCount } = await db
    .from('erp_purchase_invoices').select('id', { count: 'exact', head: true })

  if ((purchaseCount ?? 0) === 0) {
    const lines = products.slice(0, 4).map(p => ({
      product: p,
      batch: batches.find(b => b.product_id === p.id && b.batch_number.endsWith('-A')),
      quantity: 100,
      free_quantity: 10,
      rate: Number(p.purchase_rate),
      gst: Number(p.gst_rate),
    }))

    let subtotal = 0, tax = 0, grand = 0
    const { data: invoice, error } = await db.from('erp_purchase_invoices').insert({
      invoice_number: 'ZEN/2026/00187',
      supplier_id: suppliers[0].id,
      invoice_date: daysFromNow(-20),
      remarks: 'Seed data — opening consignment',
      created_by: admin.id,
      updated_by: admin.id,
    }).select().single()
    if (error) throw new Error(`purchase invoice: ${error.message}`)

    for (const line of lines) {
      const gross = round2(line.quantity * line.rate)
      const taxAmount = round2((gross * line.gst) / 100)
      const lineTotal = gross + taxAmount

      await db.from('erp_purchase_invoice_items').insert({
        purchase_invoice_id: invoice.id,
        product_id: line.product.id,
        batch_id: line.batch.id,
        quantity: line.quantity,
        free_quantity: line.free_quantity,
        purchase_rate: line.rate,
        gst_rate: line.gst,
        taxable_amount: gross,
        tax_amount: taxAmount,
        line_total: lineTotal,
      })

      await db.from('erp_inventory_transactions').insert({
        product_id: line.product.id,
        batch_id: line.batch.id,
        transaction_type: 'PURCHASE',
        reference_type: 'PURCHASE_INVOICE',
        reference_id: invoice.id,
        quantity: line.quantity + line.free_quantity,
        unit_rate: line.rate,
        transaction_date: daysFromNow(-20),
        remarks: 'Purchase invoice ZEN/2026/00187',
        created_by: admin.id,
      })

      subtotal += gross; tax += taxAmount; grand += lineTotal
    }

    // amount_paid is derived from the payment history, so the totals are set
    // first and the payments recorded against them (Q6).
    await db.from('erp_purchase_invoices').update({
      subtotal: round2(subtotal), tax: round2(tax), grand_total: round2(grand),
    }).eq('id', invoice.id)

    // Two part-payments, matching the worked example in the brief.
    const firstPayment = round2(grand * 0.4)
    const secondPayment = round2(grand * 0.3)

    await db.from('erp_purchase_payments').insert([
      {
        purchase_invoice_id: invoice.id, payment_date: daysFromNow(-15),
        amount: firstPayment, payment_method: 'BANK_TRANSFER',
        reference_number: 'UTR2026090512345', created_by: admin.id,
      },
      {
        purchase_invoice_id: invoice.id, payment_date: daysFromNow(-5),
        amount: secondPayment, payment_method: 'CHEQUE',
        reference_number: 'CHQ 004521', created_by: admin.id,
      },
    ])

    console.log('  purchases        1 (2 part-payments)')
  } else {
    console.log('  purchases        (already seeded, skipped)')
  }

  // ── Sales invoices ────────────────────────────────────────────────────────
  const { count: salesCount } = await db
    .from('erp_sales_invoices').select('id', { count: 'exact', head: true })

  if ((salesCount ?? 0) === 0) {
    for (const [index, distributor] of distributors.entries()) {
      const lines = products.slice(index, index + 3).map(p => ({
        product: p,
        batch: batches.find(b => b.product_id === p.id && b.batch_number.endsWith('-A')),
        quantity: 20 + index * 5,
        rate: Number(p.sale_rate),
        gst: Number(p.gst_rate),
      })).filter(l => l.batch)

      let subtotal = 0, tax = 0, grand = 0
      const { data: invoice, error } = await db.from('erp_sales_invoices').insert({
        invoice_number: `INV/SEED/${String(index + 1).padStart(5, '0')}`,
        distributor_id: distributor.id,
        invoice_date: daysFromNow(-(index + 2)),
        created_by: admin.id,
        updated_by: admin.id,
      }).select().single()
      if (error) throw new Error(`sales invoice: ${error.message}`)

      for (const line of lines) {
        const gross = round2(line.quantity * line.rate)
        const taxAmount = round2((gross * line.gst) / 100)
        const lineTotal = gross + taxAmount

        await db.from('erp_sales_invoice_items').insert({
          sales_invoice_id: invoice.id,
          product_id: line.product.id,
          batch_id: line.batch.id,
          quantity: line.quantity,
          sale_rate: line.rate,
          gst_rate: line.gst,
          taxable_amount: gross,
          tax_amount: taxAmount,
          line_total: lineTotal,
        })

        await db.from('erp_inventory_transactions').insert({
          product_id: line.product.id,
          batch_id: line.batch.id,
          transaction_type: 'SALE',
          reference_type: 'SALES_INVOICE',
          reference_id: invoice.id,
          quantity: -line.quantity,
          unit_rate: line.rate,
          transaction_date: daysFromNow(-(index + 2)),
          remarks: `Sales invoice INV/SEED/${String(index + 1).padStart(5, '0')}`,
          created_by: admin.id,
        })

        subtotal += gross; tax += taxAmount; grand += lineTotal
      }

      await db.from('erp_sales_invoices').update({
        subtotal: round2(subtotal), tax: round2(tax), grand_total: round2(grand),
      }).eq('id', invoice.id)

      // One fully settled, one settled over three receipts, one on credit —
      // so the outstanding report has all three payment states to show.
      const receipts =
        index === 0 ? [round2(grand)]
        : index === 1 ? [round2(grand * 0.25), round2(grand * 0.375), round2(grand * 0.125)]
        : []

      for (const [n, amount] of receipts.entries()) {
        await db.from('erp_sales_receipts').insert({
          sales_invoice_id: invoice.id,
          receipt_date: daysFromNow(-(index + 1) + n),
          amount,
          payment_method: n === 0 ? 'BANK_TRANSFER' : 'UPI',
          reference_number: `RCPT-${index + 1}-${n + 1}`,
          created_by: admin.id,
        })
      }
    }
    console.log(`  sales            ${distributors.length} (paid, part paid, unpaid)`)
  } else {
    console.log('  sales            (already seeded, skipped)')
  }

  // ── Targets ───────────────────────────────────────────────────────────────
  const { count: targetCount } = await db
    .from('erp_targets').select('id', { count: 'exact', head: true })

  if ((targetCount ?? 0) === 0) {
    const monthStart = new Date(); monthStart.setDate(1)
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)
    const from = monthStart.toISOString().slice(0, 10)
    const to = monthEnd.toISOString().slice(0, 10)

    await db.from('erp_targets').insert([
      { mr_id: mr1.id, target_type: 'DOCTOR_VISITS', target_value: 60, period_start: from, period_end: to, created_by: admin.id },
      { mr_id: mr1.id, target_type: 'NEW_DOCTORS',   target_value: 8,  period_start: from, period_end: to, created_by: admin.id },
      { mr_id: mr2.id, target_type: 'DOCTOR_VISITS', target_value: 55, period_start: from, period_end: to, created_by: admin.id },
      { mr_id: mr2.id, target_type: 'FIELD_ORDERS',  target_value: 12, period_start: from, period_end: to, created_by: admin.id },
    ])
    console.log('  targets          4')
  } else {
    console.log('  targets          (already seeded, skipped)')
  }

  // ── Verify the caches agree with their transaction histories ─────────────
  const { data: mismatches, error: reconcileError } = await db.rpc('erp_reconcile_batch_quantities')
  if (reconcileError) {
    console.warn('\n  Could not run stock reconciliation:', reconcileError.message)
  } else if ((mismatches ?? []).length > 0) {
    console.warn(`\n  WARNING: ${mismatches.length} batches disagree with the ledger.`)
  } else {
    console.log('\n  Stock reconciliation: batch quantities match the ledger.')
  }

  const { data: payMismatches, error: payError } = await db.rpc('erp_reconcile_invoice_payments')
  if (payError) {
    console.warn('  Could not run payment reconciliation:', payError.message)
  } else if ((payMismatches ?? []).length > 0) {
    console.warn(`  WARNING: ${payMismatches.length} invoices disagree with their payment history.`)
  } else {
    console.log('  Payment reconciliation: invoice balances match their payment history.')
  }

  console.log('\nDone. Sign in at /erp/login:')
  for (const person of STAFF) {
    console.log(`  ${person.role.padEnd(11)} ${person.email.padEnd(32)} ${PASSWORD}`)
  }
  console.log('\nChange these passwords before using this database for anything real.')
}

main().catch(err => {
  console.error('\nSeed failed:', err.message)
  process.exit(1)
})
