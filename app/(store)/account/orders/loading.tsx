export function OrderSkeleton() {
  return (
    <div className="border rounded-2xl p-5 animate-pulse">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-2">
          <div className="h-3 w-16 bg-gray-200 rounded" />
          <div className="h-4 w-24 bg-gray-200 rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-10 bg-gray-200 rounded" />
          <div className="h-4 w-20 bg-gray-200 rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-10 bg-gray-200 rounded" />
          <div className="h-4 w-8 bg-gray-200 rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-10 bg-gray-200 rounded" />
          <div className="h-4 w-20 bg-gray-200 rounded" />
        </div>
        <div className="h-6 w-20 bg-gray-200 rounded-full" />
      </div>
    </div>
  )
}

export default function OrdersLoading() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="h-8 w-32 bg-gray-200 rounded-lg mb-6 animate-pulse" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <OrderSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
