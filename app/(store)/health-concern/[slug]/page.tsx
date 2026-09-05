import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { createPublicClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { MERCHANDISING_LABELS } from '@/lib/utils'

export const revalidate = 3600
export const dynamicParams = true

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}

const PAGE_SIZE = 20

// React cache() deduplicates between generateMetadata + page within same request
const getHealthConcernBySlug = cache(async (slug: string) => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('categories')
    .select('id,name,image_url')
    .eq('slug', slug)
    .eq('taxonomy', 'health_concern')
    .maybeSingle()
  return data
})

// NOTE: deliberately no generateStaticParams here — see the identical note in
// app/(store)/category/[slug]/page.tsx. This page reads searchParams in the same
// render, and combining that with generateStaticParams makes Next.js 16 throw
// DYNAMIC_SERVER_USAGE instead of rendering dynamically per request.

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const concern = await getHealthConcernBySlug(slug)
  if (!concern) return { title: 'Not Found' }
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.leomedpharma.in'
  const title = `${concern.name} Products | Leomed Pharma`
  const description = `Browse products for ${concern.name} at Leomed Pharma.`
  const canonical = `${BASE_URL}/health-concern/${slug}`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title, description, url: canonical, type: 'website', siteName: 'Leomed Pharma',
      ...(concern.image_url && { images: [{ url: concern.image_url, width: 800, height: 400, alt: concern.name }] }),
    },
    twitter: { card: 'summary_large_image', title, description },
  }
}

const getHealthConcernProducts = unstable_cache(
  async (categoryId: string, page: number) => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return { products: [], count: 0 }
    const supabase = createPublicClient()

    const { data: links, count } = await supabase
      .from('product_health_concerns')
      .select('product_id', { count: 'exact' })
      .eq('category_id', categoryId)

    const productIds = (links ?? []).map(l => l.product_id)
    if (productIds.length === 0) return { products: [], count: 0 }

    const offset = (page - 1) * PAGE_SIZE
    const { data: products } = await supabase
      .from('products')
      .select('id,name,slug,images,merchandising_tag')
      .in('id', productIds)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    return { products: products ?? [], count: count ?? 0 }
  },
  ['health-concern-products'],
  { revalidate: 3600, tags: ['categories', 'products'] }
)

export default async function HealthConcernPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { page: pageStr = '1' } = await searchParams
  const page = Math.max(1, parseInt(pageStr))

  const concern = await getHealthConcernBySlug(slug)
  if (!concern) notFound()

  const { products, count } = await getHealthConcernProducts(concern.id, page)
  const totalPages = Math.ceil(count / PAGE_SIZE)

  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.leomedpharma.in'
  const pageUrl = `${BASE_URL}/health-concern/${slug}`
  const combinedJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${pageUrl}#collection`,
        name: `${concern.name} Products — Leomed Pharma`,
        description: `Browse products for ${concern.name} at Leomed Pharma.`,
        url: pageUrl,
        ...(concern.image_url ? { image: concern.image_url } : {}),
        numberOfItems: count,
        publisher: { '@type': 'Organization', name: 'Leomed Pharma', url: BASE_URL },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home',     item: BASE_URL },
          { '@type': 'ListItem', position: 2, name: 'Products', item: `${BASE_URL}/products` },
          { '@type': 'ListItem', position: 3, name: concern.name, item: pageUrl },
        ],
      },
    ],
  }

  return (
    <div className="max-w-350 mx-auto px-4 sm:px-6 lg:px-10 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(combinedJsonLd) }} />
      {concern.image_url && (
        <div className="relative h-32 sm:h-44 rounded-2xl overflow-hidden mb-6 bg-gray-100">
          <Image src={concern.image_url} alt={concern.name} fill className="object-cover" />
          <div className="absolute inset-0 bg-black/40 flex items-center px-5 sm:px-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">{concern.name}</h1>
          </div>
        </div>
      )}
      {!concern.image_url && <h1 className="text-2xl font-bold mb-6">{concern.name}</h1>}

      <p className="text-sm text-gray-500 mb-5">{count} products</p>

      {products.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {products.map((p: any) => {
            const badge = p.merchandising_tag ? MERCHANDISING_LABELS[p.merchandising_tag] : null
            return (
              <div key={p.id} className="group relative">
                <Link href={`/products/${p.slug}`} className="block">
                  <div className="aspect-square bg-gray-100 rounded-xl overflow-hidden mb-2 relative">
                    {p.images?.[0]
                      ? <Image
                          src={p.images[0]} alt={p.name} fill
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                          className="object-cover group-hover:scale-105 transition"
                          placeholder="blur"
                          blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" />
                      : <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300">📦</div>}
                    {badge && (
                      <span className={`absolute bottom-2 left-2 text-white text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.className}`}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium line-clamp-2">{p.name}</p>
                </Link>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-24 text-gray-400">No products tagged for this health concern yet.</div>
      )}

      {totalPages > 1 && (
        <div className="flex flex-wrap justify-center gap-2 mt-10">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <Link key={p} href={`/health-concern/${slug}?page=${p}`}
              className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm font-medium transition
                ${p === page ? 'bg-black text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
