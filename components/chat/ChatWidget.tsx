'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import ChatBubble from './ChatBubble'
import { MessageCircle, X, Send, Loader2 } from 'lucide-react'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface ChatMessage {
  id: string
  session_id: string
  sender_id: string | null
  sender_role: 'customer' | 'agent' | 'bot'
  body: string
  is_read: boolean
  created_at: string
  _optimistic?: boolean  // temp flag for messages not yet confirmed by DB
}

interface GuestInfo {
  name: string
  email: string
}

type ChatStep = 'closed' | 'guest-form' | 'open'

// Singleton client — stable across renders, no channel churn
let _supabase: ReturnType<typeof createClient> | null = null
function getSupabase() {
  if (!_supabase) _supabase = createClient()
  return _supabase
}

export default function ChatWidget() {
  const supabase = useMemo(() => getSupabase(), [])

  const [step, setStep] = useState<ChatStep>('closed')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [botTyping, setBotTyping] = useState(false)
  const [loading, setLoading] = useState(false)
  const [guestInfo, setGuestInfo] = useState<GuestInfo>({ name: '', email: '' })
  const [unreadCount, setUnreadCount] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingBotReply = useRef(false)

  // Check auth state on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null)
    })
  }, [supabase])

  // Restore session from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('chat_session_id')
    if (saved) setSessionId(saved)
  }, [])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, botTyping])

  // Subscribe to realtime when sessionId is set
  useEffect(() => {
    if (!sessionId) return

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const channel = supabase
      .channel(`chat:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const msg = payload.new as ChatMessage

          setMessages((prev) => {
            // Already exists (exact id match) — skip
            if (prev.some((m) => m.id === msg.id && !m._optimistic)) return prev
            // Replace optimistic version of our own message
            if (msg.sender_role === 'customer') {
              const hasOptimistic = prev.some((m) => m._optimistic && m.body === msg.body)
              if (hasOptimistic) {
                return prev.map((m) =>
                  m._optimistic && m.body === msg.body ? { ...msg } : m
                )
              }
            }
            return [...prev.filter((m) => !m._optimistic || m.body !== msg.body), msg]
          })

          // Hide bot typing when bot/agent reply arrives
          if (msg.sender_role !== 'customer') {
            setBotTyping(false)
            pendingBotReply.current = false
            if (step !== 'open') setUnreadCount((c) => c + 1)
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Channel is live — nothing to do
        }
      })

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [sessionId, supabase])  // eslint-disable-line react-hooks/exhaustive-deps

  // Load message history
  const loadMessages = useCallback(async (sid: string) => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sid)
      .order('created_at', { ascending: true })
      .limit(100)

    if (data) setMessages(data as ChatMessage[])
  }, [supabase])

  // Open chat
  const handleOpen = async () => {
    setUnreadCount(0)
    setStep('open')

    if (sessionId) {
      setLoading(true)
      await loadMessages(sessionId)
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
      return
    }

    if (userId) {
      setLoading(true)
      await createSession(null)
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
      return
    }

    setStep('guest-form')
  }

  const handleClose = () => setStep('closed')

  // Create a new chat session
  const createSession = async (guest: GuestInfo | null) => {
    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({
        user_id: userId ?? null,
        guest_name: guest?.name ?? null,
        guest_email: guest?.email ?? null,
        status: 'open',
      })
      .select('id')
      .single()

    if (error || !data) {
      console.error('Failed to create chat session', error)
      return
    }

    const sid = data.id
    setSessionId(sid)
    localStorage.setItem('chat_session_id', sid)

    // Give realtime channel a moment to subscribe before welcome msg
    await new Promise(r => setTimeout(r, 300))

    await supabase.from('chat_messages').insert({
      session_id: sid,
      sender_id: null,
      sender_role: 'bot',
      body: "Hi! 👋 I'm your store assistant. I can help you with:\n• Order status & tracking\n• Returns & refunds\n• Shipping information\n• Payment questions\n\nType your question or type **\"agent\"** to reach our support team.",
    })

    await loadMessages(sid)
  }

  // Submit guest form
  const handleGuestSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!guestInfo.name.trim()) return
    setLoading(true)
    setStep('open')
    await createSession(guestInfo)
    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  // Send a message
  const handleSend = async () => {
    const text = inputText.trim()
    if (!text || !sessionId || sending) return

    setSending(true)
    setInputText('')

    // Optimistic update — message appears immediately
    const tempId = `temp-${Date.now()}`
    const optimisticMsg: ChatMessage = {
      id: tempId,
      session_id: sessionId,
      sender_id: userId ?? null,
      sender_role: 'customer',
      body: text,
      is_read: false,
      created_at: new Date().toISOString(),
      _optimistic: true,
    }
    setMessages((prev) => [...prev, optimisticMsg])
    setSending(false)
    inputRef.current?.focus()

    // Insert to DB (realtime will replace optimistic msg)
    const { error } = await supabase.from('chat_messages').insert({
      session_id: sessionId,
      sender_id: userId ?? null,
      sender_role: 'customer',
      body: text,
    })

    if (error) {
      console.error('Failed to send message', error)
      // Remove optimistic msg on failure
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      setInputText(text)
      return
    }

    // Show bot typing indicator while waiting for reply
    pendingBotReply.current = true
    setBotTyping(true)

    // Trigger bot reply — realtime will deliver the response
    fetch('/api/chat/bot-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, message: text, user_id: userId }),
    }).catch(() => {
      // Bot unavailable — hide typing indicator
      setBotTyping(false)
      pendingBotReply.current = false
    })

    // Safety fallback: hide typing indicator after 10s even if realtime event never fires
    setTimeout(() => {
      if (pendingBotReply.current) {
        setBotTyping(false)
        pendingBotReply.current = false
      }
    }, 10_000)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="fixed bottom-5 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end gap-3">
      {/* Chat window */}
      {(step === 'open' || step === 'guest-form') && (
        <div
          className="w-[min(320px,calc(100vw-2rem))] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          style={{ height: '420px' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-sm font-semibold">Support Chat</span>
            </div>
            <button
              onClick={handleClose}
              className="p-1 rounded-lg hover:bg-gray-700 transition-colors"
              aria-label="Close chat"
            >
              <X size={16} />
            </button>
          </div>

          {/* Guest form */}
          {step === 'guest-form' && (
            <form onSubmit={handleGuestSubmit} className="flex flex-col gap-3 p-5 flex-1">
              <p className="text-sm text-gray-700 font-medium">Before we begin, please introduce yourself:</p>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Your Name *</label>
                <input
                  type="text"
                  value={guestInfo.name}
                  onChange={(e) => setGuestInfo((g) => ({ ...g, name: e.target.value }))}
                  placeholder="John Doe"
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Email (optional)</label>
                <input
                  type="email"
                  value={guestInfo.email}
                  onChange={(e) => setGuestInfo((g) => ({ ...g, email: e.target.value }))}
                  placeholder="john@example.com"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <button
                type="submit"
                className="mt-auto w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-gray-700 transition-colors"
              >
                Start Chat
              </button>
            </form>
          )}

          {/* Messages area */}
          {step === 'open' && (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 size={20} className="animate-spin text-gray-400" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-center text-xs text-gray-400 mt-8">No messages yet. Say hello!</p>
                ) : (
                  messages.map((msg) => (
                    <ChatBubble
                      key={msg.id}
                      body={msg.body}
                      sender_role={msg.sender_role}
                      created_at={msg.created_at}
                      dimmed={msg._optimistic}
                    />
                  ))
                )}

                {/* Bot typing indicator */}
                {botTyping && (
                  <div className="flex items-end gap-2">
                    <div className="bg-blue-50 border border-blue-100 px-3 py-2 rounded-2xl rounded-bl-sm">
                      <div className="flex items-center gap-1 h-4">
                        <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {/* Input bar */}
              <div className="flex items-center gap-2 px-3 py-3 border-t border-gray-100 bg-white shrink-0">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  disabled={sending}
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:opacity-60"
                />
                <button
                  onClick={handleSend}
                  disabled={!inputText.trim() || sending}
                  className="p-2 bg-gray-900 text-white rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  aria-label="Send message"
                >
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={step === 'closed' ? handleOpen : handleClose}
        className="relative w-14 h-14 bg-gray-900 text-white rounded-full shadow-lg hover:bg-gray-700 active:scale-95 transition-all flex items-center justify-center"
        aria-label={step === 'closed' ? 'Open chat' : 'Close chat'}
      >
        {step === 'closed' ? <MessageCircle size={24} /> : <X size={22} />}
        {step === 'closed' && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  )
}
