'use client'
import { useState, useRef, useEffect } from 'react'
import { useCartStore } from '@/lib/store/cart'
import { useAuth } from '@/lib/hooks/useAuth'
import { formatPrice } from '@/lib/utils'
import { UPI_ID, QR_IMAGE_PATH } from '@/lib/payment-config'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import Script from 'next/script'
import Link from 'next/link'
import { Tag, CreditCard, Truck, Zap, Check, LogIn, Smartphone } from 'lucide-react'

declare global {
  interface Window { Razorpay: any }
}

interface Address {
  name: string; phone: string; line1: string; line2: string
  city: string; state: string; pincode: string
}

interface Offer {
  id: string; title: string; description: string | null
  type: string; upfront_pct: number | null; discount_pct: number | null
}

type PaymentMethod = 'online' | 'cod' | 'cod_upfront' | 'upi' | 'partial_cod'

const COD_LIMIT = 7000
const PARTIAL_COD_PCT = 20

const EMPTY_ADDRESS: Address = { name: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '' }

export default function CheckoutPage() {
  const { items, total, clearCart } = useCartStore()
  const { user, getToken } = useAuth()
  const router = useRouter()

  const [address, setAddress]           = useState<Address>(EMPTY_ADDRESS)
  const [guestEmail, setGuestEmail]     = useState('')
  const honeypotRef                     = useRef<HTMLInputElement>(null)
  const [coupon, setCoupon]             = useState('')
  const [couponResult, setCouponResult] = useState<{ discount: number; code: string } | null>(null)
  const [couponError, setCouponError]   = useState('')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')
  const [offers, setOffers]             = useState<Offer[]>([])

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('online')
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null)
  const [utrNumber, setUtrNumber]         = useState('')

  useEffect(() => {
    fetch('/api/offers').then(r => r.json()).then(j => setOffers(j.data ?? []))
  }, [])

  // Pre-fill address from last order for logged-in users
  useEffect(() => {
    if (!user) return
    fetch('/api/account/address')
      .then(r => r.json())
      .then(j => {
        if (j.address) setAddress(prev => {
          const isEmpty = Object.values(prev).every(v => v === '')
          return isEmpty ? { ...EMPTY_ADDRESS, ...j.address } : prev
        })
      })
      .catch(() => {})
  }, [user])

  const subtotal   = total()
  const discount   = couponResult?.discount ?? 0
  const grandTotal = Math.max(0, subtotal - discount)

  const isCodRestricted = grandTotal > COD_LIMIT
  const partialCodAdvance = Math.round(grandTotal * PARTIAL_COD_PCT) / 100
  const partialCodOnDelivery = grandTotal - partialCodAdvance

  const codOffers = offers.filter(o => o.type === 'cod_upfront')
  const upiAmount = paymentMethod === 'partial_cod' ? partialCodAdvance : grandTotal

  const codBreakdown = paymentMethod === 'cod_upfront' && selectedOffer?.upfront_pct && selectedOffer?.discount_pct
    ? (() => {
        const upfront    = (grandTotal * selectedOffer.upfront_pct!) / 100
        const remaining  = grandTotal - upfront
        const discounted = remaining * (1 - selectedOffer.discount_pct! / 100)
        return { upfront, remaining, discounted, totalPayable: upfront + discounted, savings: grandTotal - (upfront + discounted) }
      })()
    : null

  function selectPaymentMethod(method: PaymentMethod, offer?: Offer) {
    setPaymentMethod(method)
    setSelectedOffer(method === 'cod_upfront' && offer ? offer : null)
    setError('')
  }

  async function applyCoupon() {
    if (!coupon.trim()) return
    try {
      const res = await api.post<{ discount: number }>('/api/checkout/validate-coupon', {
        code: coupon.trim(), subtotal,
      })
      setCouponResult({ discount: res.discount, code: coupon.trim().toUpperCase() })
      setCouponError('')
    } catch (e: any) {
      setCouponError(e.message ?? 'Invalid coupon')
      setCouponResult(null)
    }
  }

  async function handleCheckout() {
    if (honeypotRef.current?.value) { setError('Something went wrong. Please try again.'); return }

    const required: (keyof Address)[] = ['name', 'phone', 'line1', 'city', 'state', 'pincode']
    for (const f of required) {
      if (!address[f].trim()) { setError(`${f.charAt(0).toUpperCase() + f.slice(1)} is required`); return }
    }
    // Phone: must be at least 10 digits after stripping non-numeric
    const phoneDigits = address.phone.replace(/\D/g, '')
    if (phoneDigits.length < 10) { setError('Enter a valid 10-digit phone number'); return }

    // Email required for guests
    if (!user && !guestEmail.trim()) { setError('Email is required for order confirmation'); return }
    if (!user && guestEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) {
      setError('Enter a valid email address'); return
    }

    if (paymentMethod === 'upi' || paymentMethod === 'partial_cod') {
      const utr = utrNumber.trim().toUpperCase()
      if (!utr) { setError('Please enter your UTR / Transaction ID after paying'); return }
      if (!/^[A-Z0-9]{12,22}$/.test(utr)) { setError('UTR must be 12–22 alphanumeric characters — copy it exactly from your UPI app'); return }
      const fakePattern = /^(.)\1{11,}$|^0+$|^(TEST|FAKE|DEMO|XXXX|ABCD)/i
      if (fakePattern.test(utr)) { setError('Please enter your actual UTR / Transaction ID from your UPI app'); return }
    }

    setError('')
    setLoading(true)

    try {
      const token = user ? await getToken() : null
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      if (paymentMethod === 'upi' || paymentMethod === 'partial_cod') headers['x-payment-hint'] = 'upi'

      const res = await api.post<{
        order_id: string
        payment_method: string
        razorpay_order?: { id: string; amount: number; currency: string }
      }>('/api/checkout', {
        items:            items.map(i => ({ product_id: i.id, quantity: i.quantity, price: i.price, variant_attributes: i.variantAttributes ?? null })),
        shipping_address: address,
        guest_email:      !user ? (guestEmail.trim() || null) : undefined,
        coupon_code:      couponResult?.code,
        payment_method:   paymentMethod,
        offer_id:         selectedOffer?.id ?? null,
        utr_number:       (paymentMethod === 'upi' || paymentMethod === 'partial_cod') ? utrNumber.trim().toUpperCase() : undefined,
        total_hint:       grandTotal,
      }, { headers })

      const successPath = user
        ? `/account/orders/${res.order_id}?success=1`
        : `/checkout/success?id=${res.order_id}`

      if (res.payment_method === 'cod') {
        clearCart()
        router.push(successPath)
        return
      }

      if (res.payment_method === 'upi' || res.payment_method === 'partial_cod') {
        clearCart()
        router.push(`/checkout/success?id=${res.order_id}&payment=upi`)
        return
      }

      if (!res.razorpay_order) { setError('Payment gateway error. Please try again.'); return }

      const options = {
        key:      process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount:   res.razorpay_order.amount,
        currency: res.razorpay_order.currency,
        name:     'Leomed Pharma',
        description: `Order #${res.order_id}`,
        order_id: res.razorpay_order.id,
        prefill:  { name: address.name, contact: address.phone, email: user?.email ?? guestEmail },
        theme:    { color: '#145c3a' },
        handler: async (payment: any) => {
          try {
            await api.post('/api/checkout/verify', {
              order_id:             res.order_id,
              razorpay_order_id:    payment.razorpay_order_id,
              razorpay_payment_id:  payment.razorpay_payment_id,
              razorpay_signature:   payment.razorpay_signature,
            }, { headers })
            clearCart()
            router.push(successPath)
          } catch {
            router.push(`/checkout/success?id=${res.order_id}&payment=failed`)
          }
        },
      }
      new window.Razorpay(options).open()
    } catch (e: any) {
      setError(e.message ?? 'Checkout failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <p className="text-xl font-semibold mb-4">Your cart is empty</p>
        <a href="/products" className="text-sm underline text-gray-600">Back to shopping</a>
      </div>
    )
  }

  const payNow = paymentMethod === 'partial_cod'
    ? partialCodAdvance
    : codBreakdown
      ? codBreakdown.upfront
      : grandTotal

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-6 lg:py-10">
        <h1 className="text-2xl font-bold mb-5 sm:mb-8">Checkout</h1>
        <div className="grid lg:grid-cols-5 gap-5 lg:gap-8">

          {/* ── Left Column ─────────────────────────────────────────────────── */}
          <div className="lg:col-span-3 space-y-4 sm:space-y-6">

            {/* Sign-in nudge for guests */}
            {!user && (
              <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5">
                <span className="text-sm text-gray-600">Already have an account?</span>
                <Link href="/login?redirect=/checkout"
                  className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 hover:text-emerald-700 transition-colors">
                  <LogIn size={14} />
                  Sign in for faster checkout
                </Link>
              </div>
            )}

            {/* Address */}
            <div className="border rounded-2xl p-4 sm:p-6">
              <h2 className="font-semibold text-lg mb-4">Delivery Address</h2>
              <div style={{ display: 'none' }} aria-hidden="true">
                <input ref={honeypotRef} name="lf_confirm_email" tabIndex={-1}
                  autoComplete="new-password" readOnly />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <Field label="Full Name" value={address.name} onChange={v => setAddress(a => ({ ...a, name: v }))} span={2} />
                <div className="col-span-2 sm:col-span-1">
                  <PhoneField value={address.phone} onChange={v => setAddress(a => ({ ...a, phone: v }))} />
                </div>
                <Field label="Pincode" value={address.pincode} onChange={v => setAddress(a => ({ ...a, pincode: v }))} mobileSpan={2} />
                <Field label="Address Line 1" value={address.line1} onChange={v => setAddress(a => ({ ...a, line1: v }))} span={2} />
                <Field label="Address Line 2 (optional)" value={address.line2} onChange={v => setAddress(a => ({ ...a, line2: v }))} span={2} />
                <Field label="City" value={address.city} onChange={v => setAddress(a => ({ ...a, city: v }))} />
                <Field label="State" value={address.state} onChange={v => setAddress(a => ({ ...a, state: v }))} />

                {/* Optional email for guests */}
                {!user && (
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Email <span className="text-red-400">*</span></label>
                    <input
                      type="email"
                      value={guestEmail}
                      onChange={e => setGuestEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Payment Method */}
            <div className="border rounded-2xl p-4 sm:p-6">
              <h2 className="font-semibold text-lg mb-4">Payment Method</h2>
              <div className="space-y-3">
                <PaymentCard
                  selected={paymentMethod === 'online'}
                  onClick={() => selectPaymentMethod('online')}
                  icon={<CreditCard size={20} className="text-blue-600" />}
                  title="Pay Online"
                  subtitle="UPI, Credit/Debit Card, Net Banking, Wallets"
                  badge={<span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5 font-medium">Instant Confirmation</span>}
                />
                <PaymentCard
                  selected={paymentMethod === 'cod'}
                  onClick={() => !isCodRestricted && selectPaymentMethod('cod')}
                  disabled={isCodRestricted}
                  icon={<Truck size={20} className="text-orange-600" />}
                  title="Cash on Delivery"
                  subtitle={isCodRestricted
                    ? `Not available for orders above ₹${COD_LIMIT.toLocaleString('en-IN')} — use Partial COD below`
                    : 'Pay when your order arrives at your doorstep'}
                  badge={isCodRestricted
                    ? <span className="text-xs bg-red-50 text-red-600 border border-red-200 rounded-full px-2 py-0.5 font-medium">Unavailable above ₹{COD_LIMIT.toLocaleString('en-IN')}</span>
                    : <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5 font-medium">No advance payment</span>}
                />
                {isCodRestricted && (
                  <PaymentCard
                    selected={paymentMethod === 'partial_cod'}
                    onClick={() => selectPaymentMethod('partial_cod')}
                    icon={<Smartphone size={20} className="text-amber-600" />}
                    title="Partial COD — Pay advance via UPI"
                    subtitle={`Pay ${PARTIAL_COD_PCT}% (${formatPrice(partialCodAdvance)}) now via UPI + ${formatPrice(partialCodOnDelivery)} cash on delivery`}
                    badge={<span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 font-medium">20% advance via UPI</span>}
                  />
                )}
                <PaymentCard
                  selected={paymentMethod === 'upi'}
                  onClick={() => selectPaymentMethod('upi')}
                  icon={<Smartphone size={20} className="text-purple-600" />}
                  title="UPI Transfer"
                  subtitle="Pay via GPay, PhonePe, Paytm, BHIM or any UPI app"
                  badge={<span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5 font-medium">No extra charges</span>}
                />
                {codOffers.map(offer => (
                  <PaymentCard
                    key={offer.id}
                    selected={paymentMethod === 'cod_upfront' && selectedOffer?.id === offer.id}
                    onClick={() => selectPaymentMethod('cod_upfront', offer)}
                    icon={<Zap size={20} className="text-green-600" />}
                    title={offer.title}
                    subtitle={offer.description ?? `Pay ${offer.upfront_pct}% now, rest on delivery with ${offer.discount_pct}% off`}
                    badge={<span className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5 font-medium">Save {offer.discount_pct}% on COD</span>}
                  />
                ))}
              </div>

              {codBreakdown && selectedOffer && (
                <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4 text-sm space-y-1.5">
                  <p className="font-semibold text-green-900 text-xs uppercase tracking-wide mb-2">Payment Breakdown</p>
                  <div className="flex justify-between text-gray-700">
                    <span>Pay upfront ({selectedOffer.upfront_pct}%)</span>
                    <span className="font-semibold">{formatPrice(codBreakdown.upfront)}</span>
                  </div>
                  <div className="flex justify-between text-gray-700">
                    <span>Remaining</span>
                    <span>{formatPrice(codBreakdown.remaining)}</span>
                  </div>
                  <div className="flex justify-between text-green-700">
                    <span>{selectedOffer.discount_pct}% off remaining</span>
                    <span>-{formatPrice(codBreakdown.remaining - codBreakdown.discounted)}</span>
                  </div>
                  <div className="flex justify-between text-gray-700 border-t border-green-300 pt-1.5">
                    <span>Pay on delivery</span>
                    <span className="font-semibold">{formatPrice(codBreakdown.discounted)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-green-900 bg-green-100 rounded-lg px-3 py-2 mt-1">
                    <span>Total payable</span>
                    <span>{formatPrice(codBreakdown.totalPayable)}</span>
                  </div>
                  <p className="text-center text-xs text-green-700 font-medium pt-1">
                    You save {formatPrice(codBreakdown.savings)} on this order!
                  </p>
                </div>
              )}
            </div>

            {/* UPI QR + UTR panel — shown for both UPI and Partial COD */}
            {(paymentMethod === 'upi' || paymentMethod === 'partial_cod') && (
              <div className={`border rounded-2xl p-4 sm:p-6 space-y-5 ${paymentMethod === 'partial_cod' ? 'border-amber-200' : 'border-purple-200'}`}>
                <div>
                  <h2 className="font-semibold text-lg">
                    {paymentMethod === 'partial_cod' ? `Scan & Pay Advance — ${formatPrice(partialCodAdvance)}` : 'Scan & Pay'}
                  </h2>
                  {paymentMethod === 'partial_cod' && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                      Pay only the 20% advance now. Remaining {formatPrice(partialCodOnDelivery)} will be collected cash on delivery.
                    </p>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="bg-white p-3 rounded-xl border border-gray-200 shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={QR_IMAGE_PATH} alt="UPI QR Code" width={160} height={160} className="w-40 h-40 object-contain" />
                  </div>
                  <ol className="space-y-2 text-sm text-gray-700 list-none">
                    <li>1. Open <strong>GPay / PhonePe / Paytm</strong></li>
                    <li>2. Scan QR or pay to UPI ID:</li>
                    <li>
                      <span className={`inline-block font-mono border rounded-lg px-3 py-1.5 font-semibold select-all text-xs ${paymentMethod === 'partial_cod' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-purple-50 border-purple-200 text-purple-900'}`}>
                        {UPI_ID}
                      </span>
                    </li>
                    <li>3. Pay exactly <strong>₹{upiAmount.toFixed(2)}</strong></li>
                    <li>4. Copy the <strong>UTR / Transaction ID</strong> from your app</li>
                    <li>5. Paste it below and place order</li>
                  </ol>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
                    UTR / Transaction ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={utrNumber}
                    onChange={e => setUtrNumber(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
                    placeholder="e.g. 421612345678"
                    maxLength={24}
                    className={`w-full border rounded-xl px-4 py-3 text-sm font-mono tracking-wider focus:outline-none bg-white ${paymentMethod === 'partial_cod' ? 'border-gray-300 focus:ring-2 focus:ring-amber-500' : 'border-gray-300 focus:ring-2 focus:ring-purple-500'}`}
                  />
                  <p className="text-xs text-gray-400 mt-1.5">
                    Open your UPI app → Recent transactions → Copy the 12-digit UTR/Ref number
                  </p>
                </div>
              </div>
            )}

          </div>

          {/* ── Right Column: Order Summary ──────────────────────────────────── */}
          <div className="lg:col-span-2">
            <div className="bg-gray-50 rounded-2xl p-4 sm:p-6 lg:sticky lg:top-24">
              <h2 className="font-bold text-lg mb-4">Order Summary</h2>
              <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                {items.map(i => (
                  <div key={`${i.id}-${i.variantLabel ?? ''}`} className="flex justify-between text-sm">
                    <span className="text-gray-600 truncate flex-1 mr-2">
                      {i.name} × {i.quantity}
                      {i.variantLabel && <span className="block text-xs text-gray-400">{i.variantLabel}</span>}
                    </span>
                    <span className="font-medium shrink-0">{formatPrice(i.price * i.quantity)}</span>
                  </div>
                ))}
              </div>

              {/* Coupon inside summary */}
              <div className="border-t pt-3 mb-3">
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
                    <Tag size={13} className="text-gray-400 ml-2.5 shrink-0" />
                    <input
                      value={coupon}
                      onChange={e => setCoupon(e.target.value.toUpperCase())}
                      placeholder="Coupon code"
                      className="flex-1 px-2 py-2 text-sm uppercase tracking-wider outline-none bg-transparent"
                    />
                  </div>
                  <button onClick={applyCoupon}
                    className="bg-black text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition shrink-0">
                    Apply
                  </button>
                </div>
                {couponError && <p className="text-red-500 text-xs mt-1.5">{couponError}</p>}
                {couponResult && (
                  <p className="text-green-600 text-xs mt-1.5 font-medium flex items-center gap-1">
                    ✓ Coupon applied — you save {formatPrice(couponResult.discount)}
                  </p>
                )}
              </div>

              <div className="border-t pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Coupon discount</span>
                    <span>-{formatPrice(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base border-t pt-2 mt-2">
                  <span>Total</span>
                  <span>{formatPrice(grandTotal)}</span>
                </div>
                <p className="text-[11px] text-gray-400 pt-1">Prices inclusive of all taxes (GST)</p>
              </div>

              <div className="mt-3 pt-3 border-t">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  {paymentMethod === 'online' && <><CreditCard size={14} className="text-blue-600" /><span>Pay online via Razorpay</span></>}
                  {paymentMethod === 'cod' && <><Truck size={14} className="text-orange-600" /><span>Cash on Delivery</span></>}
                  {paymentMethod === 'cod_upfront' && <><Zap size={14} className="text-green-600" /><span>Pay {formatPrice(codBreakdown?.upfront ?? 0)} now + {formatPrice(codBreakdown?.discounted ?? 0)} on delivery</span></>}
                  {paymentMethod === 'partial_cod' && <><Smartphone size={14} className="text-amber-600" /><span>Pay {formatPrice(partialCodAdvance)} via UPI + {formatPrice(partialCodOnDelivery)} on delivery</span></>}
                  {paymentMethod === 'upi' && <><Smartphone size={14} className="text-purple-600" /><span>UPI Transfer</span></>}
                </div>
              </div>

              {error && <p className="text-red-500 text-sm mt-3">{error}</p>}

              <button onClick={handleCheckout} disabled={loading}
                className="mt-4 w-full bg-black text-white py-3.5 rounded-xl font-semibold hover:bg-gray-800 transition disabled:opacity-50">
                {loading
                  ? 'Processing…'
                  : paymentMethod === 'cod'
                    ? `Place Order — Pay ${formatPrice(grandTotal)} on Delivery`
                    : paymentMethod === 'upi'
                      ? `Place Order — UPI ₹${grandTotal.toFixed(2)}`
                      : paymentMethod === 'partial_cod'
                        ? `Place Order — Pay ${formatPrice(partialCodAdvance)} via UPI (${PARTIAL_COD_PCT}% Advance)`
                        : paymentMethod === 'cod_upfront' && codBreakdown
                          ? `Pay ${formatPrice(codBreakdown.upfront)} Now`
                          : `Pay ${formatPrice(grandTotal)}`}
              </button>

              <p className="text-center text-xs text-gray-400 mt-3">
                {paymentMethod === 'cod' ? 'Order confirmed instantly' : paymentMethod === 'upi' ? 'Payment verified by end of day' : 'Secured by Razorpay'}
              </p>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}

// ── +91 Phone Field ───────────────────────────────────────────────────────────
function PhoneField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Strip leading +91 for display; store as +91XXXXXXXXXX
  const digits = value.replace(/^\+91/, '').replace(/\D/g, '').slice(0, 10)
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">Phone</label>
      <div className="flex border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-black transition">
        <span className="bg-gray-50 px-3 flex items-center text-gray-600 text-sm border-r border-gray-200 shrink-0">+91</span>
        <input
          type="tel"
          value={digits}
          onChange={e => {
            const d = e.target.value.replace(/\D/g, '').slice(0, 10)
            onChange(`+91${d}`)
          }}
          placeholder="10-digit number"
          maxLength={10}
          className="flex-1 px-3 py-2 text-sm outline-none bg-white"
        />
      </div>
    </div>
  )
}

// ── Payment Card ──────────────────────────────────────────────────────────────
function PaymentCard({ selected, onClick, icon, title, subtitle, badge, disabled }: {
  selected: boolean; onClick: () => void
  icon: React.ReactNode; title: string; subtitle: string
  badge?: React.ReactNode; disabled?: boolean
}) {
  return (
    <div onClick={disabled ? undefined : onClick}
      className={`border rounded-xl p-4 transition-all ${
        disabled
          ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
          : selected
            ? 'border-black bg-black/3 ring-1 ring-black cursor-pointer'
            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 cursor-pointer'
      }`}>
      <div className="flex items-center gap-3">
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
          selected ? 'border-black bg-black' : 'border-gray-300'
        }`}>
          {selected && <Check size={11} className="text-white" strokeWidth={3} />}
        </div>
        <div className="text-gray-700 shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            {badge}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
    </div>
  )
}

// ── Generic Text Field ────────────────────────────────────────────────────────
function Field({ label, value, onChange, span, mobileSpan }: {
  label: string; value: string; onChange: (v: string) => void; span?: number; mobileSpan?: number
}) {
  const cls = span === 2
    ? 'col-span-2'
    : mobileSpan === 2
      ? 'col-span-2 sm:col-span-1'
      : ''
  return (
    <div className={cls}>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
    </div>
  )
}
