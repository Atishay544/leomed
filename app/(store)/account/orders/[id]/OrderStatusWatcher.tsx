'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'

/**
 * Invisible component — subscribes to Supabase Realtime for this order row.
 * When the admin or a webhook updates the order (status, AWB, etc.) the server
 * component is refreshed automatically so the customer sees live status.
 */
export default function OrderStatusWatcher({ orderId }: { orderId: string }) {
  const router              = useRouter()
  const { user, loading }   = useAuth()
  const channelRef  = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  // Only redirect once auth has fully loaded — user is null on first render before check completes
  useEffect(() => {
    if (!loading && user === null) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    const supabase = createClient()

    channelRef.current = supabase
      .channel(`order-status-${orderId}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'orders',
          filter: `id=eq.${orderId}`,
        },
        () => {
          // Re-run the server component to pick up the latest status/AWB
          router.refresh()
        }
      )
      .subscribe()

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [orderId, router])

  return null
}
