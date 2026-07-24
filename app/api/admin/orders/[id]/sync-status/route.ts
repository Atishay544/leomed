import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@/lib/supabase/server'
import { trackCarrierShipment } from '@/lib/carriers'
import type { CarrierConfig } from '@/lib/carriers'
import { revalidateTag } from 'next/cache'

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

// Delhivery status strings that indicate the shipment is gone / terminal
const CANCELLED_KEYWORDS = ['cancel', 'rto', 'return', 'lost', 'not found', 'no such', 'undelivered']
const DELIVERED_KEYWORDS = ['delivered', 'dl']

function classifyStatus(raw: string): 'cancelled' | 'delivered' | 'shipped' | null {
  const s = raw.toLowerCase()
  if (CANCELLED_KEYWORDS.some(k => s.includes(k))) return 'cancelled'
  if (DELIVERED_KEYWORDS.some(k => s.includes(k)))  return 'delivered'
  if (s.includes('transit') || s.includes('pickup') || s.includes('inscan') || s.includes('manifested')) return 'shipped'
  return null
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: orderId } = await params

  const { data: order } = await admin
    .from('orders')
    .select('status, metadata, payment_status, delivery_partner, delivery_awb')
    .eq('id', orderId)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (!(order as any).delivery_awb) return NextResponse.json({ error: 'No AWB on this order' }, { status: 400 })

  const { data: carrier } = await admin
    .from('delivery_partners' as any)
    .select('*')
    .ilike('display_name', (order as any).delivery_partner ?? '')
    .eq('is_active', true)
    .single()

  if (!carrier) return NextResponse.json({ error: 'Carrier config not found' }, { status: 404 })

  // Fetch live tracking from Delhivery
  const tracking = await trackCarrierShipment(carrier as CarrierConfig, (order as any).delivery_awb)
  const liveStatus = tracking.status ?? ''
  const classified = classifyStatus(liveStatus)

  const update: Record<string, any> = {
    updated_at: new Date().toISOString(),
    metadata: {
      ...((order.metadata as Record<string, any>) ?? {}),
      tracking_status:     liveStatus,
      tracking_updated_at: new Date().toISOString(),
    },
  }

  const terminalStatuses = new Set(['delivered', 'refunded'])
  if (classified && !terminalStatuses.has(order.status)) {
    update.status = classified
  }

  // Shipment cancelled on Delhivery — clear fields + flag refund for prepaid orders
  if (classified === 'cancelled') {
    update.delivery_awb     = null
    update.delivery_partner = null
    update.delivery_service = null
    update.delivery_rate    = null

    const meta = (order.metadata as Record<string, any>) ?? {}
    const paymentMethod = meta.payment_method as string | undefined
    const isPrepaid = order.payment_status === 'prepaid' ||
      paymentMethod === 'online' ||
      (paymentMethod === 'cod_upfront' && meta.razorpay_payment_id)

    if (isPrepaid && order.payment_status !== 'refund_pending' && order.payment_status !== 'refunded') {
      update.payment_status = 'refund_pending'
      update.metadata = {
        ...meta,
        ...update.metadata,
        refund_status:         'pending',
        refund_initiated_at:   new Date().toISOString(),
        refund_triggered_by:   'delhivery_sync',
      }
    }
  }

  await admin.from('orders').update(update).eq('id', orderId)
  revalidateTag('admin-orders'); revalidateTag('admin-dashboard'); revalidateTag('admin-delivery')

  return NextResponse.json({
    ok:          true,
    liveStatus,
    classified,
    cleared:     classified === 'cancelled',
  })
}
