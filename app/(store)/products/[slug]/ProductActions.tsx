'use client'
import { useState, useMemo } from 'react'
import VariantSelector from './VariantSelector'
import AddToCartButton from './AddToCartButton'
import ProductOffers from './ProductOffers'

export interface StoreSku {
  attributes: Record<string, string>
  stock: number
}

interface Offer { id: string; type: string; upfront_pct: number; discount_pct: number }

interface Props {
  product: { id: string; name: string; price: number; image: string | null; stock: number }
  variants: { id: string; name: string; options: unknown[] }[]
  skus: StoreSku[]
  initialOffers: Offer[]
  initialSelection?: Record<string, string>
}

function skuKey(attrs: Record<string, string>) {
  return Object.entries(attrs)
    .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(([k, v]) => `${k.toLowerCase()}=${v}`)
    .join('|')
}

export default function ProductActions({ product, variants, skus, initialOffers, initialSelection }: Props) {
  const [selected, setSelected] = useState<Record<string, string>>(initialSelection ?? {})

  const variantNames = variants.map(v => v.name)
  const allSelected = variantNames.length > 0 && variantNames.every(n => !!selected[n])

  // Find the matching SKU only when all variants are chosen
  const matchedSku = useMemo(() => {
    if (!allSelected || skus.length === 0) return null
    const key = skuKey(selected)
    return skus.find(s => skuKey(s.attributes) === key) ?? null
  }, [selected, skus, allSelected])

  // Effective stock: matched SKU stock if variants exist + SKUs defined, else product.stock
  const effectiveStock = useMemo(() => {
    if (skus.length === 0) return product.stock          // no SKUs set — use product total
    if (!allSelected) return 1                           // not all chosen yet — don't block button on product stock
    return matchedSku?.stock ?? 0                        // show combo stock (0 if not found)
  }, [skus, allSelected, matchedSku, product.stock])

  // Unselected variant names for the prompt
  const unselectedVariants = variantNames.filter(n => !selected[n])

  return (
    <>
      {variants.length > 0 && (
        <div className="border-t border-gray-100 pt-5">
          <VariantSelector
            variants={variants}
            skus={skus}
            selected={selected}
            onSelect={setSelected}
          />
        </div>
      )}

      {initialOffers.length > 0 && (
        <div className="border-t border-gray-100 pt-5">
          <ProductOffers price={product.price} initialOffers={initialOffers} />
        </div>
      )}

      <div className="border-t border-gray-100 pt-5 space-y-2">
        {variants.length > 0 && !allSelected && (
          <p className="text-sm text-red-500 font-medium">
            Please select {unselectedVariants.join(' & ')} before adding to cart
          </p>
        )}
        <AddToCartButton
          product={{ ...product, stock: effectiveStock }}
          variantAttributes={allSelected ? selected : undefined}
          skuLabel={allSelected && variants.length > 0
            ? variantNames.map(n => selected[n]).join(' / ')
            : undefined}
          requiresSelection={variants.length > 0 && !allSelected}
        />
      </div>
    </>
  )
}
