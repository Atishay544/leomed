import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

// GET /api/account/address
// Returns the saved_address for the currently-authenticated user.
// Cookies are sent automatically on same-origin requests — no Bearer token needed.
export async function GET() {
  const supabase = await createServerClient()

  // Reads JWT from the session cookie — no extra network call to Supabase auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ address: null })

  // Use the user-scoped client with RLS (no admin client needed for own profile)
  const { data: profile } = await supabase
    .from('profiles')
    .select('saved_address')
    .eq('id', user.id)
    .single()

  return NextResponse.json({ address: profile?.saved_address ?? null })
}
