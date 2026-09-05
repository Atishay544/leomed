'use server'

import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { ErpLoginSchema } from '@/lib/erp/schemas'
import { homeRouteFor } from '@/lib/erp/permissions'
import type { ErpRole } from '@/lib/erp/types'
import { invalid, runAction, type ActionState } from '@/lib/erp/actions/shared'

/** Only in-app destinations — never an absolute URL an attacker could plant
 *  in the query string to bounce a freshly-authenticated user off-site. */
function safeRedirect(value: FormDataEntryValue | null): string | null {
  const raw = typeof value === 'string' ? value : ''
  if (!raw.startsWith('/erp/') || raw.startsWith('//')) return null
  if (raw.startsWith('/erp/login')) return null
  return raw
}

export async function erpLogin(_prev: ActionState, formData: FormData): Promise<ActionState> {
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

    // Being in auth.users is not enough. Storefront customers share the same
    // auth table, so ERP access requires an active row in the staff directory.
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

    destination = safeRedirect(formData.get('redirect')) ?? homeRouteFor(staff.role as ErpRole)
    return { ok: true }
  })

  // redirect() throws, so it must run outside runAction's catch.
  if (result.ok && destination) redirect(destination)
  return result
}

export async function erpLogout() {
  const supabase = await createServerClient()
  await supabase.auth.signOut()
  redirect('/erp/login')
}
