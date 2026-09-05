import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/security/rate-limit'
import { assertSameOrigin } from '@/lib/security/csrf'

// ── Intent classification ─────────────────────────────────
// Note: this storefront is browse-only (no cart/checkout/orders), so there is
// no order-tracking or payment-processing feature to answer questions about.
type Intent =
  | 'greeting'
  | 'refund'
  | 'shipping'
  | 'account'
  | 'contact_human'
  | 'fallback'

function classify(text: string): Intent {
  const t = text.toLowerCase()

  if (/\b(hi|hello|hey|howdy|good morning|good evening|namaste)\b/.test(t)) return 'greeting'
  if (/\b(talk to|speak to|human|agent|person|support staff|real person|connect me)\b/.test(t)) return 'contact_human'
  if (/\b(refund|return|cancel|exchange|money back|replacement)\b/.test(t)) return 'refund'
  if (/\b(shipping|delivery time|how long|when will|arrive|dispatch time)\b/.test(t)) return 'shipping'
  if (/\b(account|password|login|email|address|profile|reset)\b/.test(t)) return 'account'

  return 'fallback'
}

// ── Bot responses ─────────────────────────────────────────
const STATIC_REPLIES: Partial<Record<Intent, string>> = {
  greeting:
    "Hi there! 👋 I'm your store assistant. I can answer questions about our products, returns, and shipping.\n\nWhat can I help you with today?",
  refund:
    'For returns and refunds, please reach out to our support team with your details and we\'ll take care of it.\n\nNeed more help? Type "agent" to chat with our team. 📦',
  shipping:
    'Here\'s our shipping info:\n\n• Metro cities: 1–3 business days\n• Tier-2/3 cities: 3–5 business days\n• Remote areas: 5–8 business days\n\nDispatch times vary by order. 🚚',
  account:
    'For account help:\n\n• **Reset password**: Go to Login → Forgot Password\n• **Update address**: Account → Addresses\n• **Delete account**: Contact our support team\n\nType "agent" if you need direct assistance. 🔐',
  contact_human:
    'Connecting you to a support agent now… 🙋\n\nOur team is available **Mon–Sat, 10am–7pm IST**. An agent will join this chat shortly. You can also email us at leomedpharma1@gmail.com or call +91 63986 97503.',
}

// ── Main handler ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const limited = await rateLimit(req, 'default')
  if (limited) return limited

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { session_id, message } = body
  if (!session_id || !message) {
    return NextResponse.json({ error: 'session_id and message are required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Classify intent synchronously (zero latency) before hitting DB
  const intent = classify(message)
  const isFallback = intent === 'fallback'

  // Build secondary query based on intent — runs in parallel with session check
  const secondaryPromise: Promise<any> = isFallback
    ? supabase
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', session_id)
        .eq('sender_role', 'bot')
        .then(r => r.count ?? 0)
    : Promise.resolve(null)

  // Parallel: session check + secondary query
  const [sessionResult, secondaryData] = await Promise.all([
    supabase.from('chat_sessions').select('id, status').eq('id', session_id).single(),
    secondaryPromise,
  ])

  const session = sessionResult.data
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.status === 'closed') {
    return NextResponse.json({ replied: false, reason: 'session_closed' })
  }

  // Build reply text (sync — data already fetched)
  let replyText: string

  if (intent === 'contact_human') {
    replyText = STATIC_REPLIES.contact_human!
  } else if (isFallback) {
    const botCount = secondaryData as number
    replyText = botCount >= 2
      ? 'I wasn\'t able to fully understand your question. Let me connect you with a support agent who can help better. 🙋\n\nType "agent" anytime to reach a human directly, or email us at leomedpharma1@gmail.com or call +91 63986 97503.'
      : 'I\'m not sure I understand that. Could you rephrase?\n\nI can help with: **returns**, **shipping**, or **account issues**. Type "agent" to reach a human. 🤖'
  } else {
    replyText = STATIC_REPLIES[intent] ?? STATIC_REPLIES.fallback!
  }

  // For contact_human: session status update + message insert are independent — run in parallel
  const insertPromise = supabase.from('chat_messages').insert({
    session_id,
    sender_role: 'bot',
    body: replyText,
  })

  const [, { error }] = await Promise.all([
    intent === 'contact_human'
      ? supabase.from('chat_sessions').update({ status: 'open' }).eq('id', session_id)
      : Promise.resolve(null),
    insertPromise,
  ])

  if (error) {
    console.error('bot-reply insert error', error)
    return NextResponse.json({ error: 'Failed to save reply' }, { status: 500 })
  }

  return NextResponse.json({ replied: true, intent, escalated: intent === 'contact_human' })
}
