'use client'
import { useState, useMemo } from 'react'
import VariantSelector from './VariantSelector'

export interface StoreSku {
  attributes: Record<string, string>
  stock: number
}

interface Props {
  product: { id: string; name: string; price: number; image: string | null; stock: number }
  variants: { id: string; name: string; options: unknown[] }[]
  skus: StoreSku[]
  initialSelection?: Record<string, string>
}

function skuKey(attrs: Record<string, string>) {
  return Object.entries(attrs)
    .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(([k, v]) => `${k.toLowerCase()}=${v}`)
    .join('|')
}

// Informational only — the storefront is browse-only, so this shows which
// variants exist and whether the selected combination is in stock, without
// any purchase action (add-to-cart / buy were removed along with checkout).
export default function ProductActions({ product, variants, skus, initialSelection }: Props) {
  const [selected, setSelected] = useState<Record<string, string>>(initialSelection ?? {})

  const variantNames = variants.map(v => v.name)
  const allSelected = variantNames.length > 0 && variantNames.every(n => !!selected[n])

  const matchedSku = useMemo(() => {
    if (!allSelected || skus.length === 0) return null
    const key = skuKey(selected)
    return skus.find(s => skuKey(s.attributes) === key) ?? null
  }, [selected, skus, allSelected])

  const effectiveStock = useMemo(() => {
    if (skus.length === 0) return product.stock
    if (!allSelected) return 1
    return matchedSku?.stock ?? 0
  }, [skus, allSelected, matchedSku, product.stock])

  const unselectedVariants = variantNames.filter(n => !selected[n])

  if (variants.length === 0) return null

  return (
    <div className="border-t border-gray-100 pt-5 space-y-3">
      <VariantSelector
        variants={variants}
        skus={skus}
        selected={selected}
        onSelect={setSelected}
      />

      {!allSelected ? (
        <p className="text-sm text-gray-500">
          Select {unselectedVariants.join(' & ')} to see availability.
        </p>
      ) : (
        <p className={`text-sm font-medium ${effectiveStock > 0 ? 'text-emerald-700' : 'text-red-500'}`}>
          {effectiveStock > 0 ? 'In stock' : 'Out of stock'}
        </p>
      )}
    </div>
  )
}
