'use client'
import { useEffect, useState, useRef } from 'react'
import { X, Gift, Copy, Check } from 'lucide-react'

const POPUP_KEY   = 'lf_popup_seen'
const COUPON_CODE = 'WELCOME10'
const DELAY_MS    = 90_000   // 1.5 minutes
const OFFER_TIMER = 600      // 10-minute countdown on the offer itself (seconds)

function formatTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

export default function WelcomePopup() {
  const [visible, setVisible]       = useState(false)
  const [input, setInput]           = useState('')
  const [mode, setMode]             = useState<'email' | 'phone'>('email')
  const [error, setError]           = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]             = useState(false)
  const [copied, setCopied]         = useState(false)
  const [timer, setTimer]           = useState(OFFER_TIMER)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Show popup after delay (once per browser, not per session)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem(POPUP_KEY)) return

    const show = setTimeout(() => setVisible(true), DELAY_MS)
    return () => clearTimeout(show)
  }, [])

  // Countdown when popup is visible
  useEffect(() => {
    if (!visible || done) return
    timerRef.current = setInterval(() => {
      setTimer(t => {
        if (t <= 1) {
          dismiss()
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, done])

  function dismiss() {
    localStorage.setItem(POPUP_KEY, '1')
    setVisible(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const val = input.trim()
    if (!val) { setError('Please enter your ' + mode); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [mode]: val,
          source: 'welcome_popup',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msgs: Record<string, string> = {
          invalid_email: 'Please enter a valid email address.',
          invalid_phone: 'Please enter a valid 10-digit phone number.',
          email_or_phone_required: 'Please enter your email or phone.',
        }
        setError(msgs[data.error] ?? 'Something went wrong. Try again.')
      } else {
        setDone(true)
        localStorage.setItem(POPUP_KEY, '1')
        if (timerRef.current) clearInterval(timerRef.current)
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(COUPON_CODE)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* silent */ }
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 duration-300">

        {/* Top gradient bar */}
        <div className="h-1.5 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400" />

        {/* Close button */}
        <button
          onClick={dismiss}
          aria-label="Close offer"
          className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition"
        >
          <X size={18} />
        </button>

        <div className="px-6 pt-5 pb-6">
          {!done ? (
            <>
              {/* Header */}
              <div className="flex items-center gap-2 mb-1">
                <Gift size={20} className="text-amber-500 shrink-0" />
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Exclusive Welcome Offer</p>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 leading-tight mb-1">
                Get 10% off your first order
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Enter your email or phone to claim your discount code.
              </p>

              {/* Countdown */}
              <div className="flex items-center justify-center gap-2 mb-4 bg-amber-50 border border-amber-200 rounded-xl py-2 px-3">
                <span className="text-xs text-amber-700">Offer expires in</span>
                <span className="font-mono font-bold text-amber-700 text-sm tabular-nums">{formatTime(timer)}</span>
              </div>

              {/* Toggle email / phone */}
              <div className="flex gap-2 mb-3">
                {(['email', 'phone'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setMode(m); setInput(''); setError('') }}
                    className={`flex-1 text-xs py-1.5 rounded-lg border font-medium transition ${
                      mode === m
                        ? 'bg-black text-white border-black'
                        : 'text-gray-500 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {m === 'email' ? 'Email' : 'Phone'}
                  </button>
                ))}
              </div>

              {/* Input form */}
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <input
                    type={mode === 'email' ? 'email' : 'tel'}
                    value={input}
                    onChange={e => { setInput(e.target.value); setError('') }}
                    placeholder={mode === 'email' ? 'you@example.com' : '9876543210'}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black transition"
                    autoComplete={mode === 'email' ? 'email' : 'tel'}
                  />
                  {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-black text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-800 disabled:opacity-60 transition"
                >
                  {submitting ? 'Claiming…' : 'Claim My 10% Discount →'}
                </button>
              </form>

              <p className="text-center text-xs text-gray-400 mt-3">
                No spam. Unsubscribe any time.
              </p>
            </>
          ) : (
            /* Success state */
            <>
              <div className="text-center py-2">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Check size={24} className="text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-1">Your code is ready!</h2>
                <p className="text-sm text-gray-500 mb-4">Use this at checkout to get 10% off your order.</p>

                <button
                  onClick={copyCode}
                  className="inline-flex items-center gap-2 bg-black text-white px-6 py-2.5 rounded-xl font-mono font-bold text-lg hover:bg-gray-800 transition"
                >
                  {COUPON_CODE}
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
                <p className="text-xs text-gray-400 mt-2">{copied ? 'Copied!' : 'Tap to copy'}</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
