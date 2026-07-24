'use client'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

function getSessionId(): string {
  let id = sessionStorage.getItem('lf_sid')
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem('lf_sid', id)
  }
  return id
}

export default function VisitorTracker() {
  const pathname = usePathname()
  const channelRef = useRef<ReturnType<ReturnType<typeof createBrowserClient>['channel']> | null>(null)
  const sessionId  = useRef<string>('')

  // ── Presence: join once, update page on navigate ────────────────────────────
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return

    const sid = getSessionId()
    sessionId.current = sid

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    const channel = supabase.channel('site-visitors', {
      config: { presence: { key: sid } },
    })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ page: pathname, ts: Date.now() })
      }
    })

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // join once

  // Update presence state when page changes
  useEffect(() => {
    if (channelRef.current && sessionId.current) {
      channelRef.current.track({ page: pathname, ts: Date.now() }).catch(() => {})
    }
  }, [pathname])

  // ── Page view: fire-and-forget on every navigation ──────────────────────────
  useEffect(() => {
    try {
      const sid = sessionId.current || getSessionId()
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, path: pathname, referrer: document.referrer || null }),
      }).catch(() => {})
    } catch { /* silent */ }
  }, [pathname])

  return null
}
