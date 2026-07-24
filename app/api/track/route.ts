import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { sessionId, path, referrer } = await req.json()

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'invalid' }, { status: 400 })
    }

    // Sanitise path
    const safePath = typeof path === 'string' ? path.slice(0, 500) : '/'
    const safeReferrer = typeof referrer === 'string' ? referrer.slice(0, 500) : null

    const supabase = createAdminClient()
    await supabase.from('page_views').insert({
      session_id: sessionId.slice(0, 64),
      path: safePath,
      referrer: safeReferrer,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
