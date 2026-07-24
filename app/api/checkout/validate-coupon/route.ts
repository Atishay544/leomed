import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { code, subtotal } = body

  if (!code || typeof subtotal !== 'number') {
    return NextResponse.json({ error: 'Missing code or subtotal' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: coupon, error } = await admin
    .from('coupons')
    .select('code, type, value, min_order, max_uses, uses_count, expires_at')
    .eq('code', code.trim().toUpperCase())
    .eq('is_active', true)
    .maybeSingle()

  if (error || !coupon) {
    return NextResponse.json({ error: 'Invalid or expired coupon code' }, { status: 400 })
  }

  // Check expiry
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This coupon has expired' }, { status: 400 })
  }

  // Check max uses
  if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses) {
    return NextResponse.json({ error: 'This coupon has reached its usage limit' }, { status: 400 })
  }

  // Check minimum order
  const minOrder = Number(coupon.min_order ?? 0)
  if (subtotal < minOrder) {
    return NextResponse.json(
      { error: `Minimum order of ₹${minOrder.toLocaleString('en-IN')} required for this coupon` },
      { status: 400 }
    )
  }

  // Calculate discount
  let discount = 0
  if (coupon.type === 'percentage') {
    discount = Math.round((subtotal * Number(coupon.value)) / 100 * 100) / 100
  } else {
    discount = Math.min(Number(coupon.value), subtotal)
  }

  return NextResponse.json({
    discount,
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
  })
}
