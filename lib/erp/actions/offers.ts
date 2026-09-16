'use server'

import { revalidatePath } from 'next/cache'
import { assertCapability } from '../auth'
import { erpDb } from '../data/query'
import { createAdminClient } from '@/lib/supabase/admin'
import { ErpUserCreateSchema, OfferLetterSchema, OfferStatusSchema } from '../schemas'
import { friendlyDbError, invalid, runAction, type ActionState } from './shared'

/**
 * Offer-letter mutations — all admin-only (offers.manage), matching the
 * capability erp_save_offer_letter() itself checks server-side.
 */

/** FormData → plain object for Zod, same helper as actions/masters.ts and
 *  actions/admin.ts — duplicated locally rather than exported from either,
 *  since none of those modules export it today. */
function formObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

export async function saveOfferLetter(input: unknown): Promise<ActionState> {
  return runAction('Could not save the offer letter. Please try again.', async () => {
    await assertCapability('offers.manage')

    const parsed = OfferLetterSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { data, error } = await db.rpc('erp_save_offer_letter', { p_payload: parsed.data })
    if (error) return friendlyDbError(error, 'Could not save the offer letter.')

    revalidatePath('/erp/hr/offers')
    return { ok: true, data: (data ?? {}) as Record<string, unknown> }
  })
}

export async function setOfferStatus(input: unknown): Promise<ActionState> {
  return runAction('Could not update the offer letter.', async () => {
    const session = await assertCapability('offers.manage')

    const parsed = OfferStatusSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { error, count } = await db
      .from('erp_offer_letters')
      .update({ status: parsed.data.status, updated_by: session.id }, { count: 'exact' })
      .eq('id', parsed.data.id)
      .neq('status', 'CONVERTED')

    if (error) return friendlyDbError(error, 'Could not update the offer letter.')
    if (!count) {
      return { ok: false, error: 'That offer letter could not be found, or it has already been converted to an employee.' }
    }

    revalidatePath('/erp/hr/offers')
    revalidatePath(`/erp/hr/offers/${parsed.data.id}`)
    return { ok: true }
  })
}

/**
 * Converts an accepted offer straight into a staff account, the same way
 * createErpUser() (lib/erp/actions/admin.ts) does — a real login is a
 * separate system (Supabase Auth), so this cannot be one atomic database
 * transaction; it follows createErpUser()'s own established sequencing
 * instead: create the auth user, then the erp_users row, then seed a
 * starting salary from the offer's compensation breakup. The offer's
 * DESIGNATION (a free-text job title like "Territory Manager") has no home
 * on erp_users, which only tracks the coarser system ROLE — that's expected,
 * not a gap: the designation lived on the offer letter as a document detail.
 *
 * Standard (prev, formData) shape — usable directly as a MasterFormDialog
 * action — with the offer's id carried as a hidden field (`offer_id`)
 * rather than a bound extra argument, the same way every other
 * already-scoped dialog in this app passes an id it shouldn't let the admin
 * re-pick (see hiddenFields on MasterFormDialog).
 */
export async function convertOfferToEmployee(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('Could not convert this offer to an employee.', async () => {
    const session = await assertCapability('offers.manage')
    await assertCapability('users.manage')

    const offerId = String(formData.get('offer_id') ?? '').trim()
    if (!offerId) return { ok: false, error: 'Missing offer letter.' }

    const db = await erpDb()
    const { data: offer, error: offerError } = await db
      .from('erp_offer_letters')
      .select('id, status')
      .eq('id', offerId)
      .maybeSingle()
    if (offerError) return friendlyDbError(offerError, 'Could not load the offer letter.')
    if (!offer) return { ok: false, error: 'Offer letter not found.' }
    if (offer.status === 'CONVERTED') {
      return { ok: false, error: 'This offer has already been converted to an employee.' }
    }

    const parsed = ErpUserCreateSchema.safeParse(formObject(formData))
    if (!parsed.success) return invalid(parsed.error)

    const { password, ...profile } = parsed.data
    const admin = createAdminClient()

    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email: profile.email,
      password,
      email_confirm: true,
      app_metadata: { erp_role: profile.role },
      user_metadata: { full_name: profile.name },
    })

    if (authError || !created?.user) {
      const message = authError?.message ?? ''
      if (message.toLowerCase().includes('already been registered')) {
        return { ok: false, error: 'An account with that email address already exists.' }
      }
      console.error('[erp] auth user creation failed (offer conversion)', message)
      return { ok: false, error: 'Could not create the login. Please try a different email address.' }
    }

    const { data: newUser, error: rowError } = await db
      .from('erp_users')
      .insert({
        auth_user_id:  created.user.id,
        name:          profile.name,
        email:         profile.email,
        phone:         profile.phone ?? null,
        role:          profile.role,
        mr_code:       profile.mr_code ?? null,
        territory:     profile.territory ?? null,
        department:    profile.department ?? null,
        employee_code: profile.employee_code ?? null,
      })
      .select('id')
      .single()

    if (rowError || !newUser) {
      // Same rollback createErpUser() does: an auth account that can sign in
      // but has no staff record is a confusing half-created user, so the
      // login is removed rather than left behind.
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {})
      return friendlyDbError(rowError, 'Could not create the staff record.')
    }

    // Seed a starting salary from the offer's compensation breakup, if any
    // was filled in — editable afterward on Payroll -> Salaries like any
    // other employee's. EARNING rows become the fixed monthly salary;
    // DEDUCTION rows (e.g. employer PF) become standard deductions; VARIABLE
    // rows (e.g. an MR's target incentive) are deliberately not carried over
    // here — incentives are calculated monthly from actual performance, not
    // a fixed number.
    const { data: components } = await db
      .from('erp_offer_letter_components')
      .select('component_name, category, monthly_amount')
      .eq('offer_letter_id', offerId)

    if (components && components.length > 0) {
      const earning = components.filter(c => c.category === 'EARNING')
      const deduction = components.filter(c => c.category === 'DEDUCTION')
      const basic = earning.find(c => c.component_name.trim().toLowerCase() === 'basic')

      const fixedSalary = earning.reduce((sum, c) => sum + Number(c.monthly_amount), 0)
      const basicSalary = basic ? Number(basic.monthly_amount) : 0
      const standardDeductions = deduction.reduce((sum, c) => sum + Number(c.monthly_amount), 0)

      await db.from('erp_employee_salary').upsert({
        employee_id:         newUser.id,
        fixed_salary:        fixedSalary,
        basic_salary:        basicSalary,
        gross_salary:        fixedSalary,
        allowances:          Math.max(0, fixedSalary - basicSalary),
        standard_deductions: standardDeductions,
        updated_by:          session.id,
      })
    }

    const { error: convertError } = await db
      .from('erp_offer_letters')
      .update({ status: 'CONVERTED', converted_employee_id: newUser.id, updated_by: session.id })
      .eq('id', offerId)
    if (convertError) {
      console.error('[erp] offer status update failed after employee creation', convertError)
      // The employee now exists regardless — this is a bookkeeping failure,
      // not a reason to report the whole operation as failed.
    }

    revalidatePath('/erp/hr/offers')
    revalidatePath(`/erp/hr/offers/${offerId}`)
    revalidatePath('/erp/users')
    revalidatePath('/erp/payroll/salaries')
    return { ok: true, data: { employee_id: newUser.id } }
  })
}
