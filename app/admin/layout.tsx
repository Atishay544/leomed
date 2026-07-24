import { requireAdmin } from '@/lib/admin-auth'
import { AdminThemeProvider } from './AdminThemeProvider'
import AdminShell from './AdminShell'

export const dynamic = 'force-dynamic'

function getInitials(name: string) {
  return name.split(/\s+/).map(n => n[0] ?? '').join('').toUpperCase().slice(0, 2) || '?'
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireAdmin()

  const displayName = profile.full_name || user.email?.split('@')[0] || 'Admin'
  const email       = user.email ?? ''
  const initials    = getInitials(displayName)

  return (
    <AdminThemeProvider>
      <AdminShell displayName={displayName} email={email} initials={initials}>
        {children}
      </AdminShell>
    </AdminThemeProvider>
  )
}
