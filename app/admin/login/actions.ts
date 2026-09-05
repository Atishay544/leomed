'use server'

import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { ErpLoginSchema } from '@/lib/erp/schemas'
import { invalid, runAction, type ActionState } from '@/lib/erp/actions/shared'

/** Only in-app destinations — never an absolute URL an attacker could plant
 *  in the query string to bounce a freshly-authenticated admin off-site. */
function safeRedirect(value: FormDataEntryValue | null): string | null {
  const raw = typeof value === 'string' ? value : ''
  if (!raw.startsWith('/admin/') || raw.startsWith('//')) return null
  if (raw.startsWith('/admin/login')) return null
  return raw
}

/**
 * A second front door onto the exact same staff identity as /erp/login —
 * there is no separate "admin account" system. This one exists purely so
 * admins have a memorable, admin-branded URL, and it enforces role = 'ADMIN'
 * specifically: an MR/ACCOUNTANT/MANAGER/VIEWER account is valid staff but
 * gets turned away here and pointed at /erp/login, where it belongs.
 */
export async function adminLogin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let destination: string | null = null

  const result = await runAction('Could not sign you in. Please try again.', async () => {
    const parsed = ErpLoginSchema.safeParse({
      email:    formData.get('email'),
      password: formData.get('password'),
    })
    if (!parsed.success) return invalid(parsed.error)

    const supabase = await createServerClient()
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data)

    if (error || !data.user) {
      // Deliberately not "no such user" vs "wrong password": that difference
      // tells an attacker which staff emails are real.
      return { ok: false, error: 'Incorrect email or password.' }
    }

    const { data: staff } = await supabase
      .from('erp_users')
      .select('role, active')
      .eq('auth_user_id', data.user.id)
      .maybeSingle()

    if (!staff || staff.active !== true) {
      await supabase.auth.signOut()
      return {
        ok: false,
        error: 'This account does not have access to the Leomed staff portal. Contact your administrator.',
      }
    }

    if (staff.role !== 'ADMIN') {
      await supabase.auth.signOut()
      return {
        ok: false,
        error: 'This is not an admin account. MR, Accountant, Manager, and Viewer staff sign in at /erp/login.',
      }
    }

    destination = safeRedirect(formData.get('redirect')) ?? '/admin/dashboard'
    return { ok: true }
  })

  // redirect() throws, so it must run outside runAction's catch.
  if (result.ok && destination) redirect(destination)
  return result
}
