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
const getCategoryBySlug = cache(async (slug: string) => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('categories')
    .select('id,name,image_url')
    .eq('slug', slug)
    .eq('taxonomy', 'product')
    .maybeSingle()
  return data
})

// NOTE: deliberately no generateStaticParams here. This page reads searchParams
// (page) in the same render, and combining that with generateStaticParams
// makes Next.js 16 throw DYNAMIC_SERVER_USAGE instead of just rendering the page
// dynamically per request — the pre-existing pattern this was copied from. With
// dynamicParams left implicitly true and no static param list, every slug still
// renders fine on demand and is cached per URL via `revalidate` below.

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const category = await getCategoryBySlug(slug)
  if (!category) return { title: 'Category Not Found' }
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.leomedpharma.in'
  const title = `${category.name} | Leomed Pharma`
  const description = `Browse our ${category.name} range at Leomed Pharma.`
  const canonical = `${BASE_URL}/category/${slug}`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website',
      siteName: 'Leomed Pharma',
      ...(category.image_url && {
        images: [{ url: category.image_url, width: 800, height: 400, alt: category.name }],
      }),
    },
    twitter: { card: 'summary_large_image', title, description },
  }
}

const getCategoryProducts = unstable_cache(
  async (categoryId: string, page: number) => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return { products: [], count: 0 }
    const supabase = createPublicClient()
    const offset = (page - 1) * PAGE_SIZE

    const { data: products, count } = await supabase
      .from('products')
      .select('id,name,slug,images,merchandising_tag', { count: 'exact' })
      .eq('category_id', categoryId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    return { products: products ?? [], count: count ?? 0 }
  },
  ['category-products'],
  { revalidate: 3600, tags: ['categories', 'products'] }
)

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { page: pageStr = '1' } = await searchParams
  const page = Math.max(1, parseInt(pageStr))

  const category = await getCategoryBySlug(slug)
  if (!category) notFound()

  const { products, count } = await getCategoryProducts(category.id, page)
  const totalPages = Math.ceil(count / PAGE_SIZE)

  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.leomedpharma.in'
  const categoryUrl = `${BASE_URL}/category/${slug}`
  const combinedJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${categoryUrl}#collection`,
        name: `${category.name} — Leomed Pharma`,
        description: `Browse our ${category.name} range at Leomed Pharma.`,
        url: categoryUrl,
        ...(category.image_url ? { image: category.image_url } : {}),
        numberOfItems: count,
        publisher: { '@type': 'Organization', name: 'Leomed Pharma', url: BASE_URL },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home',     item: BASE_URL },
          { '@type': 'ListItem', position: 2, name: 'Products', item: `${BASE_URL}/products` },
          { '@type': 'ListItem', position: 3, name: category.name, item: categoryUrl },
        ],
      },
    ],
  }

  return (
    <div className="max-w-350 mx-auto px-4 sm:px-6 lg:px-10 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(combinedJsonLd) }} />
      {/* Category header */}
      {category.image_url && (
        <div className="relative h-32 sm:h-44 rounded-2xl overflow-hidden mb-6 bg-gray-100">
          <Image src={category.image_url} alt={category.name} fill className="object-cover" />
          <div className="absolute inset-0 bg-black/40 flex items-center px-5 sm:px-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">{category.name}</h1>
          </div>
        </div>
      )}
      {!category.image_url && <h1 className="text-2xl font-bold mb-6">{category.name}</h1>}

      <p className="text-sm text-gray-500 mb-5">{count} products</p>

      {/* Grid */}
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
        <div className="text-center py-24 text-gray-400">No products in this category yet.</div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-wrap justify-center gap-2 mt-10">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <Link key={p} href={`/category/${slug}?page=${p}`}
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
