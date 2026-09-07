export default function AdminDashboardLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-10 h-10 border-4 border-gray-200 border-t-black rounded-full animate-spin"
          role="status"
          aria-label="Loading dashboard"
        />
        <p className="text-sm text-gray-500">Loading dashboard...</p>
      </div>
    </div>
  )
}
