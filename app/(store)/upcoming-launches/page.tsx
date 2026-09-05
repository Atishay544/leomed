import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/admin'
import Image from 'next/image'

export const revalidate = 300

export function generateMetadata() {
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.leomedpharma.in'
  return {
    title: 'Upcoming Launches | Leomed Pharma',
    description: 'Products coming soon from Leomed Pharma.',
    alternates: { canonical: `${BASE_URL}/upcoming-launches` },
  }
}

const getActiveLaunches = unstable_cache(
  async () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return []
    const supabase = createPublicClient()
    const { data } = await supabase
      .from('upcoming_launches')
      .select('id,name,description,image_url,expected_date')
      .eq('is_active', true)
      .order('sort_order')
      .order('expected_date', { ascending: true, nullsFirst: false })
    return data ?? []
  },
  ['public-launches-list'],
  { revalidate: 300, tags: ['launches'] }
)

export default async function UpcomingLaunchesPage() {
  const launches = await getActiveLaunches()

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Upcoming Launches</h1>
      <p className="text-gray-500 mb-8">Here&apos;s what&apos;s coming soon from Leomed Pharma.</p>

      {launches.length === 0 ? (
        <p className="text-gray-400 text-center py-20">No upcoming launches announced yet — check back soon.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {launches.map((l: any) => (
            <div key={l.id} className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
              <div className="aspect-video bg-gray-50 relative overflow-hidden">
                {l.image_url ? (
                  <Image src={l.image_url} alt={l.name} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl">🚀</div>
                )}
              </div>
              <div className="p-4">
                {l.expected_date && (
                  <p className="text-xs font-semibold text-emerald-600 mb-1">
                    Coming {new Date(l.expected_date).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                  </p>
                )}
                <h2 className="font-semibold text-gray-900 leading-snug">{l.name}</h2>
                {l.description && <p className="text-sm text-gray-500 mt-1.5 line-clamp-3">{l.description}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
