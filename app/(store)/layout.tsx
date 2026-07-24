import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/admin'
import Header from '@/components/storefront/Header'
import Footer from '@/components/storefront/Footer'
import AnnouncementBar from '@/components/storefront/AnnouncementBar'
import ChatWidgetLoader from '@/components/chat/ChatWidgetLoader'
import VisitorTracker from '@/components/storefront/VisitorTracker'
import WelcomePopup from '@/components/storefront/WelcomePopup'
import { AnimatedGradient } from '@/components/backgrounds/AnimatedGradient'
import { NetworkBackground } from '@/components/backgrounds/NetworkBackground'

// Cached for 60s — categories/announcements rarely change
const getLayoutData = unstable_cache(
  async () => {
    // Guard: skip DB call at build time if env vars are not configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return { topAnnouncement: null, bottomAnnouncement: null, categories: [] }
    }
    const supabase = createPublicClient()
    const now = new Date().toISOString()
    const [{ data: announcements }, { data: categoriesRaw }] = await Promise.all([
      supabase
        .from('announcements')
        .select('id,message,bg_color,text_color,link_url,link_text,is_active,sort_order')
        .eq('is_active', true)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gte.${now}`)
        .order('sort_order', { ascending: true, nullsFirst: true })
        .limit(2),
      supabase
        .from('categories')
        .select('id,name,slug,parent_id,sort_order')
        .order('sort_order'),
    ])
    const categories = (categoriesRaw ?? []) as { id: string; name: string; slug: string; parent_id: string | null; sort_order: number | null }[]
    const sorted = (announcements ?? [])
    return {
      topAnnouncement:    sorted[0] ?? null,
      bottomAnnouncement: sorted[1] ?? null,
      categories,
    }
  },
  ['layout-data-v2'],
  { revalidate: 3600, tags: ['announcements', 'categories'] }
)

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const { topAnnouncement, categories } = await getLayoutData()

  // Build category tree
  const map = new Map<string, any>()
  const roots: any[] = []
  categories.forEach(c => map.set(c.id, { ...c, children: [] }))
  categories.forEach(c => {
    if (c.parent_id) map.get(c.parent_id)?.children.push(map.get(c.id))
    else roots.push(map.get(c.id))
  })

  return (
    <>
      <AnimatedGradient />
      <NetworkBackground />
      <div className="min-h-screen flex flex-col relative z-0">
        <div className="sticky top-0 z-40">
          {topAnnouncement && <AnnouncementBar data={topAnnouncement} />}
          <Header categories={roots} />
        </div>
        <main className="flex-1 overflow-x-clip">{children}</main>
        <Footer categories={roots} />
        <ChatWidgetLoader />
        <VisitorTracker />
        <WelcomePopup />
      </div>
    </>
  )
}
