import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import Image from 'next/image'
import { formatPrice } from '@/lib/utils'
import { Search } from 'lucide-react'
import SearchInput from './SearchInput'
import WishlistButton from '@/components/storefront/WishlistButton'

interface Props { searchParams: Promise<{ q?: string }> }

export async function generateMetadata({ searchParams }: Props) {
  const { q = '' } = await searchParams
  return {
    title: q ? `Search: ${q}` : 'Search',
    description: q ? `Search results for "${q}"` : 'Search our store',
  }
}

const getSearchResults = unstable_cache(
  async (term: string) => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return { products: [], categories: [] }
    const supabase = createPublicClient()
    const [{ data: prods }, { data: cats }] = await Promise.all([
      supabase
        .from('products')
        .select('id,name,slug,price,compare_price,images')
        .eq('is_active', true)
        .ilike('name', `%${term}%`)
        .limit(24),
      supabase
        .from('categories')
        .select('id,name,slug,image_url')
        .ilike('name', `%${term}%`)
        .limit(6),
    ])
    return { products: prods ?? [], categories: cats ?? [] }
  },
  ['search-results'],
  { revalidate: 120, tags: ['products', 'categories'] }
)

export default async function SearchPage({ searchParams }: Props) {
  const { q = '' } = await searchParams
  const term = q.trim()

  let products: any[] = []
  let categories: any[] = []

  if (term.length >= 2) {
    const results = await getSearchResults(term)
    products = results.products
    categories = results.categories
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Search bar */}
      <div className="mb-8">
        <SearchInput defaultValue={term} />
      </div>

      {!term && (
        <div className="text-center py-20 text-gray-400">
          <Search size={40} className="mx-auto mb-3 opacity-30" />
          <p>Start typing to search products…</p>
        </div>
      )}

      {term && products.length === 0 && categories.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg mb-2">No results for &quot;{term}&quot;</p>
          <Link href="/products" className="text-sm underline text-gray-600">Browse all products</Link>
        </div>
      )}

      {categories.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Categories</h2>
          <div className="flex flex-wrap gap-3">
            {categories.map((c: any) => (
              <Link key={c.id} href={`/category/${c.slug}`}
                className="flex items-center gap-2 border border-gray-200 rounded-full px-4 py-2 text-sm hover:border-black transition">
                {c.image_url && (
                  <Image src={c.image_url} alt={c.name} width={20} height={20} className="rounded-full object-cover" />
                )}
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {products.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">
            Products <span className="text-gray-400 font-normal text-sm">({products.length})</span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {products.map((p: any) => {
              const discount = p.compare_price ? Math.round((1 - p.price / p.compare_price) * 100) : 0
              return (
                <div key={p.id} className="group relative">
                  <Link href={`/products/${p.slug}`} className="block">
                    <div className="aspect-square bg-gray-100 rounded-xl overflow-hidden mb-2 relative">
                      {p.images?.[0]
                        ? <Image src={p.images[0]} alt={p.name} fill
                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                            className="object-cover group-hover:scale-105 transition"
                            placeholder="blur"
                            blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" />
                        : <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300">📦</div>}
                      {discount > 0 && (
                        <span className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                          -{discount}%
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium line-clamp-2">{p.name}</p>
                    <p className="text-sm font-bold mt-0.5">{formatPrice(p.price)}</p>
                  </Link>
                  <WishlistButton productId={p.id} size="sm" className="absolute top-2 right-2 shadow-sm" />
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
