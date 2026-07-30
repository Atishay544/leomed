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
    .select('expires_at, membership_plans(name, discount_pct, free_shipping)')
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
    plan: membership.membership_plans,
  })
}
