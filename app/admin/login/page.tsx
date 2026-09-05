import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LayoutDashboard } from 'lucide-react'
import { getErpSession } from '@/lib/erp/auth'
import AdminLoginForm from './AdminLoginForm'

export const metadata = {
  title: 'Admin Sign In — Leomed Pharma',
  // A private admin portal has no business in search results.
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const { redirect: redirectTo } = await searchParams

  // Already signed in as an admin? Don't make them type it again.
  const session = await getErpSession()
  if (session?.role === 'ADMIN') redirect(redirectTo ?? '/admin/dashboard')

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">

        <div className="text-center mb-7">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl
                          bg-linear-to-br from-gray-800 to-black shadow-lg shadow-gray-900/15">
            <LayoutDashboard size={22} className="text-white" strokeWidth={2.2} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">Leomed Pharma</h1>
          <p className="mt-1 text-[13px] text-gray-500">Admin Portal</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <AdminLoginForm redirectTo={redirectTo} />
        </div>

        <p className="mt-5 text-center text-xs leading-relaxed text-gray-500">
          Field force staff (MR, Accountant, Manager, Viewer)?{' '}
          <Link href="/erp/login" className="font-medium text-emerald-700 hover:underline">
            Sign in at the staff portal
          </Link>
          <br />
          Shopping for medicines?{' '}
          <Link href="/" className="font-medium text-emerald-700 hover:underline">
            Visit the store
          </Link>
        </p>
      </div>
    </main>
  )
}
