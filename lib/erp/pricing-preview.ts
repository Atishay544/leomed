import type { BillingCustomerType, CalculationBasis, CalculationMethod, SchemeType } from './types'

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

export interface SchemeBeforeAfterLeg {
  before: number
  /** Null when the scheme doesn't have enough entered yet to preview
   *  (e.g. no percentage/quantities typed), never when it simply doesn't
   *  apply — an unaffected type reports `after === before`, same rupee
   *  figure, so "no change" reads the same as "no discount here". */
  after: number | null
}

/**
 * Distributor and retailer's own price before this scheme, next to what it
 * becomes under it — the same question a trade scheme is drawn up to
 * answer ("what does the distributor pay now vs. before"), so the scheme
 * dialog and list show it directly instead of just the raw
 * basis/method/percentage a non-pricing person would have to do the maths
 * on themselves.
 *
 * A PERCENTAGE_MARGIN scheme resolves to exactly one rupee rate (per
 * erp_apply_pricing/erp_resolve_selling_price — the base is MRP or the
 * single company-wide PTR anchor, never a per-customer-type figure), so
 * distributor and retailer land on the SAME after-price whenever the
 * scheme applies to both. A scheme scoped to just one customer_type leaves
 * the other type's price unchanged (after === before).
 *
 * A FREE_QUANTITY scheme never changes the unit price at all — what
 * changes is the effective price once the free units are averaged in
 * (buy 10 get 1 free = paying for 10 to receive 11), computed against
 * each type's OWN current price, so this is the one case where
 * distributor and retailer genuinely differ.
 */
export function schemeBeforeAfter(
  scheme: {
    scheme_type: SchemeType
    customer_type: BillingCustomerType | null
    calculation_basis: CalculationBasis | null
    calculation_method: CalculationMethod | null
    percentage: number | null
    buy_quantity: number | null
    free_quantity: number | null
  },
  product: { mrp: number; distributor_price: number; retailer_price: number },
): { distributor: SchemeBeforeAfterLeg; retailer: SchemeBeforeAfterLeg } {
  const after = (target: BillingCustomerType, before: number): number | null => {
    if (scheme.customer_type && scheme.customer_type !== target) return before

    if (scheme.scheme_type === 'FREE_QUANTITY') {
      const buy = scheme.buy_quantity ?? 0
      const free = scheme.free_quantity ?? 0
      if (buy <= 0 || free <= 0) return null
      return Math.round((before * buy / (buy + free)) * 100) / 100
    }

    if (!scheme.calculation_basis || !scheme.calculation_method || scheme.percentage == null) return null
    return previewPrice(scheme.calculation_basis, scheme.calculation_method, scheme.percentage, 0, product.mrp, product.retailer_price)
  }

  return {
    distributor: { before: product.distributor_price, after: after('DISTRIBUTOR', product.distributor_price) },
    retailer:    { before: product.retailer_price,    after: after('CHEMIST', product.retailer_price) },
  }
}
