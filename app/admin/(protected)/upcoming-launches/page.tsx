import { requireAdmin } from '@/lib/admin-auth'
import { getAdminUpcomingLaunches } from '@/lib/admin-data'
import LaunchForm from './LaunchForm'
import LaunchListItem from './LaunchListItem'

export const metadata = { title: 'Upcoming Launches' }

export default async function UpcomingLaunchesPage() {
  await requireAdmin()
  const launches = await getAdminUpcomingLaunches()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Upcoming Launches</h1>
        <p className="text-sm text-gray-500 mt-1">Active launches appear at /upcoming-launches on the public site.</p>
      </div>

      <LaunchForm />

      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Existing Launches ({launches?.length ?? 0})
        </h2>
        {(!launches || launches.length === 0) ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 py-12 text-center text-gray-400 text-sm">
            No upcoming launches yet. Create one above.
          </div>
        ) : (
          <div className="space-y-3">
            {launches.map((l: any) => <LaunchListItem key={l.id} launch={l} />)}
          </div>
        )}
      </div>
    </div>
  )
}
