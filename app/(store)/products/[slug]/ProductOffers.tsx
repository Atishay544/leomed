'use client'

import { useState } from 'react'
import { formatPrice } from '@/lib/utils'
import { Tag, ChevronDown, ChevronUp } from 'lucide-react'

interface Offer {
  id: string
  title: string
  description: string | null
  type: string
  upfront_pct: number | null
  discount_pct: number | null
}

interface Props { price: number; initialOffers: Offer[] }

export default function ProductOffers({ price, initialOffers }: Props) {
  const [expanded, setExpanded]   = useState(false)
  const [checkedId, setCheckedId] = useState<string | null>(null)

  if (!initialOffers.length) return null

  const offers = initialOffers

  // Calculate COD upfront offer breakdown
  function calcBreakdown(offer: Offer) {
    if (offer.type !== 'cod_upfront' || !offer.upfront_pct || !offer.discount_pct) return null
    const upfront     = (price * offer.upfront_pct) / 100
    const remaining   = price - upfront
    const discounted  = remaining * (1 - offer.discount_pct / 100)
    const totalPayable = upfront + discounted
    const savings      = price - totalPayable
    return { upfront, remaining, discounted, totalPayable, savings }
  }

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-green-50 hover:bg-green-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Tag size={14} className="text-green-600" />
          <span className="text-sm font-semibold text-green-800">
            {offers.length} Offer{offers.length > 1 ? 's' : ''} Available
          </span>
        </div>
        {expanded
          ? <ChevronUp size={15} className="text-green-700" />
          : <ChevronDown size={15} className="text-green-700" />}
      </button>

      {/* Offer list */}
      {expanded && (
        <div className="divide-y divide-gray-100">
          {offers.map(offer => {
            const breakdown = calcBreakdown(offer)
            const isChecked = checkedId === offer.id
            return (
              <div key={offer.id} className="p-4 bg-white">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => setCheckedId(isChecked ? null : offer.id)}
                    className="mt-0.5 accent-green-600"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">{offer.title}</p>
                    {offer.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{offer.description}</p>
                    )}
                    {offer.type === 'cod_upfront' && (
                      <p className="text-xs text-green-700 mt-0.5 font-medium">
                        Pay {offer.upfront_pct}% now + get {offer.discount_pct}% off remaining COD amount
                      </p>
                    )}
                  </div>
                </label>

                {/* Calculation box */}
                {isChecked && breakdown && (
                  <div className="mt-3 ml-6 bg-green-50 border border-green-200 rounded-xl p-4 text-sm space-y-2">
                    <p className="font-semibold text-green-900 text-xs uppercase tracking-wide mb-3">Payment Breakdown</p>
                    <div className="flex justify-between text-gray-700">
                      <span>Total price</span>
                      <span className="font-medium">{formatPrice(price)}</span>
                    </div>
                    <div className="flex justify-between text-gray-700">
                      <span>Pay upfront ({offer.upfront_pct}%)</span>
                      <span className="font-semibold text-gray-900">{formatPrice(breakdown.upfront)}</span>
                    </div>
                    <div className="flex justify-between text-gray-700">
                      <span>Remaining amount</span>
                      <span>{formatPrice(breakdown.remaining)}</span>
                    </div>
                    <div className="flex justify-between text-green-700">
                      <span>{offer.discount_pct}% discount on remaining</span>
                      <span>-{formatPrice(breakdown.remaining - breakdown.discounted)}</span>
                    </div>
                    <div className="border-t border-green-300 pt-2 flex justify-between font-bold text-green-900">
                      <span>Pay on delivery</span>
                      <span>{formatPrice(breakdown.discounted)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-base text-green-800 bg-green-100 rounded-lg px-3 py-2 mt-1">
                      <span>Total payable</span>
                      <span>{formatPrice(breakdown.totalPayable)}</span>
                    </div>
                    <p className="text-center text-xs text-green-700 font-semibold">
                      🎉 You save {formatPrice(breakdown.savings)} with this offer!
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
