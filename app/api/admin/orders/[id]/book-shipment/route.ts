import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@/lib/supabase/server'
import { bookCarrierShipment, delhiveryListWarehouses } from '@/lib/carriers'
import type { CarrierConfig, OrderShipmentInput } from '@/lib/carriers'

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

export async function POST(req: NextRequest, { params }: PageProps) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  // body: { carrier_id, service, pickup_location_name? }
  const { carrier_id, service, pickup_location_name } = body

  // Load order first so we can fall back to delivery_partner name if no carrier_id
  const { data: order } = await admin
    .from('orders')
    .select('id, total, user_id, status, metadata, shipping_address, order_items(quantity, unit_price, snapshot), created_at, delivery_partner')
    .eq('id', id)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  // Find carrier: prefer carrier_id, fall back to display_name from order
  let carrierQuery = admin.from('delivery_partners' as any).select('*').eq('is_active', true)
  if (carrier_id) {
    carrierQuery = carrierQuery.eq('id', carrier_id)
  } else if ((order as any).delivery_partner) {
    carrierQuery = carrierQuery.ilike('display_name', (order as any).delivery_partner)
  } else {
    return NextResponse.json({ error: 'No carrier selected. Please select a rate first.' }, { status: 400 })
  }

  const { data: carrier } = await carrierQuery.single()

  if (!carrier) return NextResponse.json({ error: 'Carrier not found or inactive. Configure it in Settings → Carriers.' }, { status: 404 })

  let cfg = carrier as CarrierConfig

  if (!cfg.api_key) {
    return NextResponse.json({ error: `${cfg.display_name} API key not configured. Add it in Settings → Delivery Partners.` }, { status: 503 })
  }

  // Auto-heal: if pickup_location_name is blank, fetch warehouses from Delhivery and save the first one
  if (cfg.name === 'delhivery' && !cfg.pickup_location_name?.trim()) {
    console.log('[book-shipment] pickup_location_name missing — auto-fetching warehouses from Delhivery')
    const { success, warehouses, error: whErr } = await delhiveryListWarehouses(cfg)
    if (success && warehouses.length > 0) {
      const wh = warehouses[0]
      const newConfig = {
        ...cfg.config,
        pickup_address: wh.address,
        pickup_city:    wh.city,
        pickup_state:   wh.state,
        pickup_phone:   wh.phone,
      }
      await admin.from('delivery_partners' as any).update({
        pickup_location_name: wh.name,
        pickup_pincode:       wh.pin,
        config:               newConfig,
        updated_at:           new Date().toISOString(),
      } as any).eq('id', cfg.id)
      cfg = { ...cfg, pickup_location_name: wh.name, pickup_pincode: wh.pin, config: newConfig }
      console.log('[book-shipment] auto-saved pickup_location_name:', wh.name,
        warehouses.length > 1 ? `(${warehouses.length} warehouses found — used first; verify in Settings → Carriers)` : '')
    } else {
      const reason = whErr ?? 'No warehouses registered in Delhivery account'
      return NextResponse.json({
        error: `Pickup location not set and auto-fetch failed (${reason}). Go to Admin → Carriers → Edit Delhivery → "Load My Warehouses" and select your pickup location.`,
      }, { status: 400 })
    }
  }

  // Apply pickup_location_name override from request body (admin selected from warehouse dropdown)
  if (pickup_location_name?.trim()) {
    const override = pickup_location_name.trim()
    if (override !== cfg.pickup_location_name) {
      await admin.from('delivery_partners' as any).update({
        pickup_location_name: override,
        updated_at:           new Date().toISOString(),
      } as any).eq('id', cfg.id)
      console.log('[book-shipment] pickup_location_name overridden to:', override)
    }
    cfg = { ...cfg, pickup_location_name: override }
  }

  const addr  = (order as any).shipping_address as Record<string, string> ?? {}
  const meta  = ((order as any).metadata ?? {}) as Record<string, any>
  const items = ((order as any).order_items ?? []) as any[]
  const isCOD = meta.payment_method === 'cod' || meta.payment_method === 'cod_upfront'

  const codAmount   = isCOD ? Number(meta.amount_on_delivery ?? (order as any).total ?? 0) : 0
  const weightGrams = items.reduce((sum: number, i: any) =>
    sum + ((i.snapshot?.weight_grams ?? 500) * (i.quantity ?? 1)), 0)

  // Resolve customer name + phone
  let customerName  = addr.name ?? 'Customer'
  let customerPhone = addr.phone ?? ''
  try {
    const { data: profile } = await admin.from('profiles').select('full_name, phone').eq('id', (order as any).user_id ?? '').maybeSingle()
    if ((profile as any)?.full_name) customerName  = (profile as any).full_name
    if ((profile as any)?.phone)    customerPhone = (profile as any).phone
  } catch { /* use address fallback */ }

  const input: OrderShipmentInput = {
    orderId:       id,
    orderDate:     new Date((order as any).created_at).toISOString(),
    customerName,
    customerPhone,
    address:       [addr.line1, addr.line2].filter(Boolean).join(', '),
    city:          addr.city ?? '',
    state:         addr.state ?? '',
    pincode:       addr.pincode ?? addr.zip ?? '',
    paymentMode:   isCOD ? 'COD' : 'Prepaid',
    codAmount,
    totalAmount:   Number((order as any).total ?? 0),
    productDesc:   items.map((i: any) => `${i.snapshot?.name ?? 'Product'} x${i.quantity}`).join(', '),
    weightGrams:   Math.max(500, weightGrams),
    shippingMode:  service ?? 'Surface',
    items:         items.map((i: any) => ({ name: i.snapshot?.name ?? 'Product', qty: i.quantity ?? 1 })),
  }

  // Log what we're sending so Vercel logs show the full payload on failure
  console.log('[book-shipment] input:', JSON.stringify({
    orderId: input.orderId, pincode: input.pincode, city: input.city, state: input.state,
    phone: input.customerPhone.slice(0, 4) + '****',
    weightGrams: input.weightGrams, paymentMode: input.paymentMode,
    carrier: cfg.display_name, pickupLocation: cfg.pickup_location_name,
  }))

  const result = await bookCarrierShipment(cfg, input)

  if (!result.success || !result.waybill) {
    console.error('[book-shipment] failed:', result.error)
    return NextResponse.json({ error: result.error ?? 'Shipment creation failed' }, { status: 400 })
  }

  await admin.from('orders').update({
    delivery_awb:     result.waybill,
    delivery_partner: cfg.display_name,
    delivery_service: service ?? 'Surface',
    updated_at:       new Date().toISOString(),
  }).eq('id', id)

  return NextResponse.json({ waybill: result.waybill, carrier: cfg.display_name })
}
