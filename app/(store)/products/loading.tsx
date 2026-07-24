import ProductSkeletonGrid from '@/components/ui/ProductSkeleton'

export default function ProductsLoading() {
  return (
    <div className="max-w-350 mx-auto px-4 sm:px-6 lg:px-10 py-10">
      <div className="h-8 w-40 bg-gray-200 rounded-lg mb-6 animate-pulse" />
      <div className="flex gap-6">
        {/* Sidebar placeholder */}
        <aside className="hidden lg:block w-56 shrink-0 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-5 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </aside>
        <div className="flex-1">
          <div className="h-5 w-28 bg-gray-200 rounded mb-4 animate-pulse" />
          <ProductSkeletonGrid />
        </div>
      </div>
    </div>
  )
}
