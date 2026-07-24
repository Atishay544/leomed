import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Limits per named route
const LIMITS: Record<string, { max: number; windowMs: number }> = {
  checkout: { max: 10,  windowMs: 60_000   },  // 10 checkouts / min
  upi:      { max: 3,   windowMs: 900_000  },  // 3 UPI orders / 15 min (fraud-prone)
  login:    { max: 5,   windowMs: 60_000   },  // 5 attempts / min
  otp:      { max: 3,   windowMs: 300_000  },  // 3 OTPs / 5 min
  contact:  { max: 3,   windowMs: 60_000   },  // 3 submissions / min
  default:  { max: 30,  windowMs: 60_000   },  // 30 req / min fallback
}

// Cleanup runs at most once every 10 minutes across all instances
let lastCleanup = 0

export async function rateLimit(
  req: NextRequest,
  limiterKey: string,
  identifier?: string
): Promise<NextResponse | null> {
  const cfg = LIMITS[limiterKey] ?? LIMITS.default
  const ip  = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
         ?? req.headers.get('x-real-ip')
         ?? 'unknown'
  const key = `${limiterKey}:${identifier ?? ip}`

  const admin = createAdminClient()

  // Periodic cleanup — fire-and-forget, non-blocking
  const now = Date.now()
  if (now - lastCleanup > 600_000) {
    lastCleanup = now
    admin.rpc('cleanup_rate_limits').then(() => {}).catch(() => {})
  }

  // Atomic check + increment via Supabase RPC — one round-trip, no race conditions
  const { data, error } = await admin.rpc('check_rate_limit', {
    p_key:            key,
    p_max:            cfg.max,
    p_window_seconds: Math.floor(cfg.windowMs / 1000),
  })

  // If Supabase is unreachable, fail open (don't block legitimate traffic)
  if (error || !data?.[0]) {
    console.error('rate-limit RPC error:', error?.message)
    return null
  }

  const { allowed, req_count, window_reset } = data[0]

  if (!allowed) {
    const resetMs     = new Date(window_reset).getTime()
    const retryAfter  = Math.max(1, Math.ceil((resetMs - now) / 1000))
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      {
        status: 429,
        headers: {
          'Retry-After':          String(retryAfter),
          'X-RateLimit-Limit':    String(cfg.max),
          'X-RateLimit-Remaining':'0',
          'X-RateLimit-Reset':    String(resetMs),
        },
      }
    )
  }

  return null
}
