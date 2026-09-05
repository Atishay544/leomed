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

      {/* Clear */}
      {currentParams.category && (
        <button
          onClick={() => router.push('/products')}
          className="text-xs text-red-500 hover:underline">
          Clear all filters
        </button>
      )}
    </div>
  )
}
