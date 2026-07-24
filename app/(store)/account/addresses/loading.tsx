function AddressSkeleton() {
  return (
    <div className="border rounded-2xl p-5 animate-pulse">
      <div className="flex justify-between items-start gap-4">
        <div className="space-y-2 flex-1">
          <div className="h-4 w-36 bg-gray-200 rounded" />
          <div className="h-3 w-48 bg-gray-200 rounded" />
          <div className="h-3 w-40 bg-gray-200 rounded" />
          <div className="h-3 w-32 bg-gray-200 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-16 bg-gray-200 rounded-lg" />
          <div className="h-8 w-16 bg-gray-200 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

export default function AddressesLoading() {
  return (
    <div>
      <div className="h-8 w-40 bg-gray-200 rounded-lg mb-6 animate-pulse" />
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <AddressSkeleton key={i} />
        ))}
      </div>
      <div className="h-10 w-36 bg-gray-200 rounded-xl mt-4 animate-pulse" />
    </div>
  )
}
