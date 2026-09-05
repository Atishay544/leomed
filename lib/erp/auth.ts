import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { can, type Capability } from './permissions'
import { ErpAuthError } from './errors'
import type { ErpSession } from './types'

export { ErpAuthError }

/**
 * Server-side authorization for the ERP.
 *
 * Three layers guard /erp, and this is the middle one:
 *
 *   proxy.ts   cheap edge gate — is there a session cookie at all?
 *   THIS FILE  authoritative — who is this person and what may they do?
 *   RLS        final backstop — enforced even if this file were bypassed
 *
 * getUser() is used rather than the storefront's faster getSession() because
 * getSession() only decodes the cookie, while getUser() revalidates it against
 * Supabase Auth. A revoked or tampered session must not reach billing screens,
 * and React cache() means the cost is one call per request, not per component.
 */

export const getErpSession = cache(async (): Promise<ErpSession | null> => {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Read under the caller's own RLS, so this query doubles as proof the JWT is
  // genuine: a forged token cannot satisfy the auth_user_id = auth.uid() policy.
  const { data } = await supabase
    .from('erp_users')
    .select('id, name, email, role, mr_code, territory')
    .eq('auth_user_id', user.id)
    .eq('active', true)
    .maybeSingle()

  if (!data) return null

  return {
    id:        data.id as string,
    authUserId: user.id,
    name:      data.name as string,
    email:     data.email as string,
    role:      data.role as ErpSession['role'],
    mrCode:    (data.mr_code as string | null) ?? null,
    territory: (data.territory as string | null) ?? null,
  }
})

/**
 * Gate a page or server action on being active ERP staff.
 * A signed-in storefront customer who is not staff lands back on the store.
 */
export async function requireErpUser(redirectTo?: string): Promise<ErpSession> {
  const session = await getErpSession()
  if (!session) {
    const target = redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ''
    redirect(`/erp/login${target}`)
  }
  return session
}

/** Gate on a specific capability. Sends an authenticated-but-unauthorized
 *  user to their own home rather than to the login page, which would be a
 *  confusing dead end for someone who is legitimately signed in. */
export async function requireCapability(capability: Capability): Promise<ErpSession> {
  const session = await requireErpUser()
  if (!can(session.role, capability)) {
    redirect('/erp/denied?need=' + encodeURIComponent(capability))
  }
  return session
}

/**
 * For server actions. Throws instead of redirecting, so the caller can return
 * a typed error to the form rather than bouncing the user out of a half-filled
 * screen. Every server action must call this — actions are reachable by direct
 * POST, not only through the UI.
 */
export async function assertCapability(capability: Capability): Promise<ErpSession> {
  const session = await getErpSession()
  if (!session) throw new ErpAuthError('Your session has expired. Please sign in again.')
  if (!can(session.role, capability)) {
    throw new ErpAuthError('You do not have permission to do that.')
  }
  return session
}
