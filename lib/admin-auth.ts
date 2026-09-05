import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getErpSession } from '@/lib/erp/auth'

/**
 * Gates the storefront admin panel (catalogue, banners, announcements, news,
 * upcoming launches, about page). There is no separate "customer" identity
 * any more — admin staff sign in through the same door as the ERP
 * (/erp/login) and must hold the ERP's own ADMIN role.
 *
 * React cache() deduplicates this across layout + page within one request.
 */
export const requireAdmin = cache(async () => {
  const session = await getErpSession()
  if (!session) redirect('/erp/login?redirect=/admin/dashboard')
  if (session.role !== 'ADMIN') redirect('/erp/denied?need=admin')

  return {
    user:    { id: session.authUserId, email: session.email },
    profile: { role: 'admin' as const, full_name: session.name },
  }
})
