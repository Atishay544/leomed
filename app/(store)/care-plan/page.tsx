'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import Link from 'next/link'
import { useAuth } from '@/lib/hooks/useAuth'
import { api } from '@/lib/api'
import { formatPrice } from '@/lib/utils'
import { Check, Truck, Percent, Zap } from 'lucide-react'

declare global {
  interface Window { Razorpay: any }
}

interface Plan {
  name: string
  price: number
  duration_months: number
  free_shipping: boolean
  discount_pct: number
}

export default function CarePlanPage() {
  const { user, getToken, loading: authLoading } = useAuth()
  const router = useRouter()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [planLoading, setPlanLoading] = useState(true)
  const [planError, setPlanError] = useState(false)
  const [membershipLoading, setMembershipLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeUntil, setActiveUntil] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/membership/plan')
      .then(r => r.json())
      .then(d => setPlan(d.plan ?? null))
      .catch(() => setPlanError(true))
      .finally(() => setPlanLoading(false))
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!user) { setMembershipLoading(false); return }
    ;(async () => {
      try {
        const token = await getToken()
        const res = await fetch('/api/account/membership', { headers: { Authorization: `Bearer ${token}` } })
        const data = await res.json()
        if (data?.active) setActiveUntil(data.expires_at)
      } finally {
        setMembershipLoading(false)
      }
    })()
  }, [user, authLoading, getToken])

  async function handleSubscribe() {
    if (!user) { router.push('/login?redirect=/care-plan'); return }
    setLoading(true); setError('')
    try {
      const token = await getToken()
      const headers = { Authorization: `Bearer ${token}` }
      const res = await api.post<{
        membership_id: string
        plan: { name: string; price: number }
        razorpay_order: { id: string; amount: number; currency: string }
      }>('/api/membership/subscribe', {}, { headers })

      const options = {
        key:      process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount:   res.razorpay_order.amount,
        currency: res.razorpay_order.currency,
        name:     'Leomed Pharma',
        description: res.plan.name,
        order_id: res.razorpay_order.id,
        prefill:  { email: user.email ?? '' },
        theme:    { color: '#145c3a' },
        // Keep `loading` (and the disabled Subscribe button) true for the entire
        // time the payment popup is open, not just until it's constructed —
        // otherwise the button re-enables while payment is still in progress.
        modal: { ondismiss: () => setLoading(false) },
        handler: async (payment: any) => {
          try {
            await api.post('/api/membership/verify', {
              membership_id:       res.membership_id,
              razorpay_order_id:   payment.razorpay_order_id,
              razorpay_payment_id: payment.razorpay_payment_id,
              razorpay_signature:  payment.razorpay_signature,
            }, { headers })
            router.push('/account?membership=active')
          } catch {
            setLoading(false)
            setError('Payment succeeded but activation failed — contact support with your payment ID.')
          }
        },
      }
      new window.Razorpay(options).open()
    } catch (e: any) {
      setLoading(false)
      setError(e.message ?? 'Could not start subscription. Please try again.')
    }
  }

  const checkingStatus = authLoading || (!!user && membershipLoading)

  return (
    <div className="max-w-3xl mx-auto px-4 py-14">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <div className="text-center mb-10">
        <span className="inline-block bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-wide px-3 py-1 rounded-full mb-4">Care Plan</span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900">Save more on every order</h1>
        <p className="text-gray-600 mt-3">Join Leomed Pharma's Care Plan for member-only discounts on every order.</p>
      </div>

      {planLoading || checkingStatus ? (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 text-center text-gray-400 animate-pulse">
          Loading…
        </div>
      ) : activeUntil ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
          <p className="font-semibold text-emerald-900">You're already a Care Plan member 🎉</p>
          <p className="text-sm text-emerald-700 mt-1">Active until {new Date(activeUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      ) : plan ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-8">
          <div className="text-center mb-6">
            <p className="text-4xl font-extrabold text-gray-900">{formatPrice(plan.price)}</p>
            <p className="text-sm text-gray-500 mt-1">for {plan.duration_months} months</p>
          </div>
          <ul className="space-y-3 mb-8">
            <li className="flex items-center gap-3 text-sm text-gray-700">
              <Percent size={16} className="text-emerald-600 shrink-0" />
              {plan.discount_pct}% extra discount on every order
            </li>
            {plan.free_shipping && (
              <li className="flex items-center gap-3 text-sm text-gray-700">
                <Truck size={16} className="text-emerald-600 shrink-0" />
                Free shipping on all orders
              </li>
            )}
            <li className="flex items-center gap-3 text-sm text-gray-700">
              <Zap size={16} className="text-emerald-600 shrink-0" />
              Priority same-day dispatch
            </li>
            <li className="flex items-center gap-3 text-sm text-gray-700">
              <Check size={16} className="text-emerald-600 shrink-0" />
              Cancel anytime — no auto-renewal, renew manually when it expires
            </li>
          </ul>
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          <button
            onClick={handleSubscribe}
            disabled={loading}
            className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-3.5 rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? 'Starting…' : `Join for ${formatPrice(plan.price)}`}
          </button>
          {!user && <p className="text-xs text-gray-400 text-center mt-3">You'll be asked to sign in first.</p>}
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-gray-400">{planError ? 'Could not load Care Plan. Please check your connection.' : 'Care Plan is not available right now.'}</p>
          {planError && (
            <button onClick={() => location.reload()} className="mt-3 text-sm text-emerald-700 underline underline-offset-2">
              Try again
            </button>
          )}
        </div>
      )}

      <p className="text-center text-sm text-gray-400 mt-8">
        <Link href="/faq" className="hover:text-gray-600 underline underline-offset-2">Questions? See our FAQ</Link>
      </p>
    </div>
  )
}
