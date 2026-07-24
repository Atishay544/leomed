import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/security/rate-limit'
import { assertSameOrigin } from '@/lib/security/csrf'

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const limited = await rateLimit(req, 'default')
  if (limited) return limited

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Login required to submit a review.' }, { status: 401 })

  const body = await req.json()
  const { product_id, rating, comment } = body

  if (!product_id || !rating || !comment?.trim()) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }
  if (rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Rating must be 1–5.' }, { status: 400 })
  }
  if (comment.trim().length < 10) {
    return NextResponse.json({ error: 'Review must be at least 10 characters.' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Check if user has already reviewed this product
  const { data: existing } = await admin
    .from('reviews')
    .select('id')
    .eq('product_id', product_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) return NextResponse.json({ error: 'You have already reviewed this product.' }, { status: 409 })

  // Check if user has purchased this product (order must be delivered or completed)
  const { data: orderItem } = await admin
    .from('order_items')
    .select('id, orders!inner(user_id, status)')
    .eq('product_id', product_id)
    .eq('orders.user_id', user.id)
    .in('orders.status', ['delivered', 'completed'])
    .limit(1)
    .maybeSingle()

  const isVerifiedPurchase = !!orderItem

  if (!isVerifiedPurchase) {
    return NextResponse.json({ error: 'You can only review products you have purchased and received.' }, { status: 403 })
  }

  const { error } = await admin.from('reviews').insert({
    product_id,
    user_id:              user.id,
    rating,
    comment:              comment.trim(),
    is_approved:          false,
    is_rejected:          false,
    is_verified_purchase: true,
  })

  if (error) {
    // Handle missing column gracefully — insert without it
    if (error.message.includes('is_verified_purchase')) {
      const { error: e2 } = await admin.from('reviews').insert({
        product_id,
        user_id:     user.id,
        rating,
        comment:     comment.trim(),
        is_approved: false,
        is_rejected: false,
      })
      if (e2) return NextResponse.json({ error: e2.message }, { status: 400 })
    } else {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
  }

  revalidateTag('reviews')
  return NextResponse.json({ success: true })
}
