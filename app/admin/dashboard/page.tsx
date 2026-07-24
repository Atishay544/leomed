import { requireAdmin } from '@/lib/admin-auth'
import { getAdminDashboard } from '@/lib/admin-data'
import DashboardChart from './DashboardChart'
import LiveVisitorCount from './LiveVisitorCount'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  await requireAdmin()
  const props = await getAdminDashboard()

  return (
    <div className="max-w-7xl mx-auto">
      <DashboardChart {...props} liveVisitorSlot={<LiveVisitorCount />} />
    </div>
  )
}
