import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'

/**
 * React cache() deduplicates across layout + page within one request.
 * Auth pages (account, orders, wishlist…) call this once — no duplicate DB hits.
 */
export const requireUser = cache(async (redirectTo = '/login') => {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`${redirectTo}?redirect=${encodeURIComponent(redirectTo)}`)
  return { user, supabase }
})
