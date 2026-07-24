'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

interface Category { id: string; name: string; slug: string }

export default function ProductFilters({
  categories,
  currentParams,
}: {
  categories: Category[]
  currentParams: Record<string, string | undefined>
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const update = useCallback((key: string, value: string | null) => {
    const sp = new URLSearchParams(searchParams.toString())
    if (value) sp.set(key, value); else sp.delete(key)
    sp.delete('page')
    router.push(`/products?${sp.toString()}`)
  }, [router, searchParams])

  return (
    <div className="space-y-6 text-sm">
      {/* Categories */}
      <div>
        <h3 className="font-semibold mb-3 text-gray-900">Category</h3>
        <ul className="space-y-1.5">
          <li>
            <button
              onClick={() => update('category', null)}
              className={`w-full text-left px-2 py-1 rounded transition ${!currentParams.category ? 'font-semibold text-black' : 'text-gray-600 hover:text-black'}`}>
              All
            </button>
          </li>
          {categories.map(c => (
            <li key={c.id}>
              <button
                onClick={() => update('category', c.id)}
                className={`w-full text-left px-2 py-1 rounded transition ${currentParams.category === c.id ? 'font-semibold text-black' : 'text-gray-600 hover:text-black'}`}>
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Price range */}
      <div>
        <h3 className="font-semibold mb-3 text-gray-900">Price Range</h3>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            placeholder="Min"
            defaultValue={currentParams.min ?? ''}
            onBlur={e => update('min', e.target.value || null)}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
          />
          <span className="text-gray-400">–</span>
          <input
            type="number"
            placeholder="Max"
            defaultValue={currentParams.max ?? ''}
            onBlur={e => update('max', e.target.value || null)}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* Sale */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={currentParams.sale === 'true'}
            onChange={e => update('sale', e.target.checked ? 'true' : null)}
            className="rounded"
          />
          <span className="font-medium">On Sale</span>
        </label>
      </div>

      {/* Clear */}
      {(currentParams.category || currentParams.min || currentParams.max || currentParams.sale) && (
        <button
          onClick={() => router.push('/products')}
          className="text-xs text-red-500 hover:underline">
          Clear all filters
        </button>
      )}
    </div>
  )
}
