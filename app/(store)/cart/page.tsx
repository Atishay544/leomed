'use client'
// Note: cart is client component, metadata set in layout
import { useCartStore } from '@/lib/store/cart'
import Link from 'next/link'
import Image from 'next/image'
import { Trash2, ShoppingBag } from 'lucide-react'
import { formatPrice } from '@/lib/utils'

export default function CartPage() {
  const { items, updateQuantity, removeItem, clearCart, total, getKey } = useCartStore()

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <ShoppingBag size={56} className="mx-auto text-gray-300 mb-4" />
        <h1 className="text-2xl font-bold mb-2">Your cart is empty</h1>
        <p className="text-gray-500 mb-6">Add some products to get started.</p>
        <Link href="/products" className="inline-block bg-black text-white px-6 py-3 rounded-xl font-semibold hover:bg-gray-800 transition">
          Shop Now
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Cart ({items.length})</h1>
        <button onClick={clearCart} className="text-sm text-red-500 hover:underline flex items-center gap-1">
          <Trash2 size={14} /> Clear all
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Items */}
        <div className="lg:col-span-2 space-y-4">
          {items.map(item => (
            <div key={getKey(item)} className="flex gap-4 border rounded-xl p-4">
              <div className="w-20 h-20 shrink-0 relative rounded-lg overflow-hidden bg-gray-100">
                {item.image
                  ? <Image src={item.image} alt={item.name} fill className="object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-2xl">📦</div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{item.name}</p>
                {item.variantLabel && (
                  <p className="text-xs text-gray-500 mt-0.5">{item.variantLabel}</p>
                )}
                <p className="text-sm text-gray-500 mt-0.5">{formatPrice(item.price)} each</p>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                    <button onClick={() => updateQuantity(getKey(item), item.quantity - 1)}
                      className="px-2.5 py-1 hover:bg-gray-100 text-lg">−</button>
                    <span className="px-3 text-sm font-medium">{item.quantity}</span>
                    <button onClick={() => updateQuantity(getKey(item), Math.min(3, item.quantity + 1))}
                      className="px-2.5 py-1 hover:bg-gray-100 text-lg" disabled={item.quantity >= 3}>+</button>
                  </div>
                  <button onClick={() => removeItem(getKey(item))} className="text-gray-400 hover:text-red-500 transition">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold">{formatPrice(item.price * item.quantity)}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="bg-gray-50 rounded-2xl p-6 h-fit">
          <h2 className="font-bold text-lg mb-4">Order Summary</h2>
          <div className="space-y-2 text-sm mb-4">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span>{formatPrice(total())}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Shipping</span>
              <span className="text-green-600 font-medium">Calculated at checkout</span>
            </div>
          </div>
          <div className="border-t pt-3 flex justify-between font-bold text-base mb-5">
            <span>Total</span>
            <span>{formatPrice(total())}</span>
          </div>
          <Link href="/checkout" prefetch={false}
            className="block w-full bg-black text-white text-center py-3.5 rounded-xl font-semibold hover:bg-gray-800 transition">
            Proceed to Checkout
          </Link>
          <Link href="/products" className="block text-center text-sm text-gray-500 mt-3 hover:underline">
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  )
}
