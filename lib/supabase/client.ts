import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // Fallback prevents @supabase/ssr from throwing during build-time SSR
  // when env vars are not yet configured in Vercel. Queries fail gracefully;
  // pages regenerate at request time via revalidate once env vars are set.
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'
  )
}
