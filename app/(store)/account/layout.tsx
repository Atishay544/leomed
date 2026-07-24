import { requireUser } from '@/lib/user-auth'
import AccountNav from './AccountNav'

// Account pages are always user-specific — never statically generate them
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'My Account',
  robots: { index: false, follow: false },
}

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  await requireUser('/account')

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar */}
        <aside className="w-full md:w-56 shrink-0">
          <AccountNav />
        </aside>

        {/* Page content */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  )
}
