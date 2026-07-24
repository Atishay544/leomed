import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertSameOrigin } from '@/lib/security/csrf'
import { rateLimit } from '@/lib/security/rate-limit'
import { revalidateTag } from 'next/cache'

// Statuses a customer is allowed to self-cancel — anything BEFORE dispatch.
// Once shipped/delivered (or already terminal) the user cannot cancel.
const CANCELLABLE = new Set(['pending', 'confirmed', 'cod_upfront_paid', 'processing'])

interface RouteCtx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: RouteCtx) {
  // 1. CSRF
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  // 2. Rate limit
  const limited = await rateLimit(req, 'default')
  if (limited) return limited

  // 3. Auth (cookie session)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in to cancel an order.' }, { status: 401 })

  const { id } = await params
  const admin = createAdminClient()

  // 4. Ownership + status check (admin client, scoped by user_id)
  const { data: order } = await admin
    .from('orders')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })

  if (!CANCELLABLE.has(order.status as string)) {
    const terminal = order.status === 'cancelled' || order.status === 'refunded'
    return NextResponse.json({
      error: terminal
        ? 'This order has already been cancelled.'
        : 'This order has already been dispatched and can no longer be cancelled. Please contact support.',
    }, { status: 409 })
  }

  // 5. Snapshot the line items BEFORE flipping status (needed for stock restore)
  const { data: items } = await admin
    .from('order_items')
    .select('product_id, sku_id, quantity')
    .eq('order_id', id)

  // 6. Race-safe flip: only succeeds if the order is STILL cancellable.
  //    The `.in('status', …)` guard means a concurrent cancel can only win once,
  //    so stock is never restored twice.
  const { data: flipped, error: flipErr } = await admin
    .from('orders')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .in('status', Array.from(CANCELLABLE))
    .select('id')

  if (flipErr) return NextResponse.json({ error: flipErr.message }, { status: 400 })
  if (!flipped || flipped.length === 0)
    return NextResponse.json({ error: 'This order is no longer cancellable.' }, { status: 409 })

  // 7. Restore stock — quantity-accurate, product-level + SKU-level.
  if (items && items.length > 0) {
    await Promise.allSettled(
      items.map(it => admin.rpc('restore_stock', { p_product_id: it.product_id, p_quantity: it.quantity }))
    )
    const skuItems = items.filter(i => i.sku_id)
    if (skuItems.length > 0) {
      await Promise.allSettled(
        skuItems.map(it => admin.rpc('restore_sku_stock', { p_sku_id: it.sku_id, p_quantity: it.quantity }))
      )
    }
  }

  revalidateTag('orders')
  revalidateTag('admin-orders')
  revalidateTag('admin-dashboard')
  revalidateTag('products')
  revalidateTag('admin-products')

  return NextResponse.json({ ok: true })
}
