import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import BannerForm from './BannerForm'
import BannerListItem from './BannerListItem'

export const metadata = { title: 'Banners' }

export default async function BannersPage() {
  await requireAdmin()
  const admin = createAdminClient()
  const { data: banners } = await admin
    .from('banners')
    .select('*')
    .order('sort_order', { ascending: true })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Homepage Banners</h1>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
            <span className="shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">1</span>
            <div>
              <p className="text-sm font-semibold text-blue-900">Hero Banner</p>
              <p className="text-xs text-blue-700 mt-0.5">Full-width section at the very top of the homepage. Set <strong>Sort = 0</strong>.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-orange-50 border border-orange-100 rounded-xl px-4 py-3">
            <span className="shrink-0 w-7 h-7 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">2</span>
            <div>
              <p className="text-sm font-semibold text-orange-900">Deals Strip Banner</p>
              <p className="text-xs text-orange-700 mt-0.5">The &quot;Up to 50% OFF&quot; colored strip above the deals grid. Set <strong>Sort = 1</strong>.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Create form — top */}
      <BannerForm />

      {/* List — below */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Existing Banners ({banners?.length ?? 0})
        </h2>

        {(!banners || banners.length === 0) ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 py-12 text-center text-gray-400 text-sm">
            No banners yet. Create one above.
          </div>
        ) : (
          <div className="space-y-4">
            {banners.map(banner => (
              <BannerListItem key={banner.id} banner={banner} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
