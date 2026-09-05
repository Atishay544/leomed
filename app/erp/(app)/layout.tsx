import { requireErpUser } from '@/lib/erp/auth'
import ErpShell from '@/components/erp/ErpShell'
import { erpLogout } from '../login/actions'

export const metadata = {
  title: { default: 'Leomed Pharma ERP', template: '%s — Leomed Pharma' },
  robots: { index: false, follow: false },
}

// Every ERP screen is per-user and per-role; nothing here may be cached
// statically or served from a shared cache.
export const dynamic = 'force-dynamic'

export default async function ErpAppLayout({ children }: { children: React.ReactNode }) {
  // Authoritative gate. proxy.ts only checked that a session cookie exists;
  // this confirms the person is active staff and loads their real role.
  const session = await requireErpUser()

  return (
    <ErpShell session={session} logout={erpLogout}>
      {children}
    </ErpShell>
  )
}
