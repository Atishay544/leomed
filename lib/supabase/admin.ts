import { createClient } from '@supabase/supabase-js'

// Singletons — reused across requests in the same Node.js worker process.
// These clients carry no per-request state so sharing is safe.
let _adminClient: ReturnType<typeof createClient> | null = null
let _publicClient: ReturnType<typeof createClient> | null = null

// Service-role client — bypasses RLS, server-side only, never expose to browser
export function createAdminClient() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return _adminClient
}

// Cookie-free anon client — safe to use inside unstable_cache callbacks
// Only for public read queries that don't require user auth
export function createPublicClient() {
  if (!_publicClient) {
    _publicClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return _publicClient
}
