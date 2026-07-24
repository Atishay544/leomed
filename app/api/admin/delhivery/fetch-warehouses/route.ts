import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { delhiveryListWarehouses } from '@/lib/carriers'

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const admin = createAdminClient()
  if (user.app_metadata?.role === 'admin') return true
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  return (profile as any)?.role === 'admin'
}

/**
 * POST { api_key, base_url? }
 * Fetches warehouse list from Delhivery using the provided key.
 * Used by the carrier form BEFORE the key is saved to DB.
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { api_key, base_url } = await req.json()
  if (!api_key?.trim()) return NextResponse.json({ error: 'api_key is required' }, { status: 400 })

  const result = await delhiveryListWarehouses({
    api_key: api_key.trim(),
    config: base_url ? { base_url } : {},
  } as any)

  return NextResponse.json(result)
}
