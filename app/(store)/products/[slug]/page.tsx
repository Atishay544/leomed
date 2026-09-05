import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { Suspense } from 'react'
import { createPublicClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { formatPrice } from '@/lib/utils'
import { Star, Shield, Zap, Truck, Leaf, Award, Users, Package } from 'lucide-react'
import { ProductImageProvider, ConnectedGallery } from './ProductImageProvider'
import ProductActions, { type StoreSku } from './ProductActions'
import ReviewsList from './ReviewsList'
import ReviewForm from './ReviewForm'
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
      .select('*, categories!products_category_id_fkey(name, slug)')
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

// Only what's needed above the fold — fast parallel fetch
const getProductVariants = unstable_cache(
  async (productId: string) => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return []
    const supabase = createPublicClient()
    const { data } = await supabase
      .from('product_variants')
      .select('id, name, options')
      .eq('product_id', productId)
    return (data ?? []).map((v: any) => ({
      id: v.id,
      name: v.name,
      options: Array.isArray(v.options) ? v.options : [],
    }))
  },
  ['product-variants'],
  { revalidate: 3600, tags: ['products'] }
)

const getProductSkus = unstable_cache(
  async (productId: string): Promise<StoreSku[]> => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return []
    const supabase = createPublicClient()
    const { data } = await supabase
      .from('product_skus')
      .select('attributes, stock')
      .eq('product_id', productId)
    return (data ?? []).map((s: any) => ({ attributes: s.attributes as Record<string, string>, stock: Number(s.stock) }))
  },
  ['product-skus'],
  { revalidate: 3600, tags: ['products'] }
)

// ── Social proof display count ───────────────────────────────────────────────
// Deterministic but organic-looking. Seeded by productId + year+month so it
// resets each calendar month and grows day-by-day within the month.
function getDisplaySoldCount(productId: string, realSoldCount: number) {
  const now        = new Date()
  const dayOfMonth = now.getDate()
  const monthSeed  = now.getFullYear() * 100 + (now.getMonth() + 1)

  // FNV-1a hash seeded by product + current month
  let h = 0x811c9dc5 >>> 0
  const seed = `${productId}${monthSeed}`
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }

  const base   = 80  + (h % 300)                          // product base 80–379
  const rate   = 3   + ((h >>> 8)  % 6)                   // daily growth rate 3–8
  const noise  = 5   + ((h >>> 16) % 24)                  // off-round noise 5–28
  const display = Math.max(realSoldCount || 0, base + dayOfMonth * rate + noise)

  // Weekly sub-count: ~15–22% of display + small noise
  const wNoise  = 1 + ((h >>> 24) % 7)
  const weekly  = Math.max(3, Math.round(display * (0.15 + ((h >>> 20) % 8) * 0.01)) + wNoise)

  // Rotate label per product so they don't all say the same thing
  const weekLabel = (['last week', 'this week', 'past 7 days'] as const)[(h >>> 28) % 3]

  return { display, weekly, weekLabel }
}

// ── Streamed fetchers (behind Suspense) ──────────────────────────────────────

const getProductReviews = unstable_cache(
  async (productId: string) => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return []
    const supabase = createPublicClient()
    const { data } = await supabase
      .from('reviews')
      .select('id, rating, comment, created_at, is_verified_purchase, profiles(full_name)')
      .eq('product_id', productId)
      .eq('is_approved', true)
    return data ?? []
  },
  ['product-reviews'],
  { revalidate: 3600, tags: ['reviews'] }
)

const getRecommendedProducts = unstable_cache(
  async (productId: string, categoryId: string | null) => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return []
    const supabase = createPublicClient()
    const { data: fromCategory } = await supabase
      .from('products')
      .select('id, name, slug, price, compare_price, images')
      .eq('is_active', true)
      .eq('category_id', categoryId ?? '')
      .neq('id', productId)
      .order('created_at', { ascending: false })
      .limit(10)

    if (fromCategory && fromCategory.length >= 4) return fromCategory

    const { data: fallback } = await supabase
      .from('products')
      .select('id, name, slug, price, compare_price, images')
      .eq('is_active', true)
      .neq('id', productId)
      .order('created_at', { ascending: false })
      .limit(10)
    return fallback ?? []
  },
  ['recommended-products'],
  { revalidate: 3600, tags: ['products'] }
)

// ── Async streaming sub-components ──────────────────────────────────────────

