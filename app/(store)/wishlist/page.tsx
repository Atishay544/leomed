import { requireUser } from '@/lib/user-auth'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import Image from 'next/image'
import { formatPrice } from '@/lib/utils'
import WishlistRemoveButton from './WishlistRemoveButton'
import { Heart } from 'lucide-react'

export default async function WishlistPage() {
  const { user, supabase } = await requireUser('/wishlist')

  const { data: wishlist } = await supabase
    .from('wishlist_items')
    .select('id, products(id,name,slug,price,compare_price,images,stock)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-6">My Wishlist</h1>

      {!wishlist || wishlist.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Heart size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg mb-4">Your wishlist is empty</p>
          <Link href="/products" className="inline-block bg-black text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition">
            Browse Products
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {wishlist.map(item => {
            const p = item.products as any
            if (!p) return null
            const discount = p.compare_price ? Math.round((1 - p.price / p.compare_price) * 100) : 0
            return (
              <div key={item.id} className="group relative border rounded-2xl overflow-hidden">
                <WishlistRemoveButton wishlistItemId={item.id} />
                <Link href={`/products/${p.slug}`}>
                  <div className="aspect-square relative bg-gray-100">
                    {p.images?.[0]
                      ? <Image src={p.images[0]} alt={p.name} fill className="object-cover group-hover:scale-105 transition" />
                      : <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300">📦</div>}
                    {discount > 0 && (
                      <span className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        -{discount}%
                      </span>
                    )}
                    {p.stock === 0 && (
                      <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                        <span className="text-sm font-semibold text-gray-500">Out of Stock</span>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium line-clamp-2">{p.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-bold text-sm">{formatPrice(p.price)}</span>
                      {p.compare_price && <span className="text-xs text-gray-400 line-through">{formatPrice(p.compare_price)}</span>}
                    </div>
                  </div>
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
