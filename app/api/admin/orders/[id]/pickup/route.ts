import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@/lib/supabase/server'
import { delhiveryCreatePickup } from '@/lib/carriers'
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: orderId } = await params
  const body = await req.json()
  const { pickup_date, pickup_time, quantity } = body

  if (!pickup_date || !pickup_time) {
    return NextResponse.json({ error: 'pickup_date and pickup_time are required' }, { status: 400 })
  }

  const { data: order } = await admin
    .from('orders')
    .select('delivery_partner')
    .eq('id', orderId)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const { data: carrier } = await admin
    .from('delivery_partners' as any)
    .select('*')
    .ilike('display_name', order.delivery_partner ?? '')
    .eq('is_active', true)
    .single()

  if (!carrier) return NextResponse.json({ error: 'Carrier config not found' }, { status: 404 })
  const cfg = carrier as CarrierConfig

  if (cfg.name !== 'delhivery') {
    return NextResponse.json({ error: `Pickup request not supported for "${cfg.name}"` }, { status: 400 })
  }

  const result = await delhiveryCreatePickup(cfg, {
    warehouse_name: cfg.pickup_location_name ?? '',
    pickup_date,
    pickup_time,
    quantity: quantity ?? 1,
  })

  return NextResponse.json(result)
}
