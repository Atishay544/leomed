import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { getAdminOrders } from '@/lib/admin-data'
import BulkActions from './BulkActions'
import OrderSearch from './OrderSearch'

export const metadata = { title: 'Orders' }

const PAGE_SIZE = 25

const STATUS_COLORS: Record<string, string> = {
  pending:           'bg-yellow-100 text-yellow-800',
  confirmed:         'bg-blue-100 text-blue-800',
  cod_upfront_paid:  'bg-teal-100 text-teal-800',
  processing:        'bg-purple-100 text-purple-800',
  shipped:           'bg-indigo-100 text-indigo-800',
  delivered:         'bg-green-100 text-green-800',
  cancelled:         'bg-red-100 text-red-800',
  refunded:          'bg-gray-100 text-gray-700',
}

const ALL_STATUSES = ['pending', 'confirmed', 'cod_upfront_paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']

const DATE_PRESETS: Record<string, string> = {
  today: 'Today', yesterday: 'Yesterday', '7d': 'Last 7d', '14d': 'Last 14d', '30d': 'Last 30d',
}

interface PageProps {
  searchParams: Promise<{ status?: string; page?: string; q?: string; date?: string }>
}

export default async function OrdersPage({ searchParams }: PageProps) {
  await requireAdmin()

  const params       = await searchParams
  const statusFilter = (params.status === 'all' || !params.status) ? '' : params.status
  const searchQuery  = params.q ?? ''
  const datePreset   = params.date ?? ''
  const page         = Math.max(1, parseInt(params.page ?? '1', 10))
  const from         = (page - 1) * PAGE_SIZE

  const { countMap, count, orders } = await getAdminOrders(statusFilter, datePreset, page)

  const totalPages = Math.ceil(count / PAGE_SIZE)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
      </div>

      {/* Date preset filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        <Link
          href={`/admin/orders${params.status ? `?status=${params.status}` : ''}`}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${!datePreset ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'}`}
        >All time</Link>
        {Object.entries(DATE_PRESETS).map(([key, label]) => (
          <Link key={key}
            href={`/admin/orders?${params.status ? `status=${params.status}&` : ''}date=${key}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${datePreset === key ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'}`}
          >{label}</Link>
        ))}
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Link
          href={`/admin/orders${datePreset ? `?date=${datePreset}` : ''}`}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${!params.status || params.status === 'all' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}
        >All ({Object.values(countMap).reduce((a, b) => a + b, 0)})</Link>
        {ALL_STATUSES.map(s => {
          const n = countMap[s] ?? 0
          return (
            <Link key={s}
              href={`/admin/orders?status=${s}${datePreset ? `&date=${datePreset}` : ''}`}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors flex items-center gap-1.5 ${statusFilter === s ? 'bg-gray-900 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}
            >
              {s.replace(/_/g, ' ')}
              {n > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${statusFilter === s ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>{n}</span>
              )}
            </Link>
          )
        })}
      </div>

      <OrderSearch />

      <BulkActions
        initialOrders={orders as any}
        statusFilter={statusFilter}
        searchQuery={searchQuery}
      />

      {totalPages > 1 && (
        <div className="mt-4 px-4 py-3 border border-gray-200 bg-white rounded-xl flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {from + 1}–{Math.min(from + PAGE_SIZE, count)} of {count} orders
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/admin/orders?status=${statusFilter}&page=${page - 1}${datePreset ? `&date=${datePreset}` : ''}`} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Previous</Link>
            )}
            {page < totalPages && (
              <Link href={`/admin/orders?status=${statusFilter}&page=${page + 1}${datePreset ? `&date=${datePreset}` : ''}`} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Next</Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
