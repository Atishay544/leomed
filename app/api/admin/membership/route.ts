import { adminGuard } from '@/lib/security/admin-guard'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const body = await req.json()
  const { id, name, price, duration_months, free_shipping, discount_pct, is_active } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const payload: Record<string, any> = {}
  if (name             !== undefined) payload.name             = name
  if (price            !== undefined) payload.price            = parseFloat(price)
  if (duration_months  !== undefined) payload.duration_months  = parseInt(duration_months, 10)
  if (free_shipping    !== undefined) payload.free_shipping    = !!free_shipping
  if (discount_pct     !== undefined) payload.discount_pct     = parseFloat(discount_pct)
  if (is_active        !== undefined) payload.is_active        = !!is_active

  const { data, error } = await admin.from('membership_plans').update(payload).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
