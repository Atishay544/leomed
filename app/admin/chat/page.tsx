import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import AdminChatPanel from './AdminChatPanel'

export const metadata = { title: 'Chat Support' }

export default async function AdminChatPage() {
  const { user } = await requireAdmin()
  const supabase = createAdminClient()

  const { data: sessions } = await supabase
    .from('chat_sessions')
    .select('id, user_id, guest_name, guest_email, status, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(100)

  return <AdminChatPanel initialSessions={sessions ?? []} adminId={user.id} />
}
