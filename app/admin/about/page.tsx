import { requireAdmin } from '@/lib/admin-auth'
import { getAdminAbout } from '@/lib/admin-data'
import AboutForm from './AboutForm'

export const metadata = { title: 'About Page' }

export default async function AdminAboutPage() {
  await requireAdmin()
  const about = await getAdminAbout()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">About Page</h1>
        <p className="text-sm text-gray-500 mt-1">Edits appear at /about on the public site.</p>
      </div>
      <AboutForm initialTitle={about.title} initialBody={about.body} />
    </div>
  )
}
