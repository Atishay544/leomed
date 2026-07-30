import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const supabase = await createServerClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { membership_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json()
  if (!membership_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ error: 'Missing payment fields' }, { status: 400 })
  }

  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex')

  if (expectedSignature !== razorpay_signature) {
    console.error('Razorpay signature mismatch for membership:', membership_id)
    return NextResponse.json({ error: 'Payment verification failed' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: membership, error: fetchErr } = await admin
    .from('user_memberships')
    .select('id, status, razorpay_order_id, user_id, plan_id, membership_plans(duration_months)')
    .eq('id', membership_id)
    .eq('user_id', user.id)
    .single()

  if (fetchErr || !membership) return NextResponse.json({ error: 'Membership not found' }, { status: 404 })
  if (membership.razorpay_order_id !== razorpay_order_id) {
    return NextResponse.json({ error: 'Order ID mismatch' }, { status: 400 })
  }

  // Idempotency
  if (membership.status === 'active') return NextResponse.json({ success: true })

  const durationMonths = (membership.membership_plans as any)?.duration_months ?? 3
  const startedAt = new Date()
  const expiresAt = new Date(startedAt)
  expiresAt.setMonth(expiresAt.getMonth() + durationMonths)

  const { error: updateErr } = await admin
    .from('user_memberships')
    .update({
      status:              'active',
      razorpay_payment_id,
      started_at:          startedAt.toISOString(),
      expires_at:          expiresAt.toISOString(),
    })
    .eq('id', membership_id)

  if (updateErr) {
    console.error('Membership activation error:', updateErr)
    return NextResponse.json({ error: 'Failed to activate membership' }, { status: 500 })
  }

  return NextResponse.json({ success: true, expires_at: expiresAt.toISOString() })
}
