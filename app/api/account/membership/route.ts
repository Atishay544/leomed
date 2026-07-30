import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ active: false })

  const supabase = await createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return NextResponse.json({ active: false })

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('user_memberships')
    .select('expires_at, discount_pct_snapshot, free_shipping_snapshot, membership_plans(name)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .gte('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!membership) return NextResponse.json({ active: false })

  return NextResponse.json({
    active: true,
    expires_at: membership.expires_at,
    plan: {
      name: (membership.membership_plans as any)?.name,
      discount_pct: membership.discount_pct_snapshot,
      free_shipping: membership.free_shipping_snapshot,
    },
  })
}
