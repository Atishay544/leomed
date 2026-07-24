import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getGA4RealtimeUsers } from '@/lib/analytics-ga4'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const count = await getGA4RealtimeUsers()
  return NextResponse.json({ count })
}
