'use client'

import { useState, useRef } from 'react'
import { CheckCircle2 } from 'lucide-react'

const SUBJECTS = [
  'Order issue',
  'Payment problem',
  'Return / Refund request',
  'Damaged / Wrong item',
  'Delivery delay',
  'Account help',
  'Product enquiry',
  'Other',
]

export default function ContactForm() {
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [orderId, setOrderId] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError]     = useState('')
  const honeypotRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (honeypotRef.current?.value) return // bot
    if (!name.trim() || !email.trim() || !subject || !message.trim()) {
      setError('Please fill in all required fields.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), subject, message: message.trim(), order_id: orderId.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send message')
      setSuccess(true)
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <CheckCircle2 size={48} className="text-green-500 mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Message sent!</h3>
        <p className="text-gray-600 max-w-sm">We've received your message and will get back to you within 4 business hours. Check your email for a confirmation.</p>
        <button onClick={() => { setSuccess(false); setName(''); setEmail(''); setSubject(''); setMessage(''); setOrderId('') }}
          className="mt-6 text-sm text-gray-500 underline underline-offset-2 hover:text-black">
          Send another message
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Honeypot */}
      <input ref={honeypotRef} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
        className="absolute opacity-0 pointer-events-none h-0 w-0" />

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} required
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
        <select value={subject} onChange={e => setSubject(e.target.value)} required
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white">
          <option value="">Select a topic…</option>
          {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Order ID <span className="text-gray-400 font-normal">(optional)</span></label>
        <input value={orderId} onChange={e => setOrderId(e.target.value)} placeholder="e.g. 3f8a2c1d"
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Message *</label>
        <textarea value={message} onChange={e => setMessage(e.target.value)} required rows={5}
          placeholder="Describe your issue in as much detail as possible…"
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
        <p className="text-xs text-gray-400 mt-1">{message.length} / 1000 characters</p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <button type="submit" disabled={loading}
        className="w-full bg-black text-white py-3 rounded-xl font-medium hover:bg-gray-800 transition disabled:opacity-50">
        {loading ? 'Sending…' : 'Send Message'}
      </button>
      <p className="text-xs text-gray-400 text-center">We respond within 4 business hours (Mon–Sat, 10am–7pm IST)</p>
    </form>
  )
}
