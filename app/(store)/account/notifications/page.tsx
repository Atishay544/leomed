import { requireUser } from '@/lib/user-auth'
import { formatDistanceToNow } from 'date-fns'
import { Bell } from 'lucide-react'
import MarkAllRead from './MarkAllRead'

export default async function NotificationsPage() {
  const { user, supabase } = await requireUser('/account/notifications')

  const { data: notifications } = await supabase
    .from('notifications')
    .select('id,title,message,is_read,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const hasUnread = (notifications ?? []).some(n => !n.is_read)

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <MarkAllRead userId={user.id} hasUnread={hasUnread} />
      </div>

      {!notifications || notifications.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Bell size={44} className="mx-auto mb-3 opacity-30" />
          <p className="text-base">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <div
              key={n.id}
              className={`rounded-2xl border px-5 py-4 transition ${
                n.is_read ? 'bg-white text-gray-500' : 'bg-white border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5 flex-1 min-w-0">
                  <p className={`text-sm ${n.is_read ? 'font-normal text-gray-600' : 'font-semibold text-gray-900'}`}>
                    {n.title}
                  </p>
                  <p className={`text-sm ${n.is_read ? 'text-gray-400' : 'text-gray-600'}`}>
                    {n.message}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </span>
                  {!n.is_read && (
                    <span className="w-2 h-2 rounded-full bg-black inline-block" aria-label="Unread" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
