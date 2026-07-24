import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@/lib/supabase/server'
import { trackCarrierShipment } from '@/lib/carriers'
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: orderId } = await params

  const { data: order } = await (admin as any)
    .from('orders')
    .select('delivery_partner, delivery_awb')
    .eq('id', orderId)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  const o = order as any
  if (!o.delivery_awb) return NextResponse.json({ error: 'No AWB on this order' }, { status: 400 })

  const { data: carrier } = await admin
    .from('delivery_partners' as any)
    .select('*')
    .ilike('display_name', o.delivery_partner ?? '')
    .eq('is_active', true)
    .single()

  if (!carrier) return NextResponse.json({ error: 'Carrier config not found' }, { status: 404 })

  const result = await trackCarrierShipment(carrier as CarrierConfig, o.delivery_awb)
  return NextResponse.json(result)
}
