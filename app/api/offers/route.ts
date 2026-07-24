import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/admin'

const getCachedOffers = unstable_cache(
  async () => {
    const supabase = createPublicClient()
    const { data } = await supabase
      .from('offers')
      .select('id, title, description, type, upfront_pct, discount_pct, sort_order')
      .eq('is_active', true)
      .order('sort_order')
    return data ?? []
  },
  ['api-offers'],
  { revalidate: 3600, tags: ['offers'] }
)

export async function GET() {
  const data = await getCachedOffers()
  return NextResponse.json({ data }, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' }
  })
}
