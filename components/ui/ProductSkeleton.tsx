import { Skeleton } from './Skeleton'

export function ProductSkeleton() {
  return (
    <div className="border rounded-2xl overflow-hidden">
      {/* Image */}
      <Skeleton className="w-full aspect-square rounded-none" />
      {/* Content */}
      <div className="p-4 space-y-2">
        <Skeleton className="h-4 w-3/4 rounded-lg" />
        <Skeleton className="h-3 w-1/2 rounded-lg" />
        <Skeleton className="h-5 w-1/3 rounded-lg mt-1" />
      </div>
    </div>
  )
}

export default function ProductSkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <ProductSkeleton key={i} />
      ))}
    </div>
  )
}
