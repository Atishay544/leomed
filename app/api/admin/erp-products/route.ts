import { adminGuard } from '@/lib/security/admin-guard'
import { NextRequest, NextResponse } from 'next/server'

/**
 * ERP Product Master options for the storefront catalogue's "Link to
 * Product Master" control — read-only, admin-gated. Returns exactly the
 * fields the product form propagates into a linked storefront product
 * (generic_name, category, composition, uses, mrp, pack_size, unit) so
 * selecting one can fill those fields client-side with no second round trip.
 */
export async function GET(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const { data, error } = await admin
    .from('erp_products')
    .select('id, product_name, product_code, generic_name, category, composition, uses, mrp, pack_size, unit')
    .eq('active', true)
    .order('product_name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: data ?? [] })
}
