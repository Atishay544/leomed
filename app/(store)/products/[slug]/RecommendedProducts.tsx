import Link from 'next/link'
import Image from 'next/image'
import { Package } from 'lucide-react'

interface Product {
  id: string
  name: string
  slug: string
  images: string[] | null
  mrp?: number | null
  pack_size?: string | null
  unit?: string | null
  composition?: string | null
}

export default function RecommendedProducts({ products }: { products: Product[] }) {
  if (!products.length) return null

  return (
    <section className="mt-16 border-t border-gray-100 pt-10">
      <h2 className="text-xl font-bold text-gray-900 mb-6">You May Also Like</h2>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-6 sm:gap-8">
        {products.map(p => {
          const image = p.images?.[0]
          return (
            <div key={p.id} className="group relative">
              <Link href={`/products/${p.slug}`}
                className="block bg-white rounded-2xl overflow-hidden border border-gray-100 hover:border-gray-200 hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
                <div className="aspect-square bg-gray-50 relative overflow-hidden">
                  {image ? (
                    <Image src={image} alt={p.name} fill
                      sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 16vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <Package size={20} strokeWidth={1.5} />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-xs font-medium line-clamp-2 text-gray-800 leading-snug">
                    {p.name}
                  </p>
                  {(p.pack_size || p.unit) && (
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {[p.pack_size, p.unit].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {p.mrp != null && (
                    <p className="text-[11px] font-semibold text-gray-700 mt-0.5">MRP ₹{Number(p.mrp).toFixed(2)}</p>
                  )}
                  {p.composition && (
                    <p className="text-[10px] text-gray-400 line-clamp-1 mt-0.5">{p.composition}</p>
                  )}
                </div>
              </Link>
            </div>
          )
        })}
      </div>
    </section>
  )
}
