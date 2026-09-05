import Link from 'next/link'
import Image from 'next/image'

interface Product {
  id: string
  name: string
  slug: string
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
                </div>
                <div className="p-3">
                  <p className="text-xs font-medium line-clamp-2 text-gray-800 leading-snug">
                    {p.name}
                  </p>
                </div>
              </Link>
            </div>
          )
        })}
      </div>
    </section>
  )
}
