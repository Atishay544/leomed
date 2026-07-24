import { adminGuard } from '@/lib/security/admin-guard'
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'

const ALLOWED_STATUSES = new Set([
  'pending', 'confirmed', 'cod_upfront_paid', 'processing',
  'shipped', 'delivered', 'cancelled', 'refunded',
])

const TERMINAL_STATUSES = new Set(['cancelled', 'refunded'])

const ALLOWED_PAYMENT_STATUSES = new Set([
  'prepaid', 'cod', 'partial', 'upi_pending', 'upi_confirmed',
])

interface PageProps { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: PageProps) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const { id } = await params
  const body = await req.json()

  const payload: Record<string, any> = { updated_at: new Date().toISOString() }

  if (body.status !== undefined) {
    if (!ALLOWED_STATUSES.has(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    payload.status = body.status
  }
  if ('tracking_number' in body) {
    payload.tracking_number = body.tracking_number?.trim() || null
  }
  if (body.payment_status !== undefined) {
    if (!ALLOWED_PAYMENT_STATUSES.has(body.payment_status)) {
      return NextResponse.json({ error: 'Invalid payment_status' }, { status: 400 })
    }
    payload.payment_status = body.payment_status
  }

  // Restore stock when cancelling/refunding — only if not already in a terminal state
  if (body.status && TERMINAL_STATUSES.has(body.status)) {
    const { data: currentOrder } = await admin
      .from('orders')
      .select('status')
      .eq('id', id)
      .single()

    if (currentOrder && !TERMINAL_STATUSES.has(currentOrder.status)) {
      const { data: orderItems } = await admin
        .from('order_items')
        .select('product_id, sku_id, quantity')
        .eq('order_id', id)

      if (orderItems && orderItems.length > 0) {
        await Promise.allSettled(
          orderItems.map(item =>
            admin.rpc('restore_stock', { p_product_id: item.product_id, p_quantity: item.quantity })
          )
        )
        const skuItems = orderItems.filter(i => i.sku_id)
        if (skuItems.length > 0) {
          await Promise.allSettled(
            skuItems.map(item =>
              admin.rpc('restore_sku_stock', { p_sku_id: item.sku_id, p_quantity: item.quantity })
            )
          )
        }
      }
    }
  }

  const { error } = await admin.from('orders').update(payload).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  revalidateTag('orders')
  revalidateTag('admin-orders')
  revalidateTag('admin-dashboard')
  revalidateTag('admin-delivery')
  return NextResponse.json({ ok: true })
}
