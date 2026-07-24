import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@/lib/supabase/server'
import { carrierNDRAction } from '@/lib/carriers'
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
  const { action, deferred_date, name, phone, add } = body

  const validActions = new Set(['RE-ATTEMPT', 'DEFER_DLV', 'EDIT_DETAILS', 'RTO'])
  if (!validActions.has(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }
  if (action === 'DEFER_DLV' && !deferred_date) {
    return NextResponse.json({ error: 'deferred_date required for DEFER_DLV' }, { status: 400 })
  }

  const { data: order } = await admin
    .from('orders')
    .select('delivery_partner, delivery_awb')
    .eq('id', orderId)
    .single()

  if (!order?.delivery_awb) return NextResponse.json({ error: 'No AWB on this order' }, { status: 400 })

  const { data: carrier } = await admin
    .from('delivery_partners' as any)
    .select('*')
    .ilike('display_name', order.delivery_partner ?? '')
    .eq('is_active', true)
    .single()

  if (!carrier) return NextResponse.json({ error: 'Carrier config not found' }, { status: 404 })

  const result = await carrierNDRAction(carrier as CarrierConfig, {
    waybill: order.delivery_awb,
    action,
    deferred_date,
    name,
    phone,
    add,
  })

  return NextResponse.json(result)
}
