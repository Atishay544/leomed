import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'

/**
 * React cache() deduplicates this across layout + page within one request.
 * Middleware (Edge) already verified the admin JWT before this runs — so we
 * only need a local getSession() cookie read (~1ms, no Supabase network call).
 */
export const requireAdmin = cache(async () => {
  const supabase = await createServerClient()

  // getSession() decodes JWT from cookie locally — no Supabase API round-trip
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) redirect('/login?redirect=/admin/dashboard')

  const fullName = (user.user_metadata?.full_name ?? user.email ?? '') as string
  return { user, profile: { role: 'admin' as const, full_name: fullName } }
})
