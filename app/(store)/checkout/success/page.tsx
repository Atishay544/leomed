'use client'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle, ShoppingBag, UserPlus, AlertCircle, Clock } from 'lucide-react'
import { Suspense } from 'react'

function SuccessContent() {
  const params    = useSearchParams()
  const orderId   = params.get('id')
  const failed    = params.get('payment') === 'failed'
  const isUpi     = params.get('payment') === 'upi'

  if (failed) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center space-y-5">
        <div className="flex justify-center">
          <AlertCircle size={56} className="text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Payment Failed</h1>
        <p className="text-gray-500 text-sm">
          Your order was created but the payment did not complete.
          {orderId && <> Order reference: <span className="font-mono font-semibold text-gray-800">{orderId.slice(0, 8).toUpperCase()}</span></>}
        </p>
        <p className="text-xs text-gray-400">Please try again or contact support.</p>
        <Link href="/cart"
          className="inline-block bg-black text-white px-8 py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition">
          Back to Cart
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-20 space-y-8">

      {/* Success header */}
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center">
            <CheckCircle size={44} className="text-green-500" strokeWidth={1.5} />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Order Placed!</h1>
        <p className="text-gray-500 text-sm">
          {isUpi
            ? 'Your order is confirmed. Payment will be verified by end of day.'
            : 'Your order has been received and is being processed.'}
        </p>
      </div>

      {/* Order ID card */}
      {orderId && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 text-center">
          <p className="text-xs text-gray-500 mb-1.5 uppercase tracking-wide font-medium">Your Order ID</p>
          <p className="font-mono text-lg font-bold text-gray-900 tracking-wide">
            {orderId.slice(0, 8).toUpperCase()}
          </p>
          <p className="text-xs text-gray-400 mt-1.5">Save this for tracking your order</p>
        </div>
      )}

      {/* UPI pending banner */}
      {isUpi && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-3">
          <Clock size={20} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-900 text-sm">Payment Verification Pending</p>
            <p className="text-amber-700 text-sm leading-relaxed">
              We have received your UTR. Our team will verify your payment and confirm your order by <strong>end of day</strong>. You will be notified once confirmed.
            </p>
          </div>
        </div>
      )}

      {/* Create account nudge */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <UserPlus size={18} className="text-emerald-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">Track your orders anytime</p>
            <p className="text-xs text-gray-500 mt-0.5">Create a free account to view order status, get updates, and reorder in one tap.</p>
          </div>
        </div>
        <Link
          href="/login?signup=1"
          className="w-full flex items-center justify-center gap-2 bg-emerald-700 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-800 transition">
          <UserPlus size={15} />
          Create Free Account
        </Link>
      </div>

      {/* Continue shopping */}
      <div className="text-center">
        <Link href="/products"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition">
          <ShoppingBag size={15} />
          Continue Shopping
        </Link>
      </div>

    </div>
  )
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  )
}
