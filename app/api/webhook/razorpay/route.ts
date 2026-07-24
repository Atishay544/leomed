import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendOrderConfirmation, sendNewOrderAlert } from '@/lib/email'

// Razorpay sends webhook events signed with RAZORPAY_WEBHOOK_SECRET.
// This handler acts as a fallback — if the user's browser crashes before
// /verify is called, the webhook still confirms the order automatically.

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  // ── 1. Verify webhook signature ──────────────────────────────────────────
  const signature = req.headers.get('x-razorpay-signature') ?? ''
  const secret    = process.env.RAZORPAY_WEBHOOK_SECRET ?? ''

  if (!secret || secret === 'REPLACE_WITH_RAZORPAY_WEBHOOK_SECRET') {
    // Webhook secret not configured — log and skip (don't 500)
    console.warn('Razorpay webhook received but RAZORPAY_WEBHOOK_SECRET is not set')
    return NextResponse.json({ received: true })
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')

  if (expected !== signature) {
    console.error('Razorpay webhook: invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // ── 2. Parse event ────────────────────────────────────────────────────────
  let event: any
  try { event = JSON.parse(rawBody) } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Only handle payment.captured (money received)
  if (event.event !== 'payment.captured') {
    return NextResponse.json({ received: true })
  }

  const payment       = event.payload?.payment?.entity
  const razorpayOrderId = payment?.order_id
  const razorpayPaymentId = payment?.id

  if (!razorpayOrderId) {
    return NextResponse.json({ received: true })
  }

  const admin = createAdminClient()

  // ── 3. Find the order by razorpay_order_id ────────────────────────────────
  const { data: order } = await admin
    .from('orders')
    .select('id, status, user_id, coupon_code, total, discount_amount, subtotal, metadata, shipping_address, order_items(product_id, sku_id, unit_price, quantity, snapshot)')
    .eq('razorpay_order_id', razorpayOrderId)
    .maybeSingle()

  if (!order) {
    console.warn('Razorpay webhook: no order found for', razorpayOrderId)
    return NextResponse.json({ received: true })
  }

  // ── 4. Idempotency — skip if already confirmed ────────────────────────────
  if (order.status !== 'pending') {
    return NextResponse.json({ received: true })
  }

  // ── 5. Confirm order ──────────────────────────────────────────────────────
  await admin.from('orders').update({
    status:              'confirmed',
    razorpay_payment_id: razorpayPaymentId,
    updated_at:          new Date().toISOString(),
  }).eq('id', order.id)

  // ── 6. Reserve stock + decrement SKU stock ────────────────────────────────
  const items = (order as any).order_items ?? []
  await Promise.allSettled(
    items.map((i: any) =>
      admin.rpc('reserve_stock', { p_product_id: i.product_id, p_quantity: i.quantity })
    )
  )
  const skuItems = items.filter((i: any) => i.sku_id)
  if (skuItems.length > 0) {
    await Promise.allSettled(
      skuItems.map((i: any) =>
        admin.rpc('decrement_sku_stock', { p_sku_id: i.sku_id, p_quantity: i.quantity })
      )
    )
  }

  // ── 7. Increment coupon uses ──────────────────────────────────────────────
  if ((order as any).coupon_code) {
    await admin.rpc('increment_coupon_uses', { p_code: (order as any).coupon_code }).catch(() => {})
  }

  // ── 8. Send confirmation emails (fire-and-forget) ─────────────────────────
  try {
    const meta  = ((order as any).metadata ?? {}) as Record<string, any>
    const pm    = meta.payment_method as string ?? 'online'
    const addr  = (order as any).shipping_address as Record<string, string> ?? {}
    const emailItems = items.map((i: any) => ({
      name:       i.snapshot?.name ?? '—',
      quantity:   i.quantity,
      unit_price: Number(i.unit_price),
    }))
    const authData = await admin.auth.admin.getUserById((order as any).user_id)
    const email    = authData.data.user?.email ?? ''

    sendOrderConfirmation({
      to:               email,
      orderId:          order.id,
      items:            emailItems,
      subtotal:         Number((order as any).subtotal ?? 0),
      discount:         Number((order as any).discount_amount ?? 0),
      total:            Number((order as any).total ?? 0),
      paymentMethod:    pm as any,
      amountCharged:    meta.amount_charged ? Number(meta.amount_charged) : undefined,
      amountOnDelivery: meta.amount_on_delivery ? Number(meta.amount_on_delivery) : undefined,
      shippingAddress:  addr,
    }).catch((e) => console.error('[email] order confirmation failed:', e?.message ?? e))

    sendNewOrderAlert({
      orderId:         order.id,
      customerEmail:   email,
      items:           emailItems,
      total:           Number((order as any).total ?? 0),
      paymentMethod:   pm === 'cod_upfront' ? 'COD Upfront' : 'Paid Online',
      shippingAddress: addr,
    }).catch((e) => console.error('[email] new order alert failed:', e?.message ?? e))
  } catch { /* non-fatal */ }

  console.log('Razorpay webhook: confirmed order', order.id)
  return NextResponse.json({ received: true })
}
