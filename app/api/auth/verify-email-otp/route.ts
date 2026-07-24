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

  let email: string, otp: string
  try {
    ;({ email, otp } = await req.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  if (!email || !otp)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  const normalEmail = email.trim().toLowerCase()
  const db = serviceClient()

  // Fetch pending OTP record
  const { data: pending, error: fetchErr } = await db
    .from('pending_login_otps')
    .select('otp_hash, expires_at')
    .eq('email', normalEmail)
    .single()

  if (fetchErr || !pending)
    return NextResponse.json({ error: 'No active code found. Please request a new one.' }, { status: 400 })

  if (new Date(pending.expires_at) < new Date())
    return NextResponse.json({ error: 'Code has expired. Please request a new one.' }, { status: 400 })

  if (hashOtp(otp.trim()) !== pending.otp_hash)
    return NextResponse.json({ error: 'Incorrect code. Please try again.' }, { status: 400 })

  // OTP valid — generate a magic link so the client can create a session
  // generateLink does NOT send any email; action_link is returned only to us
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.leomedpharma.in'}/auth/callback?next=/account`
  const { data: linkData, error: linkErr } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email: normalEmail,
    options: { redirectTo },
  })

  if (linkErr || !linkData?.properties?.action_link) {
    console.error('[verify-email-otp] generateLink failed:', linkErr?.message)
    return NextResponse.json({ error: 'Could not create session. Please try again.' }, { status: 500 })
  }

  // Clean up pending record
  await db.from('pending_login_otps').delete().eq('email', normalEmail)

  return NextResponse.json({ redirectTo: linkData.properties.action_link })
}
