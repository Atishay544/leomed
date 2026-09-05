/**
 * Line and invoice arithmetic for the billing screens.
 *
 * This mirrors the calculation inside erp_save_purchase_invoice() and
 * erp_save_sales_invoice() so the operator sees the right numbers while
 * typing. It is a PREVIEW ONLY — the figures actually stored are the ones
 * PostgreSQL computes from the submitted lines. Nothing here is ever sent to
 * the server as a total (spec §52).
 *
 * If the two ever disagree, the database is right and this file is the bug.
 */

export interface LineInput {
  quantity: number
  rate: number
  discountPercent: number
  gstRate: number
}

export interface LineAmounts {
  gross: number
  discount: number
  taxable: number
  tax: number
  total: number
}

/** Rounds to paise the same way PostgreSQL's round(numeric, 2) does. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function lineAmounts({ quantity, rate, discountPercent, gstRate }: LineInput): LineAmounts {
  const gross = round2(quantity * rate)
  const discount = round2((gross * discountPercent) / 100)
  const taxable = gross - discount
  const tax = round2((taxable * gstRate) / 100)
  return { gross, discount, taxable, tax, total: taxable + tax }
}

export interface InvoiceTotals {
  subtotal: number
  discount: number
  tax: number
  grandTotal: number
}

export function invoiceTotals(lines: LineInput[]): InvoiceTotals {
  return lines.reduce<InvoiceTotals>(
    (totals, line) => {
      const amounts = lineAmounts(line)
      return {
        subtotal:   round2(totals.subtotal + amounts.gross),
        discount:   round2(totals.discount + amounts.discount),
        tax:        round2(totals.tax + amounts.tax),
        grandTotal: round2(totals.grandTotal + amounts.total),
      }
    },
    { subtotal: 0, discount: 0, tax: 0, grandTotal: 0 },
  )
}

/**
 * Splits a GST amount for display on the printed invoice.
 *
 * Within the state the tax is levied half as CGST and half as SGST; across
 * state lines it is a single IGST charge. Only the total is stored — the split
 * is presentation, so a mistaken interstate flag is a one-field correction
 * rather than a rewrite of the stored figures (plan Q4).
 */
export function gstSplit(taxAmount: number, isInterstate: boolean) {
  if (isInterstate) return { igst: round2(taxAmount), cgst: 0, sgst: 0 }
  const half = round2(taxAmount / 2)
  // The remainder goes to SGST so the two halves always add back to the total.
  return { igst: 0, cgst: half, sgst: round2(taxAmount - half) }
}
