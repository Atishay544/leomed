import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@/lib/supabase/server'
import { fetchCarrierLabel } from '@/lib/carriers'
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

interface PageProps { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: PageProps) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params

  const { data: order } = await admin
    .from('orders')
    .select('delivery_awb, delivery_partner')
    .eq('id', id)
    .single()

  const awb     = (order as any)?.delivery_awb
  const partner = (order as any)?.delivery_partner

  if (!awb) return NextResponse.json({ error: 'No AWB for this order' }, { status: 404 })

  // Find carrier config by display_name (case-insensitive)
  const { data: carriers } = await admin
    .from('delivery_partners' as any)
    .select('*')
    .ilike('display_name', partner ?? '')
    .limit(1)

  const cfg = (carriers?.[0] ?? null) as CarrierConfig | null
  if (!cfg) return NextResponse.json({ error: 'Carrier config not found' }, { status: 404 })

  const result = await fetchCarrierLabel(cfg, awb)
  if (!result.ok || !result.buffer) {
    return NextResponse.json({ error: result.error ?? 'Label fetch failed' }, { status: 502 })
  }

  return new NextResponse(result.buffer, {
    headers: {
      'Content-Type': result.contentType ?? 'application/pdf',
      'Content-Disposition': `attachment; filename="label-${awb}.pdf"`,
    },
  })
}
