import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { Suspense } from 'react'
import { createPublicClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ProductGallery from './ProductGallery'
import RecommendedProducts from './RecommendedProducts'

export const revalidate = 3600 // 1h — on-demand invalidation via revalidateTag handles updates
export const dynamicParams = true

// Pre-render ALL active products at build time — no limit
export async function generateStaticParams() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return []
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('products')
    .select('slug')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
  // Filter out invalid slugs — dot slugs create /products/. which Next.js
  // resolves to /products, conflicting with the listing page (build mismatch error)
  return (data ?? [])
    .filter(p => {
      const s = (p.slug ?? '').trim()
      return s.length > 0 && s !== '.' && s !== '..' && !s.includes('/') && !s.startsWith('.')
    })
    .map(p => ({ slug: p.slug }))
}

interface Props { params: Promise<{ slug: string }> }

// ── Cached data fetchers ─────────────────────────────────────────────────────

const getProductBySlug = unstable_cache(
  async (slug: string) => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null
    const supabase = createPublicClient()
    const { data, error } = await supabase
      .from('products')
      .select('id, name, slug, description, composition, images, video_url, category_id, is_active, categories!products_category_id_fkey(name, slug)')
      .eq('slug', slug)
      .maybeSingle()
    if (error) console.error('[product page] product query:', error.message)
    return data
  },
  ['product-by-slug'],
  { revalidate: 3600, tags: ['products'] }
)

// Deduplicates within one request (generateMetadata + page)
const getProduct = cache(getProductBySlug)

// ── Streamed fetchers (behind Suspense) ──────────────────────────────────────

const getRecommendedProducts = unstable_cache(
  async (productId: string, categoryId: string | null) => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return []
    const supabase = createPublicClient()
    const { data: fromCategory } = await supabase
      .from('products')
      .select('id, name, slug, images')
      .eq('is_active', true)
      .eq('category_id', categoryId ?? '')
      .neq('id', productId)
      .order('created_at', { ascending: false })
      .limit(10)

    if (fromCategory && fromCategory.length >= 4) return fromCategory

    const { data: fallback } = await supabase
      .from('products')
      .select('id, name, slug, images')
      .eq('is_active', true)
      .neq('id', productId)
      .order('created_at', { ascending: false })
      .limit(10)
    return fallback ?? []
  },
  ['recommended-products'],
  { revalidate: 3600, tags: ['products'] }
)

async function RecommendedSection({ productId, categoryId }: { productId: string; categoryId: string | null }) {
  const products = await getRecommendedProducts(productId, categoryId)
  return <RecommendedProducts products={products as any[]} />
}

// ── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const product = await getProduct(slug)
  if (!product) return { title: 'Product Not Found' }

  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.leomedpharma.in'
  const title = product.name
  const description = product.description?.slice(0, 160)
    ?? `${product.name} — Leomed Pharma.`
  const image = product.images?.[0]
  const canonical = `${BASE_URL}/products/${slug}`

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
      ...(image && {
        images: [{ url: image, width: 800, height: 800, alt: title }],
      }),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(image && { images: [image] }),
    },
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function ProductDetailPage({ params }: Props) {
  const { slug } = await params
  const product = await getProduct(slug)

  if (!product || product.is_active === false) notFound()

  const images: string[] = product.images ?? []
  const videoUrl: string | null = product.video_url ?? null

  return (
    <div className="max-w-350 mx-auto px-4 sm:px-6 lg:px-10 py-6 md:py-10">
      {/* Structured data — Product + BreadcrumbList (informational only, no offer/price) */}
      {(() => {
        const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.leomedpharma.in'
        const jsonLd = {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Product',
              '@id': `${BASE_URL}/products/${product.slug}#product`,
              name: product.name,
              description: product.description ?? undefined,
              image: images.length > 0 ? images : undefined,
              brand: { '@type': 'Brand', name: 'Leomed Pharma' },
              ...(product.categories ? {
                category: (product.categories as any).name,
              } : {}),
            },
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}` },
                { '@type': 'ListItem', position: 2, name: 'Products', item: `${BASE_URL}/products` },
                ...(product.categories ? [{
                  '@type': 'ListItem', position: 3,
                  name: (product.categories as any).name,
                  item: `${BASE_URL}/category/${(product.categories as any).slug}`,
                }] : []),
                {
                  '@type': 'ListItem',
                  position: product.categories ? 4 : 3,
                  name: product.name,
                  item: `${BASE_URL}/products/${product.slug}`,
                },
              ],
            },
          ],
        }
        return (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
        )
      })()}

      {/* Breadcrumb */}
      <nav className="text-xs text-gray-400 mb-5 flex items-center gap-1.5 flex-wrap">
        <Link href="/" className="hover:text-gray-700 transition">Home</Link>
        <span>/</span>
        {product.categories && (
          <>
            <Link href={`/category/${(product.categories as any).slug}`} className="hover:text-gray-700 transition">
              {(product.categories as any).name}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="text-gray-600 truncate max-w-45">{product.name}</span>
      </nav>

      <div className="grid md:grid-cols-[1fr_1fr] lg:grid-cols-[45%_1fr] gap-8 lg:gap-14">
        {/* ── LEFT: Gallery ── */}
        <div className="md:sticky md:top-24 md:self-start">
          <ProductGallery images={images} name={product.name} videoUrl={videoUrl} />
        </div>

        {/* ── RIGHT: Product Info ── */}
        <div className="flex flex-col gap-5">

          {product.categories && (
            <Link href={`/category/${(product.categories as any).slug}`}
              className="text-xs font-semibold uppercase tracking-widest text-gray-400 hover:text-gray-700 transition">
              {(product.categories as any).name}
            </Link>
          )}

          <h1 className="text-2xl lg:text-3xl font-bold leading-snug text-gray-900">
            {product.name}
          </h1>

          {/* Composition */}
          {product.composition && (
            <div className="border-t border-gray-100 pt-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Composition</h2>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                {product.composition}
              </p>
            </div>
          )}

          {/* Description */}
          {product.description && (
            <div className="border-t border-gray-100 pt-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Product Details</h2>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                {product.description}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Recommended — streamed after above-the-fold */}
      <Suspense fallback={
        <div className="mt-16">
          <div className="h-7 w-56 bg-gray-100 rounded animate-pulse mb-6" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="aspect-square bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        </div>
      }>
        <RecommendedSection productId={product.id} categoryId={product.category_id ?? null} />
      </Suspense>
    </div>
  )
}