async function ReviewsSection({ productId }: { productId: string }) {
  const reviews = await getProductReviews(productId)
  const avgRating = reviews.length
    ? reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length
    : 0

  return (
    <div className="mt-16 border-t border-gray-100 pt-10">
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-xl font-bold text-gray-900">Customer Reviews</h2>
        {reviews.length > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="flex">
              {[1, 2, 3, 4, 5].map(s => (
                <Star key={s} size={15}
                  className={s <= Math.round(avgRating) ? 'fill-amber-400 text-amber-400' : 'text-gray-200'} />
              ))}
            </div>
            <span className="text-sm text-gray-500">{avgRating.toFixed(1)} ({reviews.length})</span>
          </div>
        )}
      </div>
      {reviews.length > 0
        ? <ReviewsList reviews={reviews} />
        : <p className="text-sm text-gray-400 mb-8">No reviews yet. Be the first!</p>}
      <ReviewForm productId={productId} />
    </div>
  )
}

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
    ?? `Buy ${product.name} online at Leomed Pharma. Best price ₹${product.price}. Free shipping above ₹499.`
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

  // Only what's needed to render above-the-fold — fast parallel fetch
  const [variants, skus] = await Promise.all([
    getProductVariants(product.id),
    getProductSkus(product.id),
  ])

  const discount = product.compare_price
    ? Math.round((1 - product.price / product.compare_price) * 100)
    : 0

  const videoUrl: string | null = product.video_url ?? null

  const savings = product.compare_price
    ? product.compare_price - product.price
    : 0

  // When SKUs manage stock, total across all combos is the effective stock for the badge
  const totalStock = skus.length > 0
    ? skus.reduce((sum, s) => sum + s.stock, 0)
    : product.stock

  // Find default display option (isDefault flag set by admin ⭐)
  function findDefaultOption() {
    for (const v of variants) {
      for (const o of (Array.isArray(v.options) ? v.options : []) as any[]) {
        if (o?.isDefault && Array.isArray(o.images) && o.images.length > 0)
          return { variantName: v.name, optionValue: o.value as string, images: o.images as string[] }
      }
    }
    // Fallback: first option that has images
    for (const v of variants) {
      for (const o of (Array.isArray(v.options) ? v.options : []) as any[]) {
        if (Array.isArray(o?.images) && o.images.length > 0)
          return { variantName: v.name, optionValue: o.value as string, images: o.images as string[] }
      }
    }
    return null
  }
  const defaultOption = variants.length > 0 ? findDefaultOption() : null

  // Use product images if uploaded; otherwise fall back to default option's images
  const rawImages: string[] = product.images ?? []
  const images: string[] = rawImages.length > 0 ? rawImages : (defaultOption?.images ?? [])
  // Pre-select the default color so gallery + color chip are in sync on load
  const initialSelection: Record<string, string> = defaultOption
    ? { [defaultOption.variantName]: defaultOption.optionValue }
    : {}

  return (
    <div className="max-w-350 mx-auto px-4 sm:px-6 lg:px-10 py-6 md:py-10">
      {/* Structured data — Product + BreadcrumbList */}
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
              sku: product.id,
              brand: { '@type': 'Brand', name: 'Leomed Pharma' },
              offers: {
                '@type': 'Offer',
                url: `${BASE_URL}/products/${product.slug}`,
                priceCurrency: 'INR',
                price: product.price,
                priceValidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                availability: (product.stock ?? 1) > 0
                  ? 'https://schema.org/InStock'
                  : 'https://schema.org/OutOfStock',
                seller: { '@type': 'Organization', name: 'Leomed Pharma' },
                ...(product.compare_price ? {
                  priceSpecification: {
                    '@type': 'UnitPriceSpecification',
                    price: product.price,
                    priceCurrency: 'INR',
                  },
                } : {}),
              },
              ...(product.categories ? {
                category: product.categories.name,
              } : {}),
            },
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}` },
                { '@type': 'ListItem', position: 2, name: 'Products', item: `${BASE_URL}/products` },
                ...(product.categories ? [{
                  '@type': 'ListItem', position: 3,
                  name: product.categories.name,
                  item: `${BASE_URL}/category/${product.categories.slug}`,
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
            <Link href={`/category/${product.categories.slug}`} className="hover:text-gray-700 transition">
              {product.categories.name}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="text-gray-600 truncate max-w-45">{product.name}</span>
      </nav>

      <ProductImageProvider
        defaultImages={images}
        initialImages={defaultOption?.images && defaultOption.images.length > 0 ? defaultOption.images : images}
      >
      <div className="grid md:grid-cols-[1fr_1fr] lg:grid-cols-[45%_1fr] gap-8 lg:gap-14">
        {/* ── LEFT: Gallery — driven by context (switches on color select) ── */}
        <div className="md:sticky md:top-24 md:self-start">
          <ConnectedGallery name={product.name} videoUrl={videoUrl} />
        </div>

        {/* ── RIGHT: Product Info ── */}
        <div className="flex flex-col gap-5">

          {product.categories && (
            <Link href={`/category/${product.categories.slug}`}
              className="text-xs font-semibold uppercase tracking-widest text-gray-400 hover:text-gray-700 transition">
              {product.categories.name}
            </Link>
          )}

          <h1 className="text-2xl lg:text-3xl font-bold leading-snug text-gray-900">
            {product.name}
          </h1>

          {/* Price block */}
          <div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-3xl font-extrabold text-gray-900">{formatPrice(product.price)}</span>
              {product.compare_price && (
                <>
                  <span className="text-lg text-gray-400 line-through">{formatPrice(product.compare_price)}</span>
                  <span className="text-base font-bold text-green-600">{discount}% OFF</span>
                </>
              )}
            </div>
            {savings > 0 && (
              <p className="text-sm text-green-600 font-medium mt-1">You save {formatPrice(savings)}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">inclusive of all taxes</p>
          </div>

          {/* Social proof + stock */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
              totalStock === 0 ? 'bg-red-50 text-red-600'
              : totalStock < 10 ? 'bg-amber-50 text-amber-700'
              : 'bg-green-50 text-green-700'
            }`}>
              {totalStock === 0 ? 'Out of Stock'
                : totalStock < 10 ? `Only ${totalStock} left!`
                : 'In Stock'}
            </span>
            {product.sku && <span className="text-xs text-gray-400">SKU: {product.sku}</span>}
          </div>

          {/* Trust / social proof banner */}
          {(() => {
            const { display, weekly, weekLabel } = getDisplaySoldCount(product.id, product.sold_count ?? 0)
            return (
              <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 rounded-xl px-4 py-2.5">
                <Users size={15} className="text-rose-500 shrink-0" />
                <span className="text-sm font-semibold text-rose-700">
                  Loved by <strong>{display.toLocaleString('en-IN')} shoppers</strong>
                </span>
                <span className="ml-auto text-xs text-rose-500 font-medium whitespace-nowrap">
                  {weekly} bought {weekLabel}
                </span>
              </div>
            )
          })()}

          {/* Variant availability — informational, no purchase action */}
          <ProductActions
            product={{ id: product.id, name: product.name, price: product.price, image: images[0] ?? null, stock: product.stock }}
            variants={variants}
            skus={skus}
            initialSelection={initialSelection}
          />

          {/* Product quality attributes — from metadata.attributes */}
          {(() => {
            const attrs = (product.metadata as any)?.attributes as Record<string, string> | undefined
            if (!attrs || Object.keys(attrs).length === 0) return null
            return (
              <div className="border-t border-gray-100 pt-4">
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(attrs).map(([key, val]) => (
                    <div key={key} className="flex gap-2.5 items-start p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="w-4 h-4 mt-0.5 text-gray-400 shrink-0">
                        {key.toLowerCase().includes('fabric') || key.toLowerCase().includes('material') ? <Leaf size={14} /> : <Package size={14} />}
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{key}</p>
                        <p className="text-xs font-medium text-gray-700 mt-0.5">{val}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Trust badges */}
          <div className="grid grid-cols-3 gap-3 border-t border-gray-100 pt-5">
            <div className="flex flex-col items-center gap-1 text-center p-3 bg-gray-50 rounded-xl">
              <Truck size={18} className="text-gray-500" />
              <span className="text-[11px] font-medium text-gray-600 leading-tight">Free Delivery</span>
            </div>
            <div className="flex flex-col items-center gap-1 text-center p-3 bg-gray-50 rounded-xl">
              <Zap size={18} className="text-gray-500" />
              <span className="text-[11px] font-medium text-gray-600 leading-tight">Same Day Dispatch</span>
            </div>
            <div className="flex flex-col items-center gap-1 text-center p-3 bg-gray-50 rounded-xl">
              <Shield size={18} className="text-gray-500" />
              <span className="text-[11px] font-medium text-gray-600 leading-tight">Secure Pay</span>
            </div>
          </div>

          {/* Delivery timeline */}
          {(() => {
            const today    = new Date()
            const d = (n: number) => {
              const d = new Date(today.getTime() + n * 86400000)
              return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
            }
            return (
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-start gap-0">
                  {[
                    { label: 'Order Placed', date: d(0), done: true },
                    { label: 'Processing', date: d(0), done: false },
                    { label: 'Dispatched', date: d(0), done: false },
                    { label: 'Delivered', date: `${d(1)}–${d(3)}`, done: false },
                  ].map((step, i, arr) => (
                    <div key={step.label} className="flex items-start flex-1">
                      <div className="flex flex-col items-center flex-1">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          step.done ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-500'
                        }`}>
                          {step.done ? '✓' : i + 1}
                        </div>
                        <p className="text-[10px] font-medium text-gray-700 mt-1 text-center leading-tight">{step.label}</p>
                        <p className="text-[9px] text-gray-400 text-center">{step.date}</p>
                      </div>
                      {i < arr.length - 1 && (
                        <div className={`h-0.5 flex-1 mt-2.5 ${step.done ? 'bg-gray-900' : 'bg-gray-200'}`} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Quality + dispatch badge */}
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
            <Award size={16} className="text-emerald-600 shrink-0" />
            <span className="text-xs text-emerald-800 font-medium leading-tight">Genuine, sealed products · Sourced from authorized distributors · Same day dispatch</span>
          </div>

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
      </ProductImageProvider>

      {/* Reviews — streamed after above-the-fold */}
      <Suspense fallback={
        <div className="mt-16 border-t border-gray-100 pt-10">
          <div className="h-7 w-48 bg-gray-100 rounded animate-pulse mb-6" />
          <div className="space-y-4">
            {[1, 2].map(i => <div key={i} className="h-20 bg-gray-50 rounded-xl animate-pulse" />)}
          </div>
        </div>
      }>
        <ReviewsSection productId={product.id} />
      </Suspense>

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
