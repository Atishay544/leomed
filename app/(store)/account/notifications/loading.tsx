function NotificationSkeleton() {
  return (
    <div className="rounded-2xl border px-5 py-4 animate-pulse">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 flex-1">
          <div className="h-4 w-48 bg-gray-200 rounded" />
          <div className="h-3 w-64 bg-gray-200 rounded" />
        </div>
        <div className="h-3 w-16 bg-gray-200 rounded shrink-0" />
      </div>
    </div>
  )
}

export default function NotificationsLoading() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-36 bg-gray-200 rounded-lg animate-pulse" />
        <div className="h-9 w-28 bg-gray-200 rounded-lg animate-pulse" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <NotificationSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
