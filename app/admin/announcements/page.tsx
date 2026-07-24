import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import AnnouncementActions from './AnnouncementActions'
import AnnouncementForm from './AnnouncementForm'

export const metadata = { title: 'Announcements' }

export default async function AnnouncementsPage() {
  const supabase = createAdminClient()

  await requireAdmin()

  const { data: announcements } = await supabase
    .from('announcements')
    .select('id, message, bg_color, text_color, is_active, starts_at, ends_at, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>

      {/* Create form — top */}
      <AnnouncementForm />

      {/* List — below */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Existing Announcements ({announcements?.length ?? 0})
        </h2>

        {(!announcements || announcements.length === 0) ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 py-12 text-center text-gray-400 text-sm">
            No announcements yet. Create one above.
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map(ann => (
              <div key={ann.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Preview bar */}
                <div
                  className="px-4 py-3 text-sm font-medium"
                  style={{ backgroundColor: ann.bg_color, color: ann.text_color }}
                >
                  {ann.message}
                </div>
                {/* Meta */}
                <div className="px-4 py-3 flex items-center justify-between gap-4 bg-gray-50">
                  <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-medium ${
                      ann.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {ann.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {ann.starts_at && (
                      <span>
                        From {new Date(ann.starts_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    {ann.ends_at && (
                      <span>
                        Until {new Date(ann.ends_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    <span className="text-gray-400">
                      {new Date(ann.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <AnnouncementActions announcementId={ann.id} isActive={ann.is_active} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
