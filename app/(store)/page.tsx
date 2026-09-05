import { createPublicClient } from '@/lib/supabase/admin'
import { unstable_cache } from 'next/cache'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import Image from 'next/image'
import { AnimatedGrid, AnimatedItem } from './AnimatedSectionDynamic'
import AnnouncementBar from '@/components/storefront/AnnouncementBar'
import FeaturedCards from '@/components/storefront/FeaturedCards'

const HeroCarousel = dynamic(() => import('./HeroCarousel'), { ssr: true })

export const revalidate = 600

function makeAnnouncementFetcher(sortOrder: number, cacheKey: string) {
  return unstable_cache(
    async () => {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null
      const supabase = createPublicClient()
      const now = new Date().toISOString()
      const { data } = await supabase
        .from('announcements')
        .select('id,message,bg_color,text_color,link_url,link_text,is_active,sort_order')
        .eq('is_active', true)
        .eq('sort_order', sortOrder)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gte.${now}`)
        .limit(1)
        .maybeSingle()
      return data ?? null
    },
    [cacheKey],
    { revalidate: 3600, tags: ['announcements'] }
  )
}

const getBottomAnnouncement          = makeAnnouncementFetcher(1, 'bottom-announcement')
const getAfterFeaturedAnnouncement   = makeAnnouncementFetcher(2, 'after-featured-announcement')

const getStaticHomeData = unstable_cache(
  async () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return { banners: [], categories: [], healthConcerns: [] }
    }
    const supabase = createPublicClient()
    const [{ data: bannersRaw }, { data: categoriesRaw }, { data: healthConcernsRaw }] = await Promise.all([
      supabase
        .from('banners')
        .select('id,title,subtitle,image_url,link_url,link_text,bg_color,text_color,sort_order,display_style')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('categories')
        .select('id,name,slug,image_url,accent_color')
        .is('parent_id', null)
        .eq('taxonomy', 'product')
        .order('sort_order')
        .limit(8),
      supabase
        .from('categories')
        .select('id,name,slug,image_url,accent_color')
        .eq('taxonomy', 'health_concern')
        .order('sort_order')
        .limit(8),
    ])
    type Banner = { id: string; title: string | null; subtitle: string | null; image_url: string | null; link_url: string | null; link_text: string | null; bg_color: string | null; text_color: string | null; sort_order: number | null; display_style: string | null }
    type Category = { id: string; name: string; slug: string; image_url: string | null; accent_color: string | null }
    const banners = (bannersRaw ?? []) as Banner[]
    const categories = (categoriesRaw ?? []) as Category[]
    const healthConcerns = (healthConcernsRaw ?? []) as Category[]
    return { banners, categories, healthConcerns }
  },
  ['home-static'],
  { revalidate: 600, tags: ['banners', 'categories'] }
)

type CategoryProduct = { id: string; name: string; slug: string; images: string[] | null; composition: string | null; description: string | null; category_id: string | null }

const PRODUCTS_PER_CATEGORY = 4

// One section per category, each showing that category's own products —
// not a generic "featured" grid. Categories with no active products yet
// are simply skipped (no empty section).
const getCategoryProducts = unstable_cache(
  async (categoryIds: string[]): Promise<Record<string, CategoryProduct[]>> => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || categoryIds.length === 0) {
      return {}
    }
    const supabase = createPublicClient()
    const { data } = await supabase
      .from('products')
      .select('id,name,slug,images,composition,description,category_id')
      .eq('is_active', true)
      .in('category_id', categoryIds)
      .order('created_at', { ascending: false })

    const byCategory: Record<string, CategoryProduct[]> = {}
    for (const p of (data ?? []) as CategoryProduct[]) {
      if (!p.category_id) continue
      const bucket = byCategory[p.category_id] ?? (byCategory[p.category_id] = [])
      if (bucket.length < PRODUCTS_PER_CATEGORY) bucket.push(p)
    }
    return byCategory
  },
  ['home-category-products'],
  { revalidate: 600, tags: ['products'] }
)

export default async function HomePage() {
  const { banners, categories, healthConcerns } = await getStaticHomeData()
  const [categoryProducts, bottomAnnouncement, afterFeaturedAnnouncement] = await Promise.all([
    getCategoryProducts(categories.map(c => c.id)),
    getBottomAnnouncement(),
    getAfterFeaturedAnnouncement(),
  ])

  // Position model: promo cards are matched by style; hero/deals by sort_order.
  // Exclude featured_card from hero/deals so a promo card never leaks into them.
  const heroSlides    = banners.filter(b => b.display_style !== 'featured_card' && b.sort_order === 0)
  const featuredCards = banners.filter(b => b.display_style === 'featured_card')

  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.leomedpharma.in'
  const homeJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${BASE_URL}/#webpage`,
        url: BASE_URL,
        name: 'Leomed Pharma — OTC Medicines & Wellness Products',
        description: 'Browse OTC medicines, health devices, personal care, and wellness products from Leomed Pharma. Available through our distributor network.',
        isPartOf: { '@id': `${BASE_URL}/#website` },
        about: { '@id': `${BASE_URL}/#organization` },
        inLanguage: 'en-IN',
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'What is Leomed Pharma?',
            acceptedAnswer: { '@type': 'Answer', text: 'Leomed Pharma is an Indian pharmaceutical company offering OTC medicines, health devices, personal care, and wellness products through a distributor network across India.' },
          },
        ],
      },
    ],
  }

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd) }} />
      {/* ── Hero Carousel — full bleed ── */}
      <HeroCarousel banners={heroSlides} />

      {/* ── Categories, each with its own products ── */}
      {categories.map(cat => {
        const products = categoryProducts[cat.id]
        if (!products || products.length === 0) return null
        return (
          <section key={cat.id} className="max-w-350 mx-auto px-4 sm:px-6 lg:px-10 py-10">
            <SectionHeader title={cat.name} href={`/category/${cat.slug}`} linkLabel="View all →" />
            <AnimatedGrid className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 mt-6">
              {products.map(p => (
                <AnimatedItem key={p.id}>
                  <CategoryProductCard product={p} />
                </AnimatedItem>
              ))}
            </AnimatedGrid>
          </section>
        )
      })}

      {/* ── Health Concerns ── */}
      {healthConcerns && healthConcerns.length > 0 && (
        <section className="max-w-350 mx-auto px-4 sm:px-6 lg:px-10 pb-14">
          <SectionHeader title="Browse by Health Concern" />
          <AnimatedGrid className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-5 sm:gap-6 mt-7">
            {healthConcerns.map(hc => (
              <AnimatedItem key={hc.id}>
                <Link
                  href={`/health-concern/${hc.slug}`}
                  className="group relative flex flex-col items-center justify-end aspect-square rounded-2xl overflow-hidden hover:-translate-y-1 hover:shadow-lg transition-all duration-300"
                  style={{ backgroundColor: hc.accent_color ?? '#e8f3ec' }}
                >
                  {hc.image_url && (
                    <Image src={hc.image_url} alt={hc.name} fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 12vw"
                      className="object-cover object-bottom opacity-90 group-hover:scale-105 transition-transform duration-300" />
                  )}
                  <span className="relative z-10 w-full text-center text-xs font-bold text-white py-2 bg-black/25 backdrop-blur-[1px]">
                    {hc.name}
                  </span>
                </Link>
              </AnimatedItem>
            ))}
          </AnimatedGrid>
        </section>
      )}

      {/* ── Bottom Announcement (sort 1) — below category section ── */}
      {bottomAnnouncement && <AnnouncementBar data={bottomAnnouncement} />}

      {/* ── For Him / For Her promo cards (admin-managed) ── */}
      {featuredCards.length > 0 && <FeaturedCards cards={featuredCards} />}

      {/* ── Announcement — below category sections (sort 2) ── */}
      {afterFeaturedAnnouncement && <AnnouncementBar data={afterFeaturedAnnouncement} />}
    </div>
  )
}

