import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@/lib/supabase/server'
import { sendOrderConfirmation, sendNewOrderAlert } from '@/lib/email'
import { rateLimit } from '@/lib/security/rate-limit'
import { assertSameOrigin } from '@/lib/security/csrf'
import { sanitizeText } from '@/lib/security/sanitize'
import { revalidateTag } from 'next/cache'

type PaymentMethod = 'online' | 'cod' | 'cod_upfront' | 'upi' | 'partial_cod'

const COD_LIMIT = 7000
const PARTIAL_COD_PCT = 20

function getRazorpay() {
  return new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  })
}

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const limited = await rateLimit(req, 'checkout')
  if (limited) return limited

  // UPI-specific tighter rate limit (3 per 15 min — applied before body parse)
  const isUpiMethod = (req.headers.get('x-payment-hint') ?? '').includes('upi')
  if (isUpiMethod) {
    const upiLimited = await rateLimit(req, 'upi')
    if (upiLimited) return upiLimited
  }

  // ── 1. Authenticate (optional — guests have no token) ─────────────────────
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  let user: { id: string; email?: string } | null = null

  if (token) {
    const supabase = await createServerClient()
    const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token)
    if (!authErr && authUser) user = authUser
    // Invalid token on a checkout attempt is treated as guest (not hard error)
  }

  // ── 2. Parse body ─────────────────────────────────────────────────────────
  const body = await req.json()
  const {
    items,
    shipping_address,
    guest_email,
    coupon_code,
    payment_method = 'online' as PaymentMethod,
    offer_id,
    utr_number,
  } = body

  if (!Array.isArray(items) || items.length === 0)
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })

  if (items.length > 50)
    return NextResponse.json({ error: 'Cart too large' }, { status: 400 })

  for (const item of items) {
    const qty = Number(item.quantity)
    if (!Number.isInteger(qty) || qty < 1 || qty > 3)
      return NextResponse.json({ error: 'Maximum 3 units per product allowed' }, { status: 400 })
    item.quantity = qty
  }

  const requiredAddr = ['name', 'phone', 'line1', 'city', 'state', 'pincode'] as const
  for (const f of requiredAddr) {
    if (!shipping_address?.[f]?.trim())
      return NextResponse.json({ error: `Missing address field: ${f}` }, { status: 400 })
  }

  // Sanitize all address string fields — prevents XSS in admin order view
  const safeAddress = {
    name:    sanitizeText(String(shipping_address.name)).slice(0, 100),
    phone:   String(shipping_address.phone).replace(/[^+0-9]/g, '').slice(0, 16),
    line1:   sanitizeText(String(shipping_address.line1)).slice(0, 200),
    line2:   sanitizeText(String(shipping_address.line2 ?? '')).slice(0, 200),
    city:    sanitizeText(String(shipping_address.city)).slice(0, 100),
    state:   sanitizeText(String(shipping_address.state)).slice(0, 100),
    pincode: String(shipping_address.pincode).replace(/\D/g, '').slice(0, 10),
  }

  const validPaymentMethods: PaymentMethod[] = ['online', 'cod', 'cod_upfront', 'upi', 'partial_cod']
  if (!validPaymentMethods.includes(payment_method))
    return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 })

  // ── UPI / Partial COD: validate UTR (hardened) ───────────────────────────
  if (payment_method === 'upi' || payment_method === 'partial_cod') {
    // Separate tighter rate limit for UPI payments
    const upiRateLimit = await rateLimit(req, 'upi')
    if (upiRateLimit) return upiRateLimit

    if (!utr_number?.trim())
      return NextResponse.json({ error: 'UTR / Transaction ID is required for UPI payment' }, { status: 400 })

    const utr = utr_number.trim().toUpperCase().replace(/\s/g, '')

    // Real NPCI UTRs: 12–22 alphanumeric characters (IMPS=12 digits, UPI ref=12-22)
    if (!/^[A-Z0-9]{12,22}$/.test(utr))
      return NextResponse.json({
        error: 'Invalid UTR: must be 12–22 alphanumeric characters. Copy it exactly from your UPI app.',
      }, { status: 400 })

    // Block obvious fake/test UTR patterns
    const FAKE_PATTERNS = [
      /^(.)\1{11,}$/,               // all same character: AAAAAAAAAAAAA, 000000000000
      /^(012345|123456|234567)/,    // sequential digits
      /^(TEST|FAKE|DEMO|XXXX|ABCD|QWER)/,  // test strings
      /^0+$/,                        // all zeros
    ]
    if (FAKE_PATTERNS.some(p => p.test(utr)))
      return NextResponse.json({
        error: 'Invalid UTR — please enter the actual transaction ID from your UPI app',
      }, { status: 400 })

    const adminUtr = createAdminClient()

    // Duplicate UTR check — same UTR cannot pay for two orders
    const { data: existingUtr } = await adminUtr
      .from('orders')
      .select('id, created_at')
      .filter('metadata->>utr_number', 'eq', utr)
      .maybeSingle()
    if (existingUtr)
      return NextResponse.json({ error: 'This UTR has already been used for another order' }, { status: 400 })

    // UPI flood protection per phone — max 2 pending UPI orders per phone number
    const phone = (shipping_address?.phone ?? '').replace(/\D/g, '').slice(-10)
    if (phone.length === 10) {
      const { count: upiCount } = await adminUtr
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .filter('shipping_address->>phone', 'ilike', `%${phone}`)
        .in('payment_status', ['upi_pending'])
        .in('status', ['pending'])
      if ((upiCount ?? 0) >= 2)
        return NextResponse.json({
          error: 'Too many pending UPI orders for this phone number. Please wait for existing orders to be verified.',
        }, { status: 429 })
    }
  }

  // ── 3. Validate products + compute subtotal ───────────────────────────────
  const admin = createAdminClient()

  // Block full COD for high-value orders
  if (payment_method === 'cod' && body.total_hint > COD_LIMIT) {
    return NextResponse.json({
      error: `Cash on Delivery is not available for orders above ₹${COD_LIMIT.toLocaleString('en-IN')}. Please use Partial COD (${PARTIAL_COD_PCT}% advance) or pay online.`,
    }, { status: 400 })
  }

  // COD flood protection — by user_id for logged-in, by phone for guests
  if (payment_method === 'cod' || payment_method === 'cod_upfront' || payment_method === 'partial_cod') {
    if (user) {
      const { count } = await admin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('status', ['pending', 'confirmed'])
        .in('payment_status', ['cod', 'partial'])
      if ((count ?? 0) >= 3)
        return NextResponse.json({ error: 'You have too many pending COD orders. Please complete or cancel existing orders first.' }, { status: 429 })
    } else {
      const phone = (shipping_address.phone ?? '').replace(/\D/g, '').slice(-10)
      if (phone.length === 10) {
        const { count } = await admin
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .is('user_id', null)
          .filter('shipping_address->>phone', 'ilike', `%${phone}`)
          .in('status', ['pending', 'confirmed'])
          .in('payment_status', ['cod', 'partial'])
        if ((count ?? 0) >= 3)
          return NextResponse.json({ error: 'Too many pending COD orders for this phone number.' }, { status: 429 })
      }
    }
  }

  const productIds: string[] = items.map((i: any) => i.product_id)
  const { data: products, error: prodErr } = await admin
    .from('products')
    .select('id, name, price, stock, images, slug, weight_grams')
    .in('id', productIds)
    .eq('is_active', true)

  if (prodErr || !products || products.length !== productIds.length)
    return NextResponse.json({ error: 'One or more products are unavailable' }, { status: 400 })

  // Fetch SKUs for all products in cart (needed for variant stock validation)
  const { data: allSkus } = await admin
    .from('product_skus')
    .select('id, product_id, attributes, stock')
    .in('product_id', productIds)

  function skuAttrKey(attrs: Record<string, string>) {
    return Object.entries(attrs)
      .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map(([k, v]) => `${k.toLowerCase()}=${v}`)
      .join('|')
  }

  const productMap = new Map(products.map(p => [p.id, p]))
  let subtotal = 0
  const lineItems: { product_id: string; sku_id: string | null; quantity: number; unit_price: number; total: number; snapshot: object }[] = []

  for (const item of items) {
    const product = productMap.get(item.product_id)
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 400 })

    // Validate stock — prefer SKU-level when a match is found, fall back to product-level
    let matchedSkuId: string | null = null
    const productSkus = (allSkus ?? []).filter(s => s.product_id === item.product_id)

    if (productSkus.length > 0 && item.variant_attributes && typeof item.variant_attributes === 'object' && Object.keys(item.variant_attributes).length > 0) {
      const key = skuAttrKey(item.variant_attributes)
      const sku = productSkus.find(s => skuAttrKey(s.attributes) === key)
      if (sku) {
        // Exact SKU found — enforce per-variant stock
        if (sku.stock < item.quantity)
          return NextResponse.json({ error: `Insufficient stock for: ${product.name} (${Object.values(item.variant_attributes).join(' / ')})` }, { status: 400 })
        matchedSkuId = sku.id
      }
      // SKU not found (e.g. variant renamed after SKU creation) — fall through to product-level check below
    }

    if (!matchedSkuId) {
      // No SKU matched — use product-level stock as fallback
      if (product.stock !== null && product.stock < item.quantity)
        return NextResponse.json({ error: `Insufficient stock for: ${product.name}` }, { status: 400 })
    }

    const lineTotal = product.price * item.quantity
    subtotal += lineTotal
    lineItems.push({
      product_id: item.product_id,
      sku_id:     matchedSkuId,
      quantity:   item.quantity,
      unit_price: product.price,
      total:      lineTotal,
      snapshot:   {
        name: product.name, price: product.price, image: product.images?.[0] ?? null,
        slug: product.slug, weight_grams: (product as any).weight_grams ?? 500,
        variant: item.variant_attributes ?? null,
      },
    })
  }

  // ── 4. Apply coupon ───────────────────────────────────────────────────────
  let discount = 0
  let validatedCouponCode: string | null = null

  if (coupon_code) {
    const { data: coupon } = await admin
      .from('coupons')
      .select('id, code, type, value, min_order, max_uses, uses_count, expires_at')
      .eq('code', coupon_code.trim().toUpperCase())
      .eq('is_active', true)
      .maybeSingle()

    if (
      coupon &&
      (!coupon.expires_at || new Date(coupon.expires_at) > new Date()) &&
      (coupon.max_uses === null || coupon.uses_count < coupon.max_uses) &&
      subtotal >= Number(coupon.min_order ?? 0)
    ) {
      discount = coupon.type === 'percentage'
        ? Math.round(subtotal * Number(coupon.value)) / 100
        : Math.min(Number(coupon.value), subtotal)
      validatedCouponCode = coupon.code
    }
  }

  const total = Math.max(0, subtotal - discount)

  // ── 4b. Resolve COD upfront offer ─────────────────────────────────────────
  let offerUpfrontPct: number | null = null
  let offerDiscountPct: number | null = null
  let validatedOfferId: string | null = null

  if (payment_method === 'cod_upfront' && offer_id) {
    const { data: offer } = await admin
      .from('offers')
      .select('id, type, upfront_pct, discount_pct, is_active')
      .eq('id', offer_id)
      .eq('is_active', true)
      .maybeSingle()

    if (offer && offer.type === 'cod_upfront' && offer.upfront_pct) {
      offerUpfrontPct  = Number(offer.upfront_pct)
      offerDiscountPct = Number(offer.discount_pct ?? 0)
      validatedOfferId = offer.id
    }
  }

  // partial_cod: validate total > limit, compute 20% advance
  if (payment_method === 'partial_cod' && total <= COD_LIMIT) {
    return NextResponse.json({
      error: `Partial COD is only required for orders above ₹${COD_LIMIT.toLocaleString('en-IN')}.`,
    }, { status: 400 })
  }

  const amountToCharge = (payment_method === 'cod_upfront' && offerUpfrontPct !== null)
    ? Math.round(total * offerUpfrontPct) / 100
    : payment_method === 'partial_cod'
      ? Math.round(total * PARTIAL_COD_PCT) / 100
      : total

  // ── 5. Build order metadata ───────────────────────────────────────────────
  const orderMetadata: Record<string, any> = { payment_method }
  if (!user && guest_email) orderMetadata.guest_email = guest_email

  if (payment_method === 'cod_upfront' && validatedOfferId) {
    orderMetadata.offer_id           = validatedOfferId
    orderMetadata.offer_upfront_pct  = offerUpfrontPct
    orderMetadata.offer_discount_pct = offerDiscountPct
    orderMetadata.amount_charged     = amountToCharge
    orderMetadata.amount_on_delivery = total - amountToCharge
  }
  if (payment_method === 'cod') {
    orderMetadata.amount_on_delivery = total
  }
  if (payment_method === 'partial_cod') {
    orderMetadata.advance_pct        = PARTIAL_COD_PCT
    orderMetadata.amount_charged     = amountToCharge
    orderMetadata.amount_on_delivery = total - amountToCharge
    orderMetadata.utr_number         = utr_number?.trim().toUpperCase()
  }
  if (payment_method === 'upi') {
    orderMetadata.utr_number = utr_number.trim().toUpperCase()
  }

  // ── 6. Create order in Supabase ───────────────────────────────────────────
  const initialStatus = payment_method === 'cod' ? 'confirmed' : 'pending'
  const paymentStatus = payment_method === 'cod' ? 'cod'
    : payment_method === 'cod_upfront' ? 'partial'
    : payment_method === 'partial_cod' ? 'partial'
    : payment_method === 'upi' ? 'upi_pending'
    : 'prepaid'

  const { data: order, error: orderErr } = await admin
    .from('orders')
    .insert({
      user_id:          user?.id ?? null,
      status:           initialStatus,
      subtotal,
      subtotal_amount:  subtotal,
      discount_amount:  discount,
      shipping_amount:  0,
      tax:              0,
      shipping:         0,
      total,
      total_amount:     total,
      shipping_address: safeAddress,
      coupon_code:     validatedCouponCode,
      metadata:        orderMetadata,
      payment_status:  paymentStatus,
    })
    .select('id')
    .single()

  if (orderErr || !order) {
    console.error('Order insert error:', orderErr)
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
  }

  // ── 7. Insert order line items ────────────────────────────────────────────
  const { error: itemsErr } = await admin
    .from('order_items')
    .insert(lineItems.map(li => ({ ...li, order_id: order.id })))

  if (itemsErr) {
    await admin.from('orders').delete().eq('id', order.id)
    console.error('Order items insert error:', itemsErr)
    return NextResponse.json({ error: 'Failed to create order items' }, { status: 500 })
  }

  // ── 7b. Save address for logged-in users only ─────────────────────────────
  if (user) {
    admin.from('profiles')
      .update({ saved_address: safeAddress })
      .eq('id', user.id)
      .then(() => {})

    ;(async () => {
      const phone = safeAddress.phone.replace(/\D/g, '')
      if (phone.length < 10) return
      const { data: existing } = await admin
        .from('addresses')
        .select('id')
        .eq('user_id', user!.id)
        .filter('phone', 'ilike', `%${phone.slice(-10)}%`)
        .maybeSingle()
      if (existing) return
      const { data: count } = await admin
        .from('addresses')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id)
      await admin.from('addresses').insert({
        user_id:   user!.id,
        full_name: safeAddress.name,
        phone:     safeAddress.phone,
        line1:     safeAddress.line1,
        line2:     safeAddress.line2 || null,
        city:      safeAddress.city,
        state:     safeAddress.state,
        pincode:   safeAddress.pincode,
        is_default: (count as any)?.count === 0,
      })
    })().catch(() => {})
  }

  // Helper: deduct product-level + SKU-level stock for all line items
  async function deductStock() {
    const tasks: Promise<unknown>[] = lineItems.map(li =>
      admin.rpc('reserve_stock', { p_product_id: li.product_id, p_quantity: li.quantity })
    )
    for (const li of lineItems) {
      if (li.sku_id) {
        tasks.push(admin.rpc('decrement_sku_stock', { p_sku_id: li.sku_id, p_quantity: li.quantity }))
      }
    }
    await Promise.allSettled(tasks)
  }

  // ── 8. COD → done, no Razorpay needed ────────────────────────────────────
  if (payment_method === 'cod') {
    await deductStock()
    revalidateTag('products'); revalidateTag('admin-products'); revalidateTag('admin-dashboard')
    if (validatedCouponCode) {
      await admin.rpc('increment_coupon_uses', { p_code: validatedCouponCode }).catch(() => {})
    }

    const emailItems = lineItems.map(li => ({
      name:       (li.snapshot as any).name,
      quantity:   li.quantity,
      unit_price: li.unit_price,
    }))
    const customerEmail = user?.email ?? guest_email ?? null
    if (customerEmail) {
      sendOrderConfirmation({
        to:              customerEmail,
        orderId:         order.id,
        items:           emailItems,
        subtotal, discount, total,
        paymentMethod:   'cod',
        shippingAddress: safeAddress,
      }).catch((e) => console.error('[email] order confirmation failed:', e?.message ?? e))
    }
    sendNewOrderAlert({
      orderId:        order.id,
      customerEmail:  customerEmail ?? 'Guest',
      items:          emailItems,
      total,
      paymentMethod:  'Cash on Delivery',
      shippingAddress: safeAddress,
    }).catch((e) => console.error('[email] new order alert failed:', e?.message ?? e))

    return NextResponse.json({ order_id: order.id, payment_method: 'cod' })
  }

  // ── 8b. UPI → reserve stock + send alerts, no Razorpay ───────────────────
  if (payment_method === 'upi') {
    await deductStock()
    revalidateTag('products'); revalidateTag('admin-products'); revalidateTag('admin-dashboard')
    if (validatedCouponCode) {
      await admin.rpc('increment_coupon_uses', { p_code: validatedCouponCode }).catch(() => {})
    }
    const emailItems = lineItems.map(li => ({
      name:       (li.snapshot as any).name,
      quantity:   li.quantity,
      unit_price: li.unit_price,
    }))
    const customerEmail = user?.email ?? guest_email ?? null
    if (customerEmail) {
      sendOrderConfirmation({
        to:              customerEmail,
        orderId:         order.id,
        items:           emailItems,
        subtotal, discount, total,
        paymentMethod:   'upi',
        utrNumber:       utr_number.trim().toUpperCase(),
        shippingAddress: safeAddress,
      }).catch((e) => console.error('[email] upi order confirmation failed:', e?.message ?? e))
    }
    sendNewOrderAlert({
      orderId:        order.id,
      customerEmail:  customerEmail ?? 'Guest',
      items:          emailItems,
      total,
      paymentMethod:  `UPI Transfer — UTR: ${utr_number.trim().toUpperCase()}`,
      shippingAddress: safeAddress,
    }).catch((e) => console.error('[email] upi new order alert failed:', e?.message ?? e))

    return NextResponse.json({ order_id: order.id, payment_method: 'upi' })
  }

  // ── 8c. Partial COD via UPI advance ──────────────────────────────────────
  if (payment_method === 'partial_cod') {
    await deductStock()
    revalidateTag('products'); revalidateTag('admin-products'); revalidateTag('admin-dashboard')
    if (validatedCouponCode) {
      await admin.rpc('increment_coupon_uses', { p_code: validatedCouponCode }).catch(() => {})
    }
    const emailItems = lineItems.map(li => ({
      name:       (li.snapshot as any).name,
      quantity:   li.quantity,
      unit_price: li.unit_price,
    }))
    const customerEmail = user?.email ?? guest_email ?? null
    if (customerEmail) {
      sendOrderConfirmation({
        to:               customerEmail,
        orderId:          order.id,
        items:            emailItems,
        subtotal, discount, total,
        paymentMethod:    'partial_cod',
        amountCharged:    amountToCharge,
        amountOnDelivery: total - amountToCharge,
        utrNumber:        utr_number?.trim().toUpperCase(),
        shippingAddress:  safeAddress,
      }).catch((e) => console.error('[email] partial_cod confirmation failed:', e?.message ?? e))
    }
    sendNewOrderAlert({
      orderId:        order.id,
      customerEmail:  customerEmail ?? 'Guest',
      items:          emailItems,
      total,
      paymentMethod:  `Partial COD — ₹${amountToCharge.toFixed(2)} advance via UPI (UTR: ${utr_number?.trim().toUpperCase()}) + ₹${(total - amountToCharge).toFixed(2)} on delivery`,
      shippingAddress: safeAddress,
    }).catch((e) => console.error('[email] partial_cod alert failed:', e?.message ?? e))

    return NextResponse.json({ order_id: order.id, payment_method: 'partial_cod' })
  }

  // ── 9. Online / COD-upfront → create Razorpay order ──────────────────────
  let razorpayOrder: { id: string; amount: number; currency: string }
  try {
    razorpayOrder = await getRazorpay().orders.create({
      amount:   Math.round(amountToCharge * 100),
      currency: 'INR',
      receipt:  order.id.slice(0, 40),
      notes: {
        order_id:        order.id,
        user_id:         user?.id ?? 'guest',
        payment_method,
        ...(payment_method === 'cod_upfront' && offerUpfrontPct !== null && {
          offer_upfront_pct:  String(offerUpfrontPct),
          amount_on_delivery: String(total - amountToCharge),
        }),
      },
    })
  } catch (rzpErr: any) {
    await admin.from('orders').delete().eq('id', order.id)
    console.error('Razorpay order creation failed:', rzpErr)
    const msg = rzpErr?.error?.description ?? rzpErr?.message ?? 'Payment gateway error. Please try again.'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  await admin
    .from('orders')
    .update({ razorpay_order_id: razorpayOrder.id })
    .eq('id', order.id)

  return NextResponse.json({
    order_id:       order.id,
    payment_method,
    razorpay_order: {
      id:       razorpayOrder.id,
      amount:   razorpayOrder.amount,
      currency: razorpayOrder.currency,
    },
  })
}
