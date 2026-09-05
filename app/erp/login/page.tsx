import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Stethoscope } from 'lucide-react'
import { getErpSession } from '@/lib/erp/auth'
import { homeRouteFor } from '@/lib/erp/permissions'
import ErpLoginForm from './ErpLoginForm'

export const metadata = {
  title: 'Staff Sign In — Leomed Pharma',
  // A private business portal has no business in search results.
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function ErpLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const { redirect: redirectTo } = await searchParams

  // Already signed in as staff? Don't make them type it again.
  const session = await getErpSession()
  if (session) redirect(redirectTo ?? homeRouteFor(session.role))

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">

        <div className="text-center mb-7">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl
                          bg-linear-to-br from-emerald-600 to-teal-700 shadow-lg shadow-emerald-900/15">
            <Stethoscope size={22} className="text-white" strokeWidth={2.2} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">Leomed Pharma</h1>
          <p className="mt-1 text-[13px] text-gray-500">Field Force &amp; Business Portal</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <ErpLoginForm redirectTo={redirectTo} />
        </div>

        <p className="mt-5 text-center text-xs leading-relaxed text-gray-500">
          Staff accounts are created by your administrator.
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
