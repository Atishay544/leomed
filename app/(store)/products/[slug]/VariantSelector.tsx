'use client'
import { useProductImages } from './ProductImageProvider'
import type { StoreSku } from './ProductActions'

interface VariantOption {
  value: string
  images: string[]
}

interface Variant {
  id: string
  name: string
  options: unknown[]
}

interface Props {
  variants: Variant[]
  skus: StoreSku[]
  selected: Record<string, string>
  onSelect: (next: Record<string, string>) => void
}

function normalize(o: unknown): VariantOption {
  if (typeof o === 'string') return { value: o, images: [] }
  if (o && typeof o === 'object' && 'value' in o) {
    const opt = o as { value: unknown; images?: unknown }
    return {
      value: String(opt.value),
      images: Array.isArray(opt.images) ? (opt.images as string[]) : [],
    }
  }
  return { value: String(o), images: [] }
}

function skuKey(attrs: Record<string, string>) {
  return Object.entries(attrs)
    .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(([k, v]) => `${k.toLowerCase()}=${v}`)
    .join('|')
}

export default function VariantSelector({ variants, skus, selected, onSelect }: Props) {
  const { defaultImages, setActiveImages } = useProductImages()

  if (!variants || variants.length === 0) return null

  function handleSelect(variantName: string, opt: VariantOption) {
    const isDeselect = selected[variantName] === opt.value
    const next = { ...selected, [variantName]: isDeselect ? '' : opt.value }
    onSelect(next)

    // Switch gallery images if this color option has variant-specific images
    if (opt.images.length > 0) {
      setActiveImages(isDeselect ? defaultImages : opt.images)
    }
  }

  // For a given variant + option, is this combo out of stock based on current selections?
  function isComboOutOfStock(variantName: string, optValue: string): boolean {
    if (skus.length === 0) return false
    // Build the hypothetical full selection if this option were chosen
    const hypothetical: Record<string, string> = { ...selected, [variantName]: optValue }
    const allVariantNames = variants.map(v => v.name)
    // Only check if all variants would be selected
    if (!allVariantNames.every(n => !!hypothetical[n])) return false
    const key = skuKey(hypothetical)
    const sku = skus.find(s => skuKey(s.attributes) === key)
    // Missing SKU (not created in admin) treated same as out-of-stock
    return !sku || sku.stock === 0
  }

  return (
    <div className="space-y-5">
      {variants.map(v => {
        const opts = (Array.isArray(v.options) ? v.options : []).map(normalize)
        return (
          <div key={v.id}>
            <div className="flex items-center gap-1.5 mb-2.5">
              <span className="text-sm font-semibold text-gray-900">{v.name}</span>
              {selected[v.name] && (
                <span className="text-sm text-gray-500">
                  : <span className="font-medium text-gray-700">{selected[v.name]}</span>
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {opts.map(opt => {
                const isActive = selected[v.name] === opt.value
                const outOfStock = isComboOutOfStock(v.name, opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={outOfStock}
                    onClick={() => handleSelect(v.name, opt)}
                    className={`relative min-w-11 px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all duration-150 ${
                      outOfStock
                        ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed line-through'
                        : isActive
                          ? 'border-gray-900 bg-gray-900 text-white shadow-sm'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-500'
                    }`}
                  >
                    {opt.value}
                    {outOfStock && (
                      <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="w-full h-px bg-gray-300 rotate-45 absolute" />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
