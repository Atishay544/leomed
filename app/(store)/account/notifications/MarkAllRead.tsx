'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CheckCheck } from 'lucide-react'

export default function MarkAllRead({ userId, hasUnread }: { userId: string; hasUnread: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleMarkAll() {
    setLoading(true)
    const supabase = createClient()
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)
    setLoading(false)
    router.refresh()
  }

  if (!hasUnread) return null

  return (
    <button
      onClick={handleMarkAll}
      disabled={loading}
      className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-black transition disabled:opacity-40"
    >
      <CheckCheck size={16} />
      {loading ? 'Marking…' : 'Mark all read'}
    </button>
  )
}