// ── Section Header ─────────────────────────────────────────────────────────────
function SectionHeader({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">{title}</h2>
      {href && linkLabel && (
        <Link href={href}
          className="text-sm font-medium text-gray-500 hover:text-emerald-600 transition-colors duration-200">
          {linkLabel}
        </Link>
      )}
    </div>
  )
}

// ── Category Product Card — image, name, composition, description ──────────────
function CategoryProductCard({ product }: { product: CategoryProduct }) {
  const image = product.images?.[0]

  return (
    <div className="group relative bg-white rounded-2xl overflow-hidden border border-gray-100 hover:border-gray-200 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-gray-200/60 transition-all duration-300 h-full">
      <Link href={`/products/${product.slug}`} className="block">
        <div className="aspect-square bg-gray-50 relative overflow-hidden">
          {image ? (
            <Image
              src={image}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300 text-5xl">📦</div>
          )}
        </div>
        <div className="p-3.5 space-y-1">
          <p className="text-sm font-semibold line-clamp-2 text-gray-900 group-hover:text-emerald-700 transition-colors leading-snug">
            {product.name}
          </p>
          {product.composition && (
            <p className="text-xs text-gray-500 line-clamp-2">{product.composition}</p>
          )}
          {product.description && (
            <p className="text-xs text-gray-400 line-clamp-2">{product.description}</p>
          )}
        </div>
      </Link>
    </div>
  )
}
