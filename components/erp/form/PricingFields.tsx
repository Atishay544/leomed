'use client'

import { useState } from 'react'
import { inputClass } from './Field'

interface Props {
  initial?: Record<string, unknown>
  errors?: Record<string, string[] | undefined>
}

function toNum(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : 0
}

/** % off MRP that this price represents. */
function pctFromPrice(mrp: number, price: number): string {
  if (mrp <= 0) return ''
  return (((mrp - price) / mrp) * 100).toFixed(2)
}

/** The price that a given % off MRP works out to. */
function priceFromPct(mrp: number, pct: number): string {
  if (mrp <= 0) return ''
  return (mrp * (1 - pct / 100)).toFixed(2)
}

/**
 * MRP, Distributor Price, and Retailer Price — each of the two trade prices
 * is bidirectionally linked to a "% off MRP" figure the same way a discount
 * calculator works: type the price and the % updates, type the % and the
 * price updates. Both come out of the same MRP, so changing MRP recomputes
 * both prices from their last-known percentages.
 *
 * Only mrp / distributor_price / retailer_price are real form fields (named
 * inputs submitted with the rest of the form) — the percentage inputs and
 * the retailer-margin line are pure UI convenience, computed client-side,
 * never sent to the server.
 */
export default function PricingFields({ initial, errors }: Props) {
  const [mrp, setMrp]           = useState(String(initial?.mrp ?? ''))
  const [distPrice, setDistPrice] = useState(String(initial?.distributor_price ?? ''))
  const [retPrice, setRetPrice]   = useState(String(initial?.retailer_price ?? ''))
  const [distPct, setDistPct]     = useState(() => pctFromPrice(toNum(initial?.mrp), toNum(initial?.distributor_price)))
  const [retPct, setRetPct]       = useState(() => pctFromPrice(toNum(initial?.mrp), toNum(initial?.retailer_price)))

  function onMrpChange(value: string) {
    setMrp(value)
    const m = toNum(value)
    // Preserve each trade partner's agreed discount % when MRP changes,
    // rather than leaving stale prices that no longer match the stated %.
    if (distPct !== '') setDistPrice(priceFromPct(m, toNum(distPct)))
    if (retPct !== '')  setRetPrice(priceFromPct(m, toNum(retPct)))
  }

  function onDistPriceChange(value: string) {
    setDistPrice(value)
    setDistPct(pctFromPrice(toNum(mrp), toNum(value)))
  }

  function onDistPctChange(value: string) {
    setDistPct(value)
    setDistPrice(priceFromPct(toNum(mrp), toNum(value)))
  }

  function onRetPriceChange(value: string) {
    setRetPrice(value)
    setRetPct(pctFromPrice(toNum(mrp), toNum(value)))
  }

  function onRetPctChange(value: string) {
    setRetPct(value)
    setRetPrice(priceFromPct(toNum(mrp), toNum(value)))
  }

  const distNum = toNum(distPrice)
  const retNum  = toNum(retPrice)
  const retailerMarginOverDistributor = distNum > 0 ? (((retNum - distNum) / distNum) * 100).toFixed(2) : null

  const errClass = 'mt-1 text-[11.5px] text-red-600'
  const labelClass = 'mb-1 block text-[12px] font-medium text-gray-700'

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3">
      <div>
        <label htmlFor="mrp" className={labelClass}>
          MRP (₹) <span className="ml-0.5 text-red-500">*</span>
        </label>
        <input
          id="mrp" name="mrp" type="number" step="0.01" min="0" required
          value={mrp} onChange={e => onMrpChange(e.target.value)}
          className={`${inputClass} text-base sm:text-[13px] max-w-40`}
        />
        {errors?.mrp && <p className={errClass}>{errors.mrp[0]}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="distributor_price" className={labelClass}>
            Price to Distributor (₹) <span className="ml-0.5 text-red-500">*</span>
          </label>
          <input
            id="distributor_price" name="distributor_price" type="number" step="0.01" min="0" required
            value={distPrice} onChange={e => onDistPriceChange(e.target.value)}
            className={`${inputClass} text-base sm:text-[13px]`}
          />
          {errors?.distributor_price && <p className={errClass}>{errors.distributor_price[0]}</p>}
        </div>
        <div>
          <label htmlFor="distributor_pct" className={labelClass}>% off MRP</label>
          <input
            id="distributor_pct" type="number" step="0.01" min="0" max="100"
            value={distPct} onChange={e => onDistPctChange(e.target.value)}
            className={`${inputClass} text-base sm:text-[13px]`}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="retailer_price" className={labelClass}>
            Price to Retailer (₹) <span className="ml-0.5 text-red-500">*</span>
          </label>
          <input
            id="retailer_price" name="retailer_price" type="number" step="0.01" min="0" required
            value={retPrice} onChange={e => onRetPriceChange(e.target.value)}
            className={`${inputClass} text-base sm:text-[13px]`}
          />
          {errors?.retailer_price && <p className={errClass}>{errors.retailer_price[0]}</p>}
        </div>
        <div>
          <label htmlFor="retailer_pct" className={labelClass}>% off MRP</label>
          <input
            id="retailer_pct" type="number" step="0.01" min="0" max="100"
            value={retPct} onChange={e => onRetPctChange(e.target.value)}
            className={`${inputClass} text-base sm:text-[13px]`}
          />
        </div>
      </div>

      <p className="text-[11.5px] text-gray-500">
        {retailerMarginOverDistributor !== null
          ? <>Retailer margin over distributor price: <strong className="text-gray-700">{retailerMarginOverDistributor}%</strong></>
          : 'Enter a distributor price to see the retailer margin over it.'}
      </p>
    </div>
  )
}
