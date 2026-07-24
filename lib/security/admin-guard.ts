import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertSameOrigin } from './csrf'

/**
 * Combined admin auth + CSRF guard for API routes.
 * Returns { admin } on success, or a NextResponse error to return immediately.
 *
 * Usage:
 *   const guard = await adminGuard(req)
 *   if (guard instanceof NextResponse) return guard
 *   const { admin } = guard
 */
export async function adminGuard(req: NextRequest): Promise<
  { admin: ReturnType<typeof createAdminClient> } | NextResponse
> {
  // 1. CSRF — reject cross-origin state-mutating requests
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  // 2. Auth — local JWT decode from cookie (~1ms, no Supabase API call)
  const supabase = await createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 3. Role — app_metadata is server-set and RS256-signed, cannot be forged
  const admin = createAdminClient()
  if (user.app_metadata?.role === 'admin') return { admin }

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return { admin }
}
