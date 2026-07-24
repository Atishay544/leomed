import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@/lib/supabase/server'
import { sendOrderConfirmation, sendNewOrderAlert } from '@/lib/email'

export async function POST(req: NextRequest) {
  // ── 1. Authenticate (optional — guests have no token) ─────────────────────
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  let user: { id: string } | null = null

  if (token) {
    const supabase = await createServerClient()
    const { data: { user: authUser }, error } = await supabase.auth.getUser(token)
    if (!error && authUser) user = authUser
  }

  // ── 2. Parse body ─────────────────────────────────────────────────────────
  const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json()

  if (!order_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ error: 'Missing payment fields' }, { status: 400 })
  }

  // ── 3. Verify Razorpay signature ──────────────────────────────────────────
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex')

  if (expectedSignature !== razorpay_signature) {
    console.error('Razorpay signature mismatch for order:', order_id)
    return NextResponse.json({ error: 'Payment verification failed' }, { status: 400 })
  }

  // ── 4. Fetch order — for guests skip user_id filter ───────────────────────
  const admin = createAdminClient()
  let query = admin
    .from('orders')
    .select('id, status, coupon_code, razorpay_order_id, user_id, total, discount_amount, subtotal, metadata, shipping_address, order_items(unit_price, quantity, snapshot)')
    .eq('id', order_id)

  // For logged-in users, also verify ownership
  if (user) {
    query = query.eq('user_id', user.id) as typeof query
  }

  const { data: order, error: orderErr } = await query.single()

  if (orderErr || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (order.razorpay_order_id !== razorpay_order_id) {
    return NextResponse.json({ error: 'Order ID mismatch' }, { status: 400 })
  }

  // Idempotency: already confirmed
  if (order.status !== 'pending') {
    return NextResponse.json({ success: true })
  }

  // ── 5. Confirm order + store payment ID ───────────────────────────────────
  const meta            = ((order as any).metadata ?? {}) as Record<string, any>
  const confirmedStatus = meta.payment_method === 'cod_upfront' ? 'cod_upfront_paid' : 'confirmed'

  const { error: updateErr } = await admin
    .from('orders')
    .update({
      status:              confirmedStatus,
      razorpay_payment_id: razorpay_payment_id,
      updated_at:          new Date().toISOString(),
    })
    .eq('id', order_id)

  if (updateErr) {
    console.error('Order confirm error:', updateErr)
    return NextResponse.json({ error: 'Failed to confirm order' }, { status: 500 })
  }

  // ── 6. Increment coupon uses ──────────────────────────────────────────────
  if (order.coupon_code) {
    await admin.rpc('increment_coupon_uses', { p_code: order.coupon_code }).catch(() => {})
  }

  // ── 7. Reserve stock + decrement SKU stock ────────────────────────────────
  const { data: orderItems } = await admin
    .from('order_items')
    .select('product_id, sku_id, quantity')
    .eq('order_id', order_id)

  if (orderItems) {
    await Promise.allSettled(
      orderItems.map(item =>
        admin.rpc('reserve_stock', { p_product_id: item.product_id, p_quantity: item.quantity })
      )
    )
    const skuItems = orderItems.filter(i => i.sku_id)
    if (skuItems.length > 0) {
      await Promise.allSettled(
        skuItems.map(item =>
          admin.rpc('decrement_sku_stock', { p_sku_id: item.sku_id, p_quantity: item.quantity })
        )
      )
    }
  }

  // ── 8. Send confirmation emails ───────────────────────────────────────────
  try {
    const pm        = meta.payment_method as string ?? 'online'
    const addr      = order.shipping_address as Record<string, string> ?? {}
    const emailItems = ((order as any).order_items ?? []).map((i: any) => ({
      name:       i.snapshot?.name ?? '—',
      quantity:   i.quantity,
      unit_price: Number(i.unit_price),
    }))

    // Resolve customer email: logged-in user → auth record; guest → order metadata
    let customerEmail = ''
    if (user) {
      const authData = await admin.auth.admin.getUserById(user.id)
      customerEmail  = authData.data.user?.email ?? ''
    } else {
      customerEmail = meta.guest_email ?? ''
    }

    if (customerEmail) {
      sendOrderConfirmation({
        to:               customerEmail,
        orderId:          order.id,
        items:            emailItems,
        subtotal:         Number((order as any).subtotal ?? 0),
        discount:         Number((order as any).discount_amount ?? 0),
        total:            Number((order as any).total ?? 0),
        paymentMethod:    pm as any,
        amountCharged:    meta.amount_charged    ? Number(meta.amount_charged)    : undefined,
        amountOnDelivery: meta.amount_on_delivery ? Number(meta.amount_on_delivery) : undefined,
        shippingAddress:  addr,
      }).catch((e) => console.error('[email] order confirmation failed:', e?.message ?? e))
    }

    sendNewOrderAlert({
      orderId:         order.id,
      customerEmail:   customerEmail || 'Guest',
      items:           emailItems,
      total:           Number((order as any).total ?? 0),
      paymentMethod:   pm === 'cod_upfront' ? 'COD Upfront' : 'Paid Online',
      shippingAddress: addr,
    }).catch((e) => console.error('[email] new order alert failed:', e?.message ?? e))
  } catch { /* email is non-fatal */ }

  return NextResponse.json({ success: true })
}
