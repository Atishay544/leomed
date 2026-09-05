import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'

export const metadata = { title: 'Customer Detail' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CustomerDetailPage({ params }: PageProps) {
  await requireAdmin()
  const supabase = createAdminClient()

  const { id } = await params

  const [profileRes, authUserRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, phone, role, created_at, updated_at')
      .eq('id', id)
      .single(),
    supabase.auth.admin.getUserById(id).catch(() => ({ data: { user: null } })),
  ])

  const customer = profileRes.data
  if (!customer) notFound()

  const email = (authUserRes as any)?.data?.user?.email ?? ''

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link href="/admin/customers" className="text-sm text-gray-500 hover:text-gray-700">Customers</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-gray-900">{customer.full_name || 'Unknown'}</h1>
      </div>

      <div className="max-w-md">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Profile</h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Name</dt>
              <dd className="text-gray-700 font-medium">{customer.full_name || '—'}</dd>
            </div>
            {email && (
              <div>
                <dt className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Email</dt>
                <dd>
                  <a href={`mailto:${email}`} className="text-blue-600 hover:underline text-sm break-all">{email}</a>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Phone</dt>
              <dd>
                {customer.phone
                  ? <a href={`tel:${customer.phone}`} className="text-gray-700 hover:text-green-600">{customer.phone}</a>
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Joined</dt>
              <dd className="text-gray-700">{new Date(customer.created_at).toLocaleDateString('en-IN', { dateStyle: 'long' })}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
