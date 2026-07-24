import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@/lib/supabase/server'
import type { CarrierConfig } from '@/lib/carriers'

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  if (user.app_metadata?.role === 'admin') return admin
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return admin
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: partner } = await admin
    .from('delivery_partners' as any)
    .select('*')
    .eq('id', id)
    .single()

  if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })

  const cfg = partner as CarrierConfig

  if (!cfg.api_key) {
    return NextResponse.json({ ok: false, error: 'No API key configured' })
  }

  try {
    if (cfg.name === 'delhivery') {
      const base = cfg.config?.base_url ?? 'https://track.delhivery.com'
      // Test: check if a known pincode (110001 = New Delhi) is serviceable
      const res = await fetch(
        `${base}/c/api/pin-codes/json/?filter_codes=110001`,
        {
          headers: { Authorization: `Token ${cfg.api_key}` },
          signal: AbortSignal.timeout(5000),
        }
      )
      if (res.status === 401) return NextResponse.json({ ok: false, error: 'Invalid API token (401 Unauthorized)' })
      if (!res.ok) return NextResponse.json({ ok: false, error: `API returned ${res.status}` })
      const json = await res.json()
      if (json?.delivery_codes) return NextResponse.json({ ok: true })
      return NextResponse.json({ ok: false, error: 'Unexpected response from Delhivery' })
    }

    return NextResponse.json({ ok: false, error: `Test not implemented for "${cfg.name}"` })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  }
}
