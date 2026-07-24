import { adminGuard } from '@/lib/security/admin-guard'
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'

const ALLOWED_STATUSES = new Set([
  'pending', 'confirmed', 'cod_upfront_paid', 'processing',
  'shipped', 'delivered', 'cancelled', 'refunded',
])

const TERMINAL_STATUSES = new Set(['cancelled', 'refunded'])

export async function PATCH(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const body = await req.json()
  const { ids, status } = body

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 })
  }
  if (!ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  if (ids.length > 100) {
    return NextResponse.json({ error: 'Cannot update more than 100 orders at once' }, { status: 400 })
  }

  // ── Moving INTO a terminal state → restore stock for the orders that
  //    actually transition (weren't already cancelled/refunded). Race-safe:
  //    the `.not(status in terminal)` guard means each order can only flip —
  //    and therefore only restock — once. ────────────────────────────────────
  if (TERMINAL_STATUSES.has(status)) {
    const { data: flipped, error: flipErr } = await admin
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .in('id', ids)
      .not('status', 'in', '("cancelled","refunded")')
      .select('id')

    if (flipErr) return NextResponse.json({ error: flipErr.message }, { status: 400 })

    const flippedIds = (flipped ?? []).map(o => o.id)
    if (flippedIds.length > 0) {
      const { data: items } = await admin
        .from('order_items')
        .select('product_id, sku_id, quantity')
        .in('order_id', flippedIds)

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
    }

    revalidateTag('orders')
    revalidateTag('admin-orders')
    revalidateTag('admin-dashboard')
    revalidateTag('admin-delivery')
    revalidateTag('products')
    revalidateTag('admin-products')

    return NextResponse.json({ updated: flippedIds.length })
  }

  // ── Non-terminal status change → plain update, no stock impact ─────────────
  const { error, count } = await admin
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .in('id', ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  revalidateTag('orders')
  revalidateTag('admin-orders')
  revalidateTag('admin-dashboard')
  revalidateTag('admin-delivery')

  return NextResponse.json({ updated: count ?? ids.length })
}
