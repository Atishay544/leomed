import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@/lib/supabase/server'
import { assertSameOrigin } from '@/lib/security/csrf'
import { rateLimit } from '@/lib/security/rate-limit'

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

  // Membership requires a logged-in account (perks are tied to a user, not a guest order)
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: 'Please sign in to subscribe to Care Plan' }, { status: 401 })

  const supabase = await createServerClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Please sign in to subscribe to Care Plan' }, { status: 401 })

  const admin = createAdminClient()

  const { data: plan, error: planErr } = await admin
    .from('membership_plans')
    .select('id, name, price, duration_months')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (planErr || !plan) return NextResponse.json({ error: 'No active membership plan found' }, { status: 400 })

  // Block duplicate active membership
  const { data: existing } = await admin
    .from('user_memberships')
    .select('id, expires_at')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .gte('expires_at', new Date().toISOString())
    .maybeSingle()

  if (existing) return NextResponse.json({ error: 'You already have an active Care Plan membership' }, { status: 400 })

  const { data: membership, error: insertErr } = await admin
    .from('user_memberships')
    .insert({ user_id: user.id, plan_id: plan.id, status: 'pending' })
    .select('id')
    .single()

  if (insertErr || !membership) {
    console.error('Membership insert error:', insertErr)
    return NextResponse.json({ error: 'Failed to start subscription' }, { status: 500 })
  }

  let razorpayOrder: { id: string; amount: number; currency: string }
  try {
    razorpayOrder = await getRazorpay().orders.create({
      amount:   Math.round(Number(plan.price) * 100),
      currency: 'INR',
      receipt:  membership.id.slice(0, 40),
      notes: { membership_id: membership.id, user_id: user.id, plan_id: plan.id },
    })
  } catch (rzpErr: any) {
    await admin.from('user_memberships').delete().eq('id', membership.id)
    console.error('Razorpay order creation failed (membership):', rzpErr)
    const msg = rzpErr?.error?.description ?? rzpErr?.message ?? 'Payment gateway error. Please try again.'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  await admin
    .from('user_memberships')
    .update({ razorpay_order_id: razorpayOrder.id })
    .eq('id', membership.id)

  return NextResponse.json({
    membership_id: membership.id,
    plan: { name: plan.name, price: Number(plan.price), duration_months: plan.duration_months },
    razorpay_order: { id: razorpayOrder.id, amount: razorpayOrder.amount, currency: razorpayOrder.currency },
  })
}
