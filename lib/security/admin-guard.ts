import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertSameOrigin } from './csrf'

/**
 * Combined admin auth + CSRF guard for API routes.
 * Returns { admin } on success, or a NextResponse error to return immediately.
 *
 * Admin here means ERP staff with role = 'ADMIN' — the storefront catalogue
 * and content management share the same staff identity as the ERP, there is
 * no separate customer/admin account system any more.
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

  // 2. Auth — getUser() revalidates against Supabase Auth (not just a local
  // cookie decode) since a revoked/deactivated staff account must not reach
  // catalogue-write endpoints.
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 3. Role — read from erp_users, the single source of truth for staff roles.
  const admin = createAdminClient()
  const { data: staff } = await admin
    .from('erp_users')
    .select('role')
    .eq('auth_user_id', user.id)
    .eq('active', true)
    .maybeSingle()

  if ((staff as { role?: string } | null)?.role !== 'ADMIN')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return { admin }
}
