export default function AccountLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-32 bg-gray-200 rounded-lg mb-6" />
      <div className="bg-white rounded-2xl border p-6 space-y-5">
        <div className="space-y-2">
          <div className="h-3 w-20 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-100 rounded-xl" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-24 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-100 rounded-xl" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-16 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-100 rounded-xl" />
        </div>
        <div className="h-10 w-28 bg-gray-200 rounded-xl" />
      </div>
    </div>
  )
}
