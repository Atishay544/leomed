'use client'
import { useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import ProductFilters from './ProductFilters'

interface Category { id: string; name: string; slug: string }

export default function MobileFilterDrawer({
  categories,
  currentParams,
}: {
  categories: Category[]
  currentParams: Record<string, string | undefined>
}) {
  const [open, setOpen] = useState(false)
  const activeCount = [currentParams.category, currentParams.min, currentParams.max, currentParams.sale === 'true' ? 'true' : null].filter(Boolean).length

  return (
    <>
      {/* Trigger button — only visible on mobile/tablet */}
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-gray-400 transition"
      >
        <SlidersHorizontal size={14} />
        Filters
        {activeCount > 0 && (
          <span className="ml-0.5 bg-black text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
            {activeCount}
          </span>
        )}
      </button>

      {/* Overlay + Drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative ml-auto w-72 max-w-[85vw] bg-white h-full shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Filters</h2>
              <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500 transition">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <ProductFilters categories={categories} currentParams={currentParams} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
