'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Send, Loader2, CheckCircle, Clock, MessageSquare, User } from 'lucide-react'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Singleton — prevents channel churn on re-renders
let _supabase: ReturnType<typeof createClient> | null = null
function getSupabase() {
  if (!_supabase) _supabase = createClient()
  return _supabase
}

interface ChatSession {
  id: string
  user_id: string | null
  guest_name: string | null
  guest_email: string | null
  status: 'open' | 'closed'
  created_at: string
  updated_at: string
}

interface ChatMessage {
  id: string
  session_id: string
  sender_id: string | null
  sender_role: 'customer' | 'agent' | 'bot'
  body: string
  is_read: boolean
  created_at: string
}

interface Props {
  initialSessions: ChatSession[]
  adminId: string
}

export default function AdminChatPanel({ initialSessions, adminId }: Props) {
  const supabase = useMemo(() => getSupabase(), [])

  const [sessions, setSessions] = useState<ChatSession[]>(initialSessions)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'open' | 'closed' | 'all'>('open')

  const bottomRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const sessionsChannelRef = useRef<RealtimeChannel | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Subscribe to new sessions in realtime
  useEffect(() => {
    const channel = supabase
      .channel('admin:chat_sessions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_sessions' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setSessions((prev) => [payload.new as ChatSession, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            setSessions((prev) =>
              prev.map((s) => (s.id === payload.new.id ? (payload.new as ChatSession) : s))
            )
          }
        }
      )
      .subscribe()

    sessionsChannelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  // Subscribe to messages for selected session
  useEffect(() => {
    if (!selectedId) return

    if (channelRef.current) supabase.removeChannel(channelRef.current)

    const channel = supabase
      .channel(`admin:chat:${selectedId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `session_id=eq.${selectedId}`,
        },
        (payload) => {
          const msg = payload.new as ChatMessage
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev
            return [...prev, msg]
          })
        }
      )
      .subscribe()

    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [selectedId, supabase])

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadMessages = useCallback(async (sid: string) => {
    setLoadingMessages(true)
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sid)
      .order('created_at', { ascending: true })
      .limit(200)

    setMessages((data as ChatMessage[]) ?? [])
    setLoadingMessages(false)
  }, [])

  const handleSelectSession = async (session: ChatSession) => {
    setSelectedId(session.id)
    setInputText('')
    await loadMessages(session.id)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const handleSend = async () => {
    const text = inputText.trim()
    if (!text || !selectedId || sending) return

    setSending(true)
    setInputText('')

    const { error } = await supabase.from('chat_messages').insert({
      session_id: selectedId,
      sender_id: adminId,
      sender_role: 'agent',
      body: text,
    })

    if (error) {
      console.error('Failed to send message', error)
      setInputText(text)
    }

    setSending(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleResolve = async (sessionId: string) => {
    setClosingId(sessionId)
    const { error } = await supabase
      .from('chat_sessions')
      .update({ status: 'closed' })
      .eq('id', sessionId)

    if (error) {
      console.error('Failed to close session', error)
    } else {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: 'closed' } : s))
      )
    }
    setClosingId(null)
  }

  const filteredSessions = sessions.filter((s) => {
    if (filter === 'all') return true
    return s.status === filter
  })

  const selectedSession = sessions.find((s) => s.id === selectedId) ?? null

  const getSessionLabel = (s: ChatSession) =>
    s.guest_name ?? s.guest_email ?? `User ${s.id.slice(0, 6)}`

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Chat Support</h1>

      <div className="flex gap-4 h-[calc(100vh-180px)] min-h-[500px]">
        {/* Session list */}
        <div className="w-80 shrink-0 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden">
          {/* Filter tabs */}
          <div className="flex border-b border-gray-100 px-2 pt-2">
            {(['open', 'closed', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 py-2 text-xs font-medium capitalize rounded-t transition-colors ${
                  filter === f
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Sessions */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {filteredSessions.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-400">No {filter} sessions</div>
            ) : (
              filteredSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => handleSelectSession(session)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                    selectedId === session.id ? 'bg-gray-50 border-l-2 border-gray-900' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                      session.status === 'open' ? 'bg-green-100' : 'bg-gray-100'
                    }`}>
                      <User size={14} className={session.status === 'open' ? 'text-green-700' : 'text-gray-500'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {getSessionLabel(session)}
                      </p>
                      {session.guest_email && (
                        <p className="text-xs text-gray-400 truncate">{session.guest_email}</p>
                      )}
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {session.status === 'open' ? (
                          <span className="flex items-center gap-1 text-[10px] text-green-600">
                            <Clock size={10} /> Open
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] text-gray-400">
                            <CheckCircle size={10} /> Closed
                          </span>
                        )}
                        <span className="text-[10px] text-gray-300">·</span>
                        <span className="text-[10px] text-gray-400">
                          {new Date(session.created_at).toLocaleDateString('en-US', { dateStyle: 'short' })}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Message pane */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden">
          {!selectedSession ? (
            <div className="flex flex-col items-center justify-center flex-1 text-gray-400 gap-3">
              <MessageSquare size={40} strokeWidth={1.2} />
              <p className="text-sm">Select a session to view messages</p>
            </div>
          ) : (
            <>
              {/* Session header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {getSessionLabel(selectedSession)}
                  </p>
                  {selectedSession.guest_email && (
                    <p className="text-xs text-gray-400">{selectedSession.guest_email}</p>
                  )}
                </div>
                {selectedSession.status === 'open' && (
                  <button
                    onClick={() => handleResolve(selectedSession.id)}
                    disabled={closingId === selectedSession.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-60"
                  >
                    {closingId === selectedSession.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <CheckCircle size={12} />
                    )}
                    Mark Resolved
                  </button>
                )}
                {selectedSession.status === 'closed' && (
                  <span className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-500 text-xs rounded-lg">
                    <CheckCircle size={12} /> Resolved
                  </span>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-gray-50">
                {loadingMessages ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 size={20} className="animate-spin text-gray-400" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-center text-xs text-gray-400 mt-8">No messages in this session yet.</p>
                ) : (
                  messages.map((msg) => {
                    const isAgent = msg.sender_role === 'agent'
                    const isBot = msg.sender_role === 'bot'
                    const isCustomer = msg.sender_role === 'customer'
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col gap-0.5 ${isCustomer ? 'items-start' : 'items-end'}`}
                      >
                        {!isCustomer && (
                          <span className="text-xs text-gray-400 px-1">
                            {isBot ? 'Bot' : 'You (Support)'}
                          </span>
                        )}
                        {isCustomer && (
                          <span className="text-xs text-gray-400 px-1">Customer</span>
                        )}
                        <div
                          className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                            isCustomer
                              ? 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
                              : isBot
                              ? 'bg-blue-50 text-blue-800 rounded-br-sm'
                              : 'bg-gray-900 text-white rounded-br-sm'
                          }`}
                        >
                          {msg.body}
                        </div>
                        <span className="text-[10px] text-gray-400 px-1">
                          {new Date(msg.created_at).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    )
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 bg-white shrink-0">
                {selectedSession.status === 'closed' ? (
                  <p className="text-sm text-gray-400 text-center w-full py-1">
                    This session is closed.
                  </p>
                ) : (
                  <>
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Reply as Support..."
                      disabled={sending}
                      className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:opacity-60"
                    />
                    <button
                      onClick={handleSend}
                      disabled={!inputText.trim() || sending}
                      className="p-2 bg-gray-900 text-white rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                      aria-label="Send reply"
                    >
                      {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
