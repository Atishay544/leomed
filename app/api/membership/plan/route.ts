import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase/admin'

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ plan: null })

  const supabase = createPublicClient()
  const { data: plan } = await supabase
    .from('membership_plans')
    .select('name, price, duration_months, free_shipping, discount_pct')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ plan: plan ? { ...plan, price: Number(plan.price) } : null })
}
