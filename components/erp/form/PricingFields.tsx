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

/** % off a base value (MRP, or PTR for the distributor row) that a price represents. */
function pctFromPrice(base: number, price: number): string {
  if (base <= 0) return ''
  return (((base - price) / base) * 100).toFixed(2)
}

/** The price that a given % off a base value works out to. */
function priceFromPct(base: number, pct: number): string {
  if (base <= 0) return ''
  return (base * (1 - pct / 100)).toFixed(2)
}

/**
 * MRP, Retailer Price (PTR) and Distributor Price (PTS).
 *
 * Retailer margin is a % of MRP: PTR = MRP × (1 − Retailer Margin %).
 * Distributor margin is a % of PTR — NOT of MRP: PTS = PTR × (1 − Distributor
 * Margin %). This is the one thing that must never be conflated (a pharma
 * distribution model where the distributor's cut comes off the retailer
 * price, not off MRP directly) — each percentage field is bidirectionally
 * linked to its OWN base, not both to MRP.
 *
 * Only mrp / distributor_price / retailer_price are real form fields (named
 * inputs submitted with the rest of the form) — the percentage inputs are
 * pure UI convenience, computed client-side, never sent to the server.
 * Saving the product also creates a matching versioned default pricing rule
 * (erp_set_product_default_price) — this dialog stays the one place Admin
 * edits default prices; the pricing engine underneath is what actually
 * governs every invoice.
 */
export default function PricingFields({ initial, errors }: Props) {
  const [mrp, setMrp]           = useState(String(initial?.mrp ?? ''))
  const [retPrice, setRetPrice]   = useState(String(initial?.retailer_price ?? ''))
  const [distPrice, setDistPrice] = useState(String(initial?.distributor_price ?? ''))
  const [retPct, setRetPct]       = useState(() => pctFromPrice(toNum(initial?.mrp), toNum(initial?.retailer_price)))
  const [distPct, setDistPct]     = useState(() => pctFromPrice(toNum(initial?.retailer_price), toNum(initial?.distributor_price)))

  function onMrpChange(value: string) {
    setMrp(value)
    const m = toNum(value)
    // Preserve the retailer's agreed margin % when MRP changes, rather than
    // leaving a stale price that no longer matches the stated %. The
    // distributor price is left alone here — it tracks PTR, not MRP, and
    // PTR itself only changes if the retailer % or price is edited below.
    if (retPct !== '') setRetPrice(priceFromPct(m, toNum(retPct)))
  }

  function onRetPriceChange(value: string) {
    setRetPrice(value)
    setRetPct(pctFromPrice(toNum(mrp), toNum(value)))
    // PTR just changed — keep the distributor's agreed margin % over the
    // NEW PTR rather than leaving a stale distributor price.
    if (distPct !== '') setDistPrice(priceFromPct(toNum(value), toNum(distPct)))
  }

  function onRetPctChange(value: string) {
    setRetPct(value)
    const nextRetPrice = priceFromPct(toNum(mrp), toNum(value))
    setRetPrice(nextRetPrice)
    if (distPct !== '') setDistPrice(priceFromPct(toNum(nextRetPrice), toNum(distPct)))
  }

  function onDistPriceChange(value: string) {
    setDistPrice(value)
    setDistPct(pctFromPrice(toNum(retPrice), toNum(value)))
  }

  function onDistPctChange(value: string) {
    setDistPct(value)
    setDistPrice(priceFromPct(toNum(retPrice), toNum(value)))
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
          <label htmlFor="retailer_price" className={labelClass}>
            Price to Retailer / PTR (₹) <span className="ml-0.5 text-red-500">*</span>
          </label>
          <input
            id="retailer_price" name="retailer_price" type="number" step="0.01" min="0" required
            value={retPrice} onChange={e => onRetPriceChange(e.target.value)}
            className={`${inputClass} text-base sm:text-[13px]`}
          />
          {errors?.retailer_price && <p className={errClass}>{errors.retailer_price[0]}</p>}
        </div>
        <div>
          <label htmlFor="retailer_pct" className={labelClass}>Retailer margin % (of MRP)</label>
          <input
            id="retailer_pct" type="number" step="0.01" min="0" max="100"
            value={retPct} onChange={e => onRetPctChange(e.target.value)}
            className={`${inputClass} text-base sm:text-[13px]`}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="distributor_price" className={labelClass}>
            Price to Distributor / PTS (₹) <span className="ml-0.5 text-red-500">*</span>
          </label>
          <input
            id="distributor_price" name="distributor_price" type="number" step="0.01" min="0" required
            value={distPrice} onChange={e => onDistPriceChange(e.target.value)}
            className={`${inputClass} text-base sm:text-[13px]`}
          />
          {errors?.distributor_price && <p className={errClass}>{errors.distributor_price[0]}</p>}
        </div>
        <div>
          <label htmlFor="distributor_pct" className={labelClass}>Distributor margin % (of PTR, not MRP)</label>
          <input
            id="distributor_pct" type="number" step="0.01" min="0" max="100"
            value={distPct} onChange={e => onDistPctChange(e.target.value)}
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
