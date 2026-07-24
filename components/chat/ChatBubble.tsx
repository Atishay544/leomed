'use client'

interface ChatBubbleProps {
  body: string
  sender_role: 'customer' | 'agent' | 'bot'
  created_at: string
  sender_name?: string
  dimmed?: boolean  // true while message is optimistic (not yet confirmed by DB)
}

// Simple markdown-like renderer: **bold**, newlines
function renderBody(text: string) {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    // Bold: **text**
    const parts = line.split(/\*\*([^*]+)\*\*/g)
    const rendered = parts.map((part, j) =>
      j % 2 === 1 ? <strong key={j}>{part}</strong> : part
    )
    return (
      <span key={i}>
        {rendered}
        {i < lines.length - 1 && <br />}
      </span>
    )
  })
}

export default function ChatBubble({ body, sender_role, created_at, sender_name, dimmed }: ChatBubbleProps) {
  const isCustomer = sender_role === 'customer'
  const isBot = sender_role === 'bot'

  const time = new Date(created_at).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className={`flex gap-2 ${isCustomer ? 'flex-row-reverse' : 'flex-row'} ${dimmed ? 'opacity-60' : ''}`}>
      {/* Avatar */}
      {!isCustomer && (
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-1
          ${isBot ? 'bg-emerald-100 text-emerald-700' : 'bg-green-100 text-green-700'}`}>
          {isBot ? '🤖' : (sender_name?.[0]?.toUpperCase() ?? 'A')}
        </div>
      )}

      <div className={`flex flex-col gap-0.5 max-w-[80%] ${isCustomer ? 'items-end' : 'items-start'}`}>
        {!isCustomer && (
          <span className="text-[10px] text-gray-400 px-1">
            {isBot ? 'Store Assistant' : (sender_name ?? 'Support Agent')}
          </span>
        )}
        <div
          className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
            isCustomer
              ? 'bg-gray-900 text-white rounded-br-sm'
              : isBot
                ? 'bg-emerald-50 text-gray-800 rounded-bl-sm border border-emerald-100'
                : 'bg-white text-gray-800 rounded-bl-sm border border-gray-200'
          }`}
        >
          {renderBody(body)}
        </div>
        <span className="text-[10px] text-gray-400 px-1">{time}</span>
      </div>
    </div>
  )
}
