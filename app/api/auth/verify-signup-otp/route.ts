import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/security/rate-limit'
import { createHash } from 'crypto'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function hashOtp(otp: string) {
  return createHash('sha256').update(otp).digest('hex')
}

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, 'otp')
  if (limited) return limited

  let email: string, otp: string, password: string
  try {
    ;({ email, otp, password } = await req.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  if (!email || !otp || !password)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  const normalEmail = email.trim().toLowerCase()
  const db = serviceClient()

  // Fetch pending signup record
  const { data: pending, error: fetchErr } = await db
    .from('pending_signups')
    .select('otp_hash, full_name, expires_at')
    .eq('email', normalEmail)
    .single()

  if (fetchErr || !pending)
    return NextResponse.json({ error: 'No pending signup found. Please start over.' }, { status: 400 })

  // Check expiry
  if (new Date(pending.expires_at) < new Date())
    return NextResponse.json({ error: 'Verification code has expired. Please request a new one.' }, { status: 400 })

  // Validate OTP
  if (hashOtp(otp.trim()) !== pending.otp_hash)
    return NextResponse.json({ error: 'Incorrect code. Please try again.' }, { status: 400 })

  // OTP valid — now create the Supabase user (email already confirmed)
  const { error: createErr } = await db.auth.admin.createUser({
    email: normalEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: pending.full_name },
  })

  if (createErr) {
    // User may have been created in a parallel request
    if (createErr.message.toLowerCase().includes('already registered') ||
        createErr.message.toLowerCase().includes('already been registered')) {
      // Still clean up pending row
      await db.from('pending_signups').delete().eq('email', normalEmail)
      return NextResponse.json({ error: 'An account with this email already exists. Please sign in.' }, { status: 409 })
    }
    console.error('[signup] createUser failed:', createErr.message)
    return NextResponse.json({ error: 'Failed to create account. Please try again.' }, { status: 500 })
  }

  // Remove pending row
  await db.from('pending_signups').delete().eq('email', normalEmail)

  return NextResponse.json({ success: true })
}
