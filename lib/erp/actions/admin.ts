'use server'

import { revalidatePath } from 'next/cache'
import { assertCapability } from '../auth'
import { erpDb } from '../data/query'
import { createAdminClient } from '@/lib/supabase/admin'
import { ErpUserCreateSchema, ErpUserSchema, SettingsSchema, TargetSchema } from '../schemas'
import { friendlyDbError, invalid, runAction, type ActionState } from './shared'

/**
 * Administration: staff accounts, targets and settings.
 *
 * This is the only file in the ERP that uses the service-role client, and only
 * for the one thing the caller's own session cannot do: create a row in
 * auth.users. Everything else — including the erp_users row itself — goes
 * through the caller's RLS session, so the database still enforces that only
 * an admin can create staff.
 */

function formObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

/**
 * Creates a staff login.
 *
 * There is no self-signup for /erp (plan Q11): the storefront's public signup
 * must never be a route into the business system, so staff accounts exist only
 * because an administrator made them.
 */
export async function createErpUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('Could not create the staff account.', async () => {
    await assertCapability('users.manage')

    const parsed = ErpUserCreateSchema.safeParse(formObject(formData))
    if (!parsed.success) return invalid(parsed.error)

    const { password, ...profile } = parsed.data
    const admin = createAdminClient()

    // app_metadata is server-set and travels inside the signed JWT, which lets
    // proxy.ts do a cheap edge check. It is a routing hint only — every real
    // decision re-reads erp_users, so a stale claim cannot grant access.
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
      console.error('[erp] auth user creation failed', message)
      return { ok: false, error: 'Could not create the login. Please try a different email address.' }
    }

    // Through the caller's session, so RLS re-checks that they are an admin.
    const db = await erpDb()
    const { error: rowError } = await db.from('erp_users').insert({
      auth_user_id: created.user.id,
      name:      profile.name,
      email:     profile.email,
      phone:     profile.phone ?? null,
      role:      profile.role,
      mr_code:   profile.mr_code ?? null,
      territory: profile.territory ?? null,
    })

    if (rowError) {
      // Roll the login back rather than leaving an auth account that can sign
      // in but has no staff record — a confusing half-created user.
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {})
      return friendlyDbError(rowError, 'Could not create the staff record.')
    }

    revalidatePath('/erp/users')
    return { ok: true }
  })
}

export async function updateErpUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('Could not update the staff account.', async () => {
    await assertCapability('users.manage')

    const id = String(formData.get('id') ?? '').trim()
    if (!id) return { ok: false, error: 'Missing staff record.' }

    const parsed = ErpUserSchema.safeParse(formObject(formData))
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { data: updated, error } = await db
      .from('erp_users')
      .update({
        name:      parsed.data.name,
        phone:     parsed.data.phone ?? null,
        role:      parsed.data.role,
        mr_code:   parsed.data.mr_code ?? null,
        territory: parsed.data.territory ?? null,
        active:    parsed.data.active,
      })
      .eq('id', id)
      .select('auth_user_id')
      .maybeSingle()

    if (error) return friendlyDbError(error, 'Could not update the staff account.')
    // .maybeSingle() returns null, not an error, when RLS filters the row
    // out — which for erp_users means "not an admin", so this must not be
    // read as success.
    if (!updated) {
      return { ok: false, error: 'That staff account could not be found, or you cannot change it.' }
    }

    // Keep the JWT hint in step with the row that actually decides access.
    if (updated?.auth_user_id) {
      await createAdminClient().auth.admin.updateUserById(updated.auth_user_id as string, {
        app_metadata: { erp_role: parsed.data.role },
      }).catch(err => console.error('[erp] could not sync app_metadata', err))
    }

    revalidatePath('/erp/users')
    return { ok: true }
  })
}

/** Deactivation, not deletion. erp_is_staff() checks `active`, so access ends
 *  immediately while every visit, order and invoice keeps its author. */
export async function setErpUserActive(id: string, active: boolean): Promise<ActionState> {
  return runAction('Could not update the staff account.', async () => {
    await assertCapability('users.manage')

    const db = await erpDb()
    const { error, count } = await db
      .from('erp_users')
      .update({ active }, { count: 'exact' })
      .eq('id', id)

    if (error) return friendlyDbError(error, 'Could not update the staff account.')
    // A row RLS filters out is 0 rows affected, not an error — checked
    // explicitly so a blocked attempt is never reported as having worked.
    if (!count) {
      return { ok: false, error: 'That staff account could not be found, or you cannot change it.' }
    }

    revalidatePath('/erp/users')
    return { ok: true }
  })
}

// ─── Targets ────────────────────────────────────────────────────────────────

export async function saveTarget(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('Could not save the target.', async () => {
    const session = await assertCapability('targets.manage')

    const parsed = TargetSchema.safeParse(formObject(formData))
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const id = String(formData.get('id') ?? '').trim()

    const values = {
      mr_id:        parsed.data.mr_id ?? null,
      territory:    parsed.data.territory ?? null,
      target_type:  parsed.data.target_type,
      target_value: parsed.data.target_value,
      period_start: parsed.data.period_start,
      period_end:   parsed.data.period_end,
    }

    if (id) {
      const { error, count } = await db
        .from('erp_targets')
        .update(values, { count: 'exact' })
        .eq('id', id)
      if (error) return friendlyDbError(error, 'Could not save the target.')
      if (!count) return { ok: false, error: 'That target could not be found.' }
    } else {
      const { error } = await db.from('erp_targets').insert({ ...values, created_by: session.id })
      if (error) return friendlyDbError(error, 'Could not save the target.')
    }

    revalidatePath('/erp/targets')
    return { ok: true }
  })
}

export async function deleteTarget(id: string): Promise<ActionState> {
  return runAction('Could not remove the target.', async () => {
    await assertCapability('targets.manage')

    const db = await erpDb()
    const { error } = await db.from('erp_targets').delete().eq('id', id)
    if (error) return friendlyDbError(error, 'Could not remove the target.')

    revalidatePath('/erp/targets')
    return { ok: true }
  })
}

// ─── Settings ───────────────────────────────────────────────────────────────

export async function saveSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction('Could not save the settings.', async () => {
    await assertCapability('settings.manage')

    const parsed = SettingsSchema.safeParse(formObject(formData))
    if (!parsed.success) return invalid(parsed.error)

    const db = await erpDb()
    const { error } = await db.from('erp_settings').update(parsed.data).eq('id', 1)
    if (error) return friendlyDbError(error, 'Could not save the settings.')

    // The expiry threshold and edit window are read on nearly every screen.
    revalidatePath('/erp', 'layout')
    return { ok: true }
  })
}
