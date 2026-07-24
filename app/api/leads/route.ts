import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/security/rate-limit'
import { assertSameOrigin } from '@/lib/security/csrf'

export const runtime = 'nodejs'

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

function isValidPhone(v: string) {
  // Accept 10-digit Indian numbers (with optional +91 / 0 prefix)
  return /^(\+91|0)?[6-9]\d{9}$/.test(v.replace(/\s/g, ''))
}

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const limited = await rateLimit(req, 'default')
  if (limited) return limited

  try {
    const { email, phone, source } = await req.json()

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : null
    const cleanPhone = typeof phone === 'string' ? phone.trim() : null

    if (!cleanEmail && !cleanPhone) {
      return NextResponse.json({ error: 'email_or_phone_required' }, { status: 400 })
    }
    if (cleanEmail && !isValidEmail(cleanEmail)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    }
    if (cleanPhone && !isValidPhone(cleanPhone)) {
      return NextResponse.json({ error: 'invalid_phone' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { error } = await supabase.from('leads').insert({
      email: cleanEmail || null,
      phone: cleanPhone || null,
      source: typeof source === 'string' ? source.slice(0, 64) : 'welcome_popup',
    })

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
