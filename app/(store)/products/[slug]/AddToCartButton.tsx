'use client'
import { useState } from 'react'
import { ShoppingCart, Check, AlertCircle } from 'lucide-react'
import { useCartStore } from '@/lib/store/cart'

interface Product { id: string; name: string; price: number; image: string | null; stock: number }

interface Props {
  product: Product
  variantAttributes?: Record<string, string>
  skuLabel?: string
  requiresSelection?: boolean
}

export default function AddToCartButton({ product, variantAttributes, skuLabel, requiresSelection }: Props) {
  const addItem = useCartStore(s => s.addItem)
  const [added, setAdded] = useState(false)
  const [qty, setQty]     = useState(1)

  const outOfStock = product.stock === 0

  function handleAdd() {
    if (requiresSelection) return
    addItem({
      id:                product.id,
      name:              product.name,
      price:             product.price,
      image:             product.image ?? '',
      quantity:          qty,
      variantAttributes: variantAttributes ?? null,
      variantLabel:      skuLabel ?? null,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  if (outOfStock) {
    return (
      <button disabled className="w-full py-3 rounded-xl bg-gray-200 text-gray-400 font-semibold cursor-not-allowed flex items-center justify-center gap-2">
        <AlertCircle size={16} />
        {variantAttributes ? 'This combination is out of stock' : 'Out of Stock'}
      </button>
    )
  }

  // Variant exists but none selected — show button only, no qty stepper
  if (requiresSelection) {
    return (
      <button
        onClick={handleAdd}
        className="w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 bg-black text-white hover:bg-gray-800 transition-all"
      >
        <ShoppingCart size={18} /> Add to Cart
      </button>
    )
  }

  return (
    <div className="space-y-3">
      {skuLabel && (
        <p className="text-xs text-gray-500">
          Selected: <span className="font-semibold text-gray-800">{skuLabel}</span>
        </p>
      )}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600">Qty:</span>
        <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
          <button onClick={() => setQty(q => Math.max(1, q - 1))} className="px-3 py-1.5 hover:bg-gray-100 transition text-lg">−</button>
          <span className="px-4 py-1.5 text-sm font-medium">{qty}</span>
          <button onClick={() => setQty(q => Math.min(3, product.stock, q + 1))} className="px-3 py-1.5 hover:bg-gray-100 transition text-lg">+</button>
        </div>
      </div>
      <button
        onClick={handleAdd}
        className={`w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all
          ${added ? 'bg-green-600 text-white' : 'bg-black text-white hover:bg-gray-800'}`}
      >
        {added ? <><Check size={18} /> Added!</> : <><ShoppingCart size={18} /> Add to Cart</>}
      </button>
    </div>
  )
}
