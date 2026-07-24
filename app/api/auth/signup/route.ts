import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSignupOtpEmail } from '@/lib/email'
import { rateLimit } from '@/lib/security/rate-limit'
import { createHash, randomInt } from 'crypto'

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

  let email: string, password: string, fullName: string
  try {
    ;({ email, password, fullName } = await req.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  if (!password || password.length < 6)
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })

  const normalEmail = email.trim().toLowerCase()
  const db = serviceClient()

  // Generate 6-digit OTP — do NOT create a Supabase user yet
  const otp = String(randomInt(100000, 1000000)).padStart(6, '0')
  const otpHash = hashOtp(otp)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 min

  // Upsert into pending_signups (re-registration before expiry is allowed)
  const { error: upsertErr } = await db
    .from('pending_signups')
    .upsert({ email: normalEmail, otp_hash: otpHash, full_name: fullName?.trim() ?? '', expires_at: expiresAt })

  if (upsertErr) {
    console.error('[signup] pending_signups upsert failed:', upsertErr.message)
    return NextResponse.json({ error: 'Could not initiate signup. Please try again.' }, { status: 500 })
  }

  try {
    await sendSignupOtpEmail({ to: email.trim(), name: fullName?.trim(), otp })
  } catch (e: any) {
    console.error('[email] signup OTP send failed:', e?.message)
    // Clean up pending row so user can retry
    await db.from('pending_signups').delete().eq('email', normalEmail)
    return NextResponse.json({ error: 'Failed to send verification email. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
