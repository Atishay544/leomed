'use client'

import { useEffect, useState, useTransition } from 'react'
import { Loader2, Plus, Search } from 'lucide-react'
import { lookupProducts, type ProductOption } from '@/lib/erp/actions/lookup'

/**
 * Search-and-add product picker.
 *
 * Products are fetched 15 at a time from the server as the MR types. The
 * catalogue is never shipped to the browser to be filtered there — on a phone
 * on a weak connection that is the difference between usable and not.
 */
export default function ProductPicker({
  onPick,
  excludeIds = [],
  placeholder = 'Search products to add…',
}: {
  onPick: (product: ProductOption) => void
  excludeIds?: string[]
  placeholder?: string
}) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<ProductOption[]>([])
  const [open, setOpen] = useState(false)
  const [loading, startSearch] = useTransition()

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      startSearch(async () => setResults(await lookupProducts(term)))
    }, 250)
    return () => clearTimeout(timer)
  }, [term, open])

  const visible = results.filter(p => !excludeIds.includes(p.id))

  return (
    <div className="relative">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
        </span>
        <input
          type="search"
          value={term}
          onChange={e => setTerm(e.target.value)}
          onFocus={() => setOpen(true)}
          // Delayed so a click on a result registers before the list unmounts.
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          placeholder={placeholder}
          aria-label="Search products"
          className="w-full rounded-lg border border-gray-300 py-2.5 pl-9 pr-3 text-base text-gray-900
                     placeholder:text-gray-400 focus:border-emerald-600 focus:ring-2
                     focus:ring-emerald-600/20 focus:outline-none sm:text-[13px]"
        />
      </div>

      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border
                        border-gray-200 bg-white shadow-lg divide-y divide-gray-100">
          {visible.length === 0 ? (
            <p className="px-4 py-5 text-center text-[12.5px] text-gray-500">
              {loading ? 'Searching…' : term ? 'No matching products.' : 'Type to search the product master.'}
            </p>
          ) : (
            visible.map(product => (
              <button
                key={product.id}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onPick(product); setTerm('') }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-emerald-50"
              >
                <Plus size={14} className="shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-gray-900">
                    {product.product_name}
                    {product.strength && <span className="ml-1 text-gray-500">{product.strength}</span>}
                  </p>
                  <p className="truncate text-[11px] text-gray-400">
                    {[product.product_code, product.pack_size].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
