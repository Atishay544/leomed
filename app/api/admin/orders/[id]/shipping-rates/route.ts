import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@/lib/supabase/server'
import { getAllCarrierRates } from '@/lib/carriers'
import type { CarrierConfig, PackageDimensions } from '@/lib/carriers'

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  if (user.app_metadata?.role === 'admin') return admin
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return admin
}

interface PageProps { params: Promise<{ id: string }> }

async function loadOrderAndCarriers(admin: ReturnType<typeof createAdminClient>, id: string) {
  const [{ data: order }, { data: partners }] = await Promise.all([
    admin.from('orders').select('shipping_address, total, metadata, order_items(quantity, snapshot)').eq('id', id).single(),
    admin.from('delivery_partners' as any).select('*').eq('is_active', true),
  ])
  return { order, partners }
}

function computeDefaults(order: any) {
  const addr       = (order.shipping_address ?? {}) as Record<string, string>
  const meta       = (order.metadata ?? {}) as Record<string, any>
  const orderItems = (order.order_items ?? []) as any[]
  const toPin      = addr.pincode ?? addr.zip ?? ''
  const isCOD      = meta.payment_method === 'cod' || meta.payment_method === 'cod_upfront'
  const weightGrams = Math.max(500, orderItems.reduce((sum: number, item: any) =>
    sum + ((item.snapshot?.weight_grams ?? 500) * (item.quantity ?? 1)), 0))
  const defaultDims: PackageDimensions = { length: 12, width: 12, height: 12 }
  return { addr, toPin, isCOD, weightGrams, defaultDims }
}

/** GET — return order defaults (weight + dims) so the UI can pre-fill, no rates fetched */
export async function GET(_req: NextRequest, { params }: PageProps) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { order } = await loadOrderAndCarriers(admin, id)

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const { toPin, weightGrams, defaultDims } = computeDefaults(order)
  return NextResponse.json({ toPin, weightGrams, dims: defaultDims })
}

/** POST { weightGrams, length, width, height } — fetch live rates with given dimensions */
export async function POST(req: NextRequest, { params }: PageProps) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const { order, partners } = await loadOrderAndCarriers(admin, id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const { toPin, isCOD, weightGrams: defaultWeight, defaultDims } = computeDefaults(order)

  // Use body values if provided and valid, else fall back to order defaults
  const weightGrams = (Number(body.weightGrams) >= 1) ? Number(body.weightGrams) : defaultWeight
  const dims: PackageDimensions = {
    length: Number(body.length) >= 1 ? Number(body.length) : defaultDims.length,
    width:  Number(body.width)  >= 1 ? Number(body.width)  : defaultDims.width,
    height: Number(body.height) >= 1 ? Number(body.height) : defaultDims.height,
  }

  const carriers = (partners ?? []) as CarrierConfig[]
  const fromPin  = carriers.find(c => c.pickup_pincode)?.pickup_pincode ?? ''

  if (!toPin) {
    return NextResponse.json({ rates: [], toPin, weightGrams, dims, warning: 'No delivery pincode in shipping address' })
  }
  if (carriers.length === 0) {
    return NextResponse.json({ rates: [], toPin, weightGrams, dims, warning: 'No delivery partners configured. Add one in Settings → Delivery Partners.' })
  }
  if (!fromPin) {
    return NextResponse.json({ rates: [], toPin, weightGrams, dims, warning: 'Carrier pickup pincode not configured. Edit the carrier in Settings → Carriers.' })
  }

  const rates = await getAllCarrierRates(carriers, fromPin, toPin, weightGrams, isCOD, dims)
  return NextResponse.json({ rates, toPin, weightGrams, dims })
}
