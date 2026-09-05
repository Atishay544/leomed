import { redirect } from 'next/navigation'
import { getErpSession } from '@/lib/erp/auth'
import { homeRouteFor } from '@/lib/erp/permissions'

export const dynamic = 'force-dynamic'

/** /erp is a signpost, not a page: each role has a different useful landing
 *  screen — an MR wants today's visits, an accountant wants the sales list. */
export default async function ErpIndexPage() {
  const session = await getErpSession()
  redirect(session ? homeRouteFor(session.role) : '/erp/login')
}
