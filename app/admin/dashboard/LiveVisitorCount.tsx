'use client'
import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

export default function LiveVisitorCount() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    // Same presence channel the storefront VisitorTracker joins.
    const channel = supabase.channel('site-visitors')

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        setCount(Object.keys(state).length)
      })
      .subscribe()

    return () => { channel.unsubscribe() }
  }, [])

  const isActive = count !== null && count > 0

  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isActive ? 'bg-green-400' : 'bg-gray-300'}`} />
        <span className={`relative inline-flex rounded-full h-2 w-2 ${isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
      </span>
      <span className="text-sm font-bold text-gray-800">
        {count === null ? '—' : count}
      </span>
      <span className="text-[10px] text-gray-400">online now</span>
    </div>
  )
}
