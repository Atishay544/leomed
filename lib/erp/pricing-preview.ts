import type { CalculationBasis, CalculationMethod } from './types'

/**
 * Client-side preview of what erp_apply_pricing() (the database function
 * every invoice actually goes through) would compute for a given rule/scheme
 * — mirrored here only so the negotiated-pricing and scheme dialogs can show
 * "≈ ₹X incl. GST" the moment an admin types a percentage, without a round
 * trip. This is display-only: the server always recomputes for real, so a
 * drift between the two would only ever show a wrong PREVIEW, never a wrong
 * charge.
 *
 * COST basis has no single preview value (it's the batch's actual purchase
 * rate at sale time, which varies batch to batch) — callers should treat a
 * null return as "no preview available" rather than showing ₹0.
 */
export function previewPrice(
  basis: CalculationBasis,
  method: CalculationMethod,
  percentage: number,
  fixedAmount: number,
  mrp: number,
  ptr: number,
): number | null {
  if (method === 'FIXED_PRICE') return fixedAmount > 0 ? fixedAmount : null

  const base = basis === 'MRP' ? mrp : basis === 'PTR' || basis === 'PTS' ? ptr : null
  if (base === null || base <= 0) return null

  const rate = method === 'MARKUP' ? base * (1 + percentage / 100) : base * (1 - percentage / 100)
  return Math.round(rate * 100) / 100
}

export function priceInclGst(price: number, gstRate: number): number {
  return Math.round(price * (1 + gstRate / 100) * 100) / 100
}
