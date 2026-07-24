import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/security/rate-limit'
import { assertSameOrigin } from '@/lib/security/csrf'

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const limited = await rateLimit(req, 'contact')
  if (limited) return limited

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const { name, email, subject, message, order_id } = body

  if (!name?.trim() || !email?.trim() || !subject?.trim() || !message?.trim()) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (message.trim().length > 1000) {
    return NextResponse.json({ error: 'Message too long (max 1000 characters)' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Create chat session as support ticket
  const sessionBody: Record<string, any> = {
    guest_name: name.trim(),
    guest_email: email.trim(),
    subject: subject.trim(),
    source: 'contact_form',
    status: 'open',
  }

  const { data: session, error: sessionErr } = await supabase
    .from('chat_sessions')
    .insert(sessionBody)
    .select('id')
    .single()

  if (sessionErr) {
    console.error('contact: session insert error', sessionErr)
    return NextResponse.json({ error: 'Failed to create support ticket' }, { status: 500 })
  }

  // First message with full details
  const fullMessage = [
    `Subject: ${subject.trim()}`,
    order_id ? `Order ID: ${order_id.trim()}` : null,
    '',
    message.trim(),
  ].filter(Boolean).join('\n')

  const { error: msgErr } = await supabase.from('chat_messages').insert({
    session_id: session.id,
    sender_role: 'customer',
    body: fullMessage,
  })

  if (msgErr) {
    console.error('contact: message insert error', msgErr)
    // Session was created — don't fail the whole request
  }

  return NextResponse.json({ success: true, session_id: session.id })
}
