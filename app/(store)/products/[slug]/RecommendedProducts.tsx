import Link from 'next/link'
import Image from 'next/image'
import { formatPrice } from '@/lib/utils'
import WishlistButton from '@/components/storefront/WishlistButton'

interface Product {
  id: string
  name: string
  slug: string
  price: number
  compare_price: number | null
  images: string[] | null
}

export default function RecommendedProducts({ products }: { products: Product[] }) {
  if (!products.length) return null

  return (
    <section className="mt-16 border-t border-gray-100 pt-10">
      <h2 className="text-xl font-bold text-gray-900 mb-6">You May Also Like</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {products.map(p => {
          const image = p.images?.[0]
          const discount = p.compare_price
            ? Math.round((1 - p.price / p.compare_price) * 100)
            : 0
          return (
            <div key={p.id} className="group relative">
              <Link href={`/products/${p.slug}`}
                className="block bg-white rounded-2xl overflow-hidden border border-gray-100 hover:border-gray-200 hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
                <div className="aspect-square bg-gray-50 relative overflow-hidden">
                  {image ? (
                    <Image src={image} alt={p.name} fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl">📦</div>
                  )}
                  {discount > 0 && (
                    <span className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      -{discount}%
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-xs font-medium line-clamp-2 mb-1.5 text-gray-800 leading-snug">
                    {p.name}
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-sm text-gray-900">{formatPrice(p.price)}</span>
                    {p.compare_price && (
                      <span className="text-xs text-gray-400 line-through">{formatPrice(p.compare_price)}</span>
                    )}
                  </div>
                </div>
              </Link>
              <WishlistButton productId={p.id} size="sm" className="absolute top-2 right-2 shadow-sm" />
            </div>
          )
        })}
      </div>
    </section>
  )
}
