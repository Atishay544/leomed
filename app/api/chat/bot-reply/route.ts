import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/security/rate-limit'
import { assertSameOrigin } from '@/lib/security/csrf'

// ── Intent classification ─────────────────────────────────
type Intent =
  | 'greeting'
  | 'order_status'
  | 'track_order'
  | 'refund'
  | 'shipping'
  | 'payment'
  | 'account'
  | 'contact_human'
  | 'fallback'

function classify(text: string): Intent {
  const t = text.toLowerCase()

  if (/\b(hi|hello|hey|howdy|good morning|good evening|namaste)\b/.test(t)) return 'greeting'
  if (/\b(talk to|speak to|human|agent|person|support staff|real person|connect me)\b/.test(t)) return 'contact_human'
  if (/\b(track|tracking|where is|courier|shipped|out for delivery|dispatch)\b/.test(t)) return 'track_order'
  if (/\b(order status|my order|order number|order id|placed order|check order)\b/.test(t)) return 'order_status'
  if (/\b(refund|return|cancel|exchange|money back|replacement)\b/.test(t)) return 'refund'
  if (/\b(shipping|delivery time|how long|when will|arrive|dispatch time)\b/.test(t)) return 'shipping'
  if (/\b(payment|paid|charge|bank|upi|card|razorpay|transaction)\b/.test(t)) return 'payment'
  if (/\b(account|password|login|email|address|profile|reset)\b/.test(t)) return 'account'

  return 'fallback'
}

// ── Bot responses ─────────────────────────────────────────
const STATIC_REPLIES: Partial<Record<Intent, string>> = {
  greeting:
    "Hi there! \ud83d\udc4b I'm your store assistant. I can help you track orders, check status, answer questions about returns, shipping, and more.\n\nWhat can I help you with today?",
  refund:
    'For returns and refunds:\n\n\u2022 We accept returns within **30 days** of delivery\n\u2022 Items must be unused and in original packaging\n\u2022 Refunds are processed in 3\u20135 business days\n\nTo initiate a return, log in \u2192 My Orders \u2192 select order \u2192 Request Return.\n\nNeed more help? Type "agent" to chat with our team. \ud83d\udce6',
  shipping:
    'Here\'s our shipping info:\n\n\u2022 **Free shipping** on orders above \u20b9499\n\u2022 Metro cities: 1\u20133 business days\n\u2022 Tier-2/3 cities: 3\u20135 business days\n\u2022 Remote areas: 5\u20138 business days\n\nOrders placed before 2 PM IST are usually dispatched the same day. \ud83d\ude9a',
  payment:
    'We accept all major credit/debit cards, UPI (GPay, PhonePe, Paytm), and net banking \u2014 all secured by Razorpay.\n\nIf your payment failed but money was deducted, it will automatically refund within 5\u20137 business days. For urgent help, type "agent". \ud83d\udcb3',
  account:
    'For account help:\n\n\u2022 **Reset password**: Go to Login \u2192 Forgot Password\n\u2022 **Update address**: Account \u2192 Addresses\n\u2022 **Delete account**: Contact our support team\n\nType "agent" if you need direct assistance. \ud83d\udd10',
  contact_human:
    'Connecting you to a support agent now\u2026 \ud83d\ude4b\n\nOur team is available **Mon\u2013Sat, 10am\u20137pm IST**. An agent will join this chat shortly. You can also email us at leomedpharma1@gmail.com or call +91 63986 97503.',
}

function buildOrderReply(
  userId: string | null,
  intent: Intent,
  orders: Array<{ id: string; status: string; total: any; created_at: string; tracking_number: string | null }> | null,
): string {
  if (!userId) {
    return intent === 'track_order'
      ? "To track your order, please **log in** to your account and visit My Orders. 🔐\n\nOr share your Order ID here and I'll try to look it up."
      : "To check your order details, please **log in** to your account and visit My Orders.\n\nNeed to log in? Visit /login 👆"
  }

  if (!orders || orders.length === 0) {
    return "I couldn't find any orders linked to your account. If you placed an order as a guest, please check your confirmation email for the order ID. 📧"
  }

  const latest = orders[0]
  const orderId = latest.id.slice(0, 8).toUpperCase()
  const statusEmoji: Record<string, string> = {
    pending: '⏳', confirmed: '✅', processing: '🔄', shipped: '🚚', delivered: '🎉', cancelled: '❌', refunded: '💰',
  }

  if (intent === 'track_order') {
    if (latest.tracking_number) {
      return `Your latest order **#${orderId}** is **${latest.status}** 📦\n\nTracking number: \`${latest.tracking_number}\`\n\nYou can also view full details in My Orders → Account.`
    }
    return `Your latest order **#${orderId}** is currently **${latest.status}** ${statusEmoji[latest.status] ?? ''}\n\nA tracking number will be added once your order is shipped. I'll make sure it appears in My Orders. 📦`
  }

  // order_status
  const lines = orders.slice(0, 3).map((o, i) => {
    const oid = o.id.slice(0, 8).toUpperCase()
    const emoji = statusEmoji[o.status] ?? '📦'
    const date = new Date(o.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
    return `${i + 1}. **#${oid}** — ${o.status} ${emoji} (${date}) — ₹${Number(o.total).toLocaleString('en-IN')}`
  })

  return `Here are your recent orders:\n\n${lines.join('\n')}\n\nFor full details, visit **My Orders** in your account. Type "track" for tracking info. 📋`
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

  // Resolve user_id from the authenticated session — never trust the request body.
  // Unauthenticated users get null (guest chat still works, just no order lookup).
  const { createServerClient } = await import('@/lib/supabase/server')
  const serverClient = await createServerClient()
  const { data: { user: authedUser } } = await serverClient.auth.getUser()
  const user_id = authedUser?.id ?? null

  const supabase = createAdminClient()

  // Classify intent synchronously (zero latency) before hitting DB
  const intent = classify(message)

  // Build secondary query based on intent — runs in parallel with session check
  const isOrderIntent = intent === 'order_status' || intent === 'track_order'
  const isFallback = intent === 'fallback'

  const secondaryPromise: Promise<any> = isOrderIntent && user_id
    ? supabase
        .from('orders')
        .select('id, status, total, created_at, tracking_number')
        .eq('user_id', user_id)
        .order('created_at', { ascending: false })
        .limit(3)
        .then(r => r.data)
    : isFallback
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

  if (isOrderIntent) {
    replyText = buildOrderReply(user_id ?? null, intent, secondaryData)
  } else if (intent === 'contact_human') {
    replyText = STATIC_REPLIES.contact_human!
  } else if (isFallback) {
    const botCount = secondaryData as number
    replyText = botCount >= 2
      ? 'I wasn\'t able to fully understand your question. Let me connect you with a support agent who can help better. \ud83d\ude4b\n\nType "agent" anytime to reach a human directly, or email us at leomedpharma1@gmail.com or call +91 63986 97503.'
      : 'I\'m not sure I understand that. Could you rephrase?\n\nI can help with: **order status**, **tracking**, **returns**, **shipping**, **payments**, or **account issues**. Type "agent" to reach a human. \ud83e\udd16'
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
