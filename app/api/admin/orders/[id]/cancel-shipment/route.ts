import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@/lib/supabase/server'
import { cancelCarrierShipment } from '@/lib/carriers'
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: orderId } = await params

  const { data: order } = await admin
    .from('orders')
    .select('delivery_partner, delivery_awb, payment_status, metadata')
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

  let result: { success: boolean; error?: string }
  try {
    result = await cancelCarrierShipment(carrier as CarrierConfig, order.delivery_awb)
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? 'Carrier API error during cancellation' }, { status: 502 })
  }

  if (result.success) {
    const meta = (order.metadata ?? {}) as Record<string, any>
    const paymentMethod = meta.payment_method as string | undefined
    const isPrepaid = order.payment_status === 'prepaid' ||
      (paymentMethod === 'online') ||
      (paymentMethod === 'cod_upfront' && meta.razorpay_payment_id)

    const updatedMeta: Record<string, any> = {
      ...meta,
      cancelled_at: new Date().toISOString(),
    }
    if (isPrepaid) {
      updatedMeta.refund_status = 'pending'
      updatedMeta.refund_initiated_at = new Date().toISOString()
    }

    await admin
      .from('orders')
      .update({
        status:           'cancelled',
        payment_status:   isPrepaid ? 'refund_pending' : order.payment_status,
        delivery_awb:     null,
        delivery_partner: null,
        delivery_service: null,
        delivery_rate:    null,
        metadata:         updatedMeta,
        updated_at:       new Date().toISOString(),
      })
      .eq('id', orderId)
    revalidateTag('admin-orders'); revalidateTag('admin-dashboard'); revalidateTag('admin-delivery')
  }

  return NextResponse.json({ ...result, refund_initiated: result.success && (
    (order as any).payment_status === 'prepaid' ||
    ((order.metadata as any)?.payment_method === 'online') ||
    ((order.metadata as any)?.payment_method === 'cod_upfront' && (order.metadata as any)?.razorpay_payment_id)
  ) })
}
