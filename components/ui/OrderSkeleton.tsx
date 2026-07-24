import { Skeleton } from './Skeleton'

function OrderRowSkeleton() {
  return (
    <div className="border rounded-2xl p-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="h-4 w-24 rounded" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-10 rounded" />
          <Skeleton className="h-4 w-20 rounded" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-10 rounded" />
          <Skeleton className="h-4 w-8 rounded" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-10 rounded" />
          <Skeleton className="h-5 w-16 rounded" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </div>
  )
}

export default function OrderSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <OrderRowSkeleton key={i} />
      ))}
    </div>
  )
}
