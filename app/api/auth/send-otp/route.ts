import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendOtpEmail } from '@/lib/email'
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

  let email: string
  try {
    ;({ email } = await req.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })

  const normalEmail = email.trim().toLowerCase()

  // Generate our own 6-digit OTP (always exactly 6 digits)
  const otp = String(randomInt(100000, 1000000))
  const otpHash = hashOtp(otp)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  const db = serviceClient()

  const { error: upsertErr } = await db
    .from('pending_login_otps')
    .upsert({ email: normalEmail, otp_hash: otpHash, expires_at: expiresAt })

  if (upsertErr) {
    console.error('[send-otp] upsert failed:', upsertErr.message)
    return NextResponse.json({ error: 'Could not generate code. Please try again.' }, { status: 500 })
  }

  try {
    await sendOtpEmail({ to: email.trim(), otp })
  } catch (e: any) {
    console.error('[email] OTP send failed:', e?.message)
    await db.from('pending_login_otps').delete().eq('email', normalEmail)
    return NextResponse.json({ error: 'Failed to send email. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
