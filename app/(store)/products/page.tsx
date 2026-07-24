import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import Image from 'next/image'
import { formatPrice } from '@/lib/utils'
import ProductFilters from './ProductFilters'
import MobileFilterDrawer from './MobileFilterDrawer'
import SortSelect from './SortSelect'
import ProductSkeletonGrid from '@/components/ui/ProductSkeleton'
import WishlistButton from '@/components/storefront/WishlistButton'

export const revalidate = 30

export async function generateMetadata() {
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.leomedpharma.in'
  return {
    title: 'All Products | Leomed Pharma',
    description: 'Browse our full range of OTC medicines, health devices, and wellness products. Fast pan-India delivery.',
    alternates: { canonical: `${BASE_URL}/products` },
    openGraph: {
      title: 'All Products — Leomed Pharma',
      description: 'Browse OTC medicines, health devices, and wellness products. Fast pan-India delivery.',
      url: `${BASE_URL}/products`,
      type: 'website',
      siteName: 'Leomed Pharma',
    },
  }
}

interface FilterParams {
  category?: string
  sort?: string
  min?: string
  max?: string
  sale?: string
  page?: string
}

interface Props { searchParams: Promise<FilterParams> }

const PAGE_SIZE = 20

const getProductsPage = unstable_cache(
  async (params: FilterParams) => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return { products: [], count: 0, categories: [] }
    const supabase = createPublicClient()
    const page = Math.max(1, parseInt(params.page ?? '1'))
    const offset = (page - 1) * PAGE_SIZE
    const sort = params.sort ?? 'newest'

    let query = supabase
      .from('products')
      .select('id,name,slug,price,compare_price,images,categories(name,slug)', { count: 'exact' })
      .eq('is_active', true)
      .range(offset, offset + PAGE_SIZE - 1)

    if (params.category) query = query.eq('category_id', params.category)
    if (params.sale === 'true') query = query.not('compare_price', 'is', null)
    if (params.min) query = query.gte('price', parseFloat(params.min))
    if (params.max) query = query.lte('price', parseFloat(params.max))

    if (sort === 'newest')           query = query.order('created_at', { ascending: false })
    else if (sort === 'price_asc')   query = query.order('price', { ascending: true })
    else if (sort === 'price_desc')  query = query.order('price', { ascending: false })
    else if (sort === 'popular')     query = query.order('stock', { ascending: false })

    const [{ data: products, count }, { data: categories }] = await Promise.all([
      query,
      supabase.from('categories').select('id,name,slug').is('parent_id', null).order('sort_order'),
    ])

    return { products: products ?? [], count: count ?? 0, categories: categories ?? [] }
  },
  ['products-page'],
  { revalidate: 30, tags: ['products', 'categories'] }
)

export default async function ProductsPage({ searchParams }: Props) {
  const params = await searchParams
  const { products, count, categories } = await getProductsPage(params)
  const page = Math.max(1, parseInt(params.page ?? '1'))
  const totalPages = Math.ceil(count / PAGE_SIZE)
  const sort = params.sort ?? 'newest'

  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.leomedpharma.in'
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'All Products — Leomed Pharma',
    url: `${BASE_URL}/products`,
    numberOfItems: count,
    itemListElement: (products as any[]).slice(0, 20).map((p: any, i: number) => ({
      '@type': 'ListItem',
      position: (page - 1) * PAGE_SIZE + i + 1,
      url: `${BASE_URL}/products/${p.slug}`,
      name: p.name,
    })),
  }

  return (
    <div className="max-w-350 mx-auto px-4 sm:px-6 lg:px-10 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      <h1 className="text-2xl font-bold mb-6">All Products</h1>

      <div className="flex gap-6">
        {/* Sidebar filters — desktop only */}
        <aside className="hidden lg:block w-56 shrink-0">
          <ProductFilters categories={categories} currentParams={params} />
        </aside>

        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4 gap-3">
            <div className="flex items-center gap-2">
              {/* Mobile filter button */}
              <MobileFilterDrawer categories={categories} currentParams={params} />
              <p className="text-sm text-gray-500">{count} products</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm text-gray-600 hidden sm:inline">Sort:</span>
              <SortSelect current={sort} />
            </div>
          </div>

          {/* Grid */}
          {products.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map((p: any) => <ProductCard key={p.id} product={p} />)}
            </div>
          ) : (
            <div className="text-center py-24 text-gray-400">
              <p className="text-xl mb-2">No products found</p>
              <Link href="/products" className="text-sm underline">Clear filters</Link>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-wrap justify-center gap-2 mt-10">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <PaginationLink key={p} page={p} current={page} params={params} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ProductCard({ product }: { product: any }) {
  const image = product.images?.[0]
  const discount = product.compare_price
    ? Math.round((1 - product.price / product.compare_price) * 100) : 0

  return (
    <div className="group relative">
      <Link href={`/products/${product.slug}`} className="block">
        <div className="aspect-square bg-gray-100 rounded-xl overflow-hidden mb-3 relative">
          {image
            ? <Image src={image} alt={product.name} fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-cover group-hover:scale-105 transition"
                placeholder="blur"
                blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" />
            : <div className="w-full h-full flex items-center justify-center text-gray-400 text-4xl">📦</div>
          }
          {discount > 0 && (
            <span className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              -{discount}%
            </span>
          )}
        </div>
        <p className="text-sm font-medium line-clamp-2 mb-1">{product.name}</p>
        <div className="flex items-center gap-2">
          <span className="font-bold">{formatPrice(product.price)}</span>
          {product.compare_price && (
            <span className="text-sm text-gray-400 line-through">{formatPrice(product.compare_price)}</span>
          )}
        </div>
      </Link>
      <WishlistButton productId={product.id} size="sm" className="absolute top-2 right-2 shadow-sm" />
    </div>
  )
}

function PaginationLink({ page, current, params }: { page: number; current: number; params: Record<string, string | undefined> }) {
  const sp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => v && sp.set(k, v))
  sp.set('page', String(page))
  return (
    <Link href={`/products?${sp.toString()}`}
      className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm font-medium transition
        ${page === current ? 'bg-black text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
      {page}
    </Link>
  )
}
