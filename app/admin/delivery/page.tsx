import { requireAdmin } from '@/lib/admin-auth'
import { getAdminDelivery } from '@/lib/admin-data'
import DeliveryDashboard from './DeliveryChart'
import type { DayPoint, PartnerStat, OutForDeliveryOrder, DeliveryOrder, BulkOrder } from './DeliveryChart'

export const metadata = { title: 'Delivery Management' }

interface PageProps {
  searchParams: Promise<{ date?: string }>
}

export default async function DeliveryPage({ searchParams }: PageProps) {
  await requireAdmin()

  const params     = await searchParams
  const datePreset = params.date ?? '90d'

  const { rawOrders, rawBulk, rawPartners, profileEntries, analyticsDays } =
    await getAdminDelivery(datePreset)

  const profileMap = new Map<string, any>(profileEntries)
  const partners: string[] = (rawPartners ?? []).map((p: any) => p.display_name)

  function customerInfo(o: any) {
    const addr    = (o.shipping_address ?? {}) as Record<string, string>
    const profile = profileMap.get(o.user_id)
    return {
      name:    profile?.full_name ?? addr.name ?? 'Customer',
      phone:   profile?.phone ?? addr.phone ?? '',
      pincode: addr.pincode ?? addr.zip ?? '',
    }
  }

  const deliveryOrders: DeliveryOrder[] = (rawOrders ?? []).map((o: any) => {
    const meta = (o.metadata ?? {}) as Record<string, any>
    const ci   = customerInfo(o)
    return {
      id: o.id, orderId: o.id, awb: o.delivery_awb ?? null, partner: o.delivery_partner ?? null,
      service: o.delivery_service ?? null, status: o.status, customerName: ci.name,
      customerPhone: ci.phone, total: Number(o.total ?? 0), deliveryCost: Number(o.delivery_rate ?? 0),
      date: (o.created_at as string).slice(0, 10), trackingStatus: meta.tracking_status ?? null,
    }
  })

  const bulkOrders: BulkOrder[] = (rawBulk ?? []).map((o: any) => {
    const items  = (o.order_items ?? []) as any[]
    const meta   = (o.metadata ?? {}) as Record<string, any>
    const ci     = customerInfo(o)
    const wg     = items.reduce((s: number, i: any) => s + ((i.snapshot?.weight_grams ?? 500) * (i.quantity ?? 1)), 0)
    const isCOD  = meta.payment_method === 'cod' || meta.payment_method === 'cod_upfront'
    return {
      id: o.id, orderId: o.id, status: o.status, customerName: ci.name, customerPhone: ci.phone,
      customerPin: ci.pincode, total: Number(o.total ?? 0), deliveryCost: Number(o.delivery_rate ?? 0),
      awb: o.delivery_awb ?? null, partner: o.delivery_partner ?? null, service: o.delivery_service ?? null,
      date: (o.created_at as string).slice(0, 10), weightGrams: Math.max(500, wg),
      isCOD, paymentMethod: meta.payment_method ?? 'prepaid', trackingStatus: meta.tracking_status ?? null,
    }
  })

  const shippedOrders = deliveryOrders.filter(o => o.awb)
  const inTransit     = shippedOrders.filter(o => o.status === 'shipped')
  const delivered     = shippedOrders.filter(o => o.status === 'delivered')
  const returned      = shippedOrders.filter(o => o.status === 'cancelled' || o.status === 'refunded')
  const outOfd        = shippedOrders.filter(o =>
    o.trackingStatus?.toLowerCase().includes('out') || o.trackingStatus?.toLowerCase().includes('ofd'))

  const totalCost    = shippedOrders.reduce((s, o) => s + o.deliveryCost, 0)
  const totalRevenue = delivered.reduce((s, o) => s + o.total, 0)
  const successRate  = (delivered.length + returned.length) > 0
    ? Math.round((delivered.length / (delivered.length + returned.length)) * 100) : 0

  const totalStats = {
    totalShipped: shippedOrders.length, inTransit: inTransit.length,
    outForDelivery: outOfd.length, delivered: delivered.length, returned: returned.length,
    totalCost, totalRevenue, successRate,
    avgCost: shippedOrders.length > 0 ? totalCost / shippedOrders.length : 0,
  }

  const outForDelivery: OutForDeliveryOrder[] = outOfd.map(o => ({
    id: o.id, orderId: o.orderId, awb: o.awb ?? '', partner: o.partner ?? '',
    customerName: o.customerName, customerPhone: o.customerPhone, total: o.total, deliveryCost: o.deliveryCost,
  }))

  const partnerMap = new Map<string, { shipped: number; delivered: number; inTransit: number; returned: number; totalCost: number }>()
  for (const o of shippedOrders) {
    const key = o.partner ?? 'Unknown'
    if (!partnerMap.has(key)) partnerMap.set(key, { shipped: 0, delivered: 0, inTransit: 0, returned: 0, totalCost: 0 })
    const ps = partnerMap.get(key)!
    ps.shipped++; ps.totalCost += o.deliveryCost
    if (o.status === 'delivered') ps.delivered++
    else if (o.status === 'shipped') ps.inTransit++
    else if (o.status === 'cancelled' || o.status === 'refunded') ps.returned++
  }

  const partnerStats: PartnerStat[] = [...partnerMap.entries()].map(([name, ps]) => ({
    name, shipped: ps.shipped, delivered: ps.delivered, inTransit: ps.inTransit, returned: ps.returned,
    totalCost: ps.totalCost,
    successRate: ps.shipped > 0 ? Math.round((ps.delivered / (ps.delivered + ps.returned || 1)) * 100) : 0,
  })).sort((a, b) => b.shipped - a.shipped)

  const dayMap = new Map<string, DayPoint>()
  const today  = new Date()
  for (let i = analyticsDays - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10)
    dayMap.set(d, { date: d, revenue: 0, deliveryCost: 0, returns: 0, shipped: 0 })
  }
  for (const o of shippedOrders) {
    const dp = dayMap.get(o.date)
    if (!dp) continue
    dp.shipped++; dp.deliveryCost += o.deliveryCost
    if (o.status === 'delivered') dp.revenue += o.total
    if (o.status === 'cancelled' || o.status === 'refunded') dp.returns += o.total
  }

  return (
    <DeliveryDashboard
      partners={partners}
      timeSeries={[...dayMap.values()]}
      partnerStats={partnerStats}
      outForDelivery={outForDelivery}
      orders={deliveryOrders}
      bulkOrders={bulkOrders}
      totalStats={totalStats}
      datePreset={datePreset}
    />
  )
}
