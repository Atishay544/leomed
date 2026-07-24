export default function ProductDetailLoading() {
  return (
    <div className="max-w-350 mx-auto px-4 sm:px-6 lg:px-10 py-6 md:py-10 animate-pulse">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5">
        <div className="h-3 w-10 bg-gray-200 rounded" />
        <div className="h-3 w-2 bg-gray-200 rounded" />
        <div className="h-3 w-20 bg-gray-200 rounded" />
        <div className="h-3 w-2 bg-gray-200 rounded" />
        <div className="h-3 w-32 bg-gray-200 rounded" />
      </div>

      <div className="grid md:grid-cols-[1fr_1fr] lg:grid-cols-[45%_1fr] gap-8 lg:gap-14">
        {/* Gallery skeleton */}
        <div className="space-y-3">
          <div className="aspect-square bg-gray-200 rounded-2xl w-full" />
          <div className="flex gap-2">
            {[1,2,3,4].map(i => <div key={i} className="w-16 h-16 bg-gray-200 rounded-xl" />)}
          </div>
        </div>

        {/* Product info skeleton */}
        <div className="flex flex-col gap-5">
          <div className="h-3 w-24 bg-gray-200 rounded" />
          <div className="space-y-2">
            <div className="h-8 w-4/5 bg-gray-200 rounded" />
            <div className="h-8 w-3/5 bg-gray-200 rounded" />
          </div>
          {/* Price */}
          <div className="flex items-baseline gap-3">
            <div className="h-9 w-32 bg-gray-200 rounded" />
            <div className="h-5 w-20 bg-gray-200 rounded" />
            <div className="h-5 w-16 bg-gray-200 rounded" />
          </div>
          {/* Stock badge */}
          <div className="h-7 w-24 bg-gray-200 rounded-full" />
          {/* Offers */}
          <div className="h-12 bg-gray-100 rounded-xl" />
          {/* Add to cart */}
          <div className="h-14 bg-gray-200 rounded-xl" />
          {/* Trust badges */}
          <div className="grid grid-cols-3 gap-3">
            {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}
          </div>
          {/* Description */}
          <div className="space-y-2 pt-3 border-t border-gray-100">
            <div className="h-4 w-28 bg-gray-200 rounded" />
            <div className="h-3 w-full bg-gray-100 rounded" />
            <div className="h-3 w-4/5 bg-gray-100 rounded" />
            <div className="h-3 w-3/5 bg-gray-100 rounded" />
          </div>
        </div>
      </div>
    </div>
  )
}
