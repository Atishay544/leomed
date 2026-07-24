import { unstable_cache } from 'next/cache'
import { createAdminClient } from './supabase/admin'

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const getAdminDashboard = unstable_cache(
  async () => {
    const db = createAdminClient()

    function daysAgo(n: number) {
      const d = new Date()
      d.setDate(d.getDate() - n)
      d.setHours(0, 0, 0, 0)
      return d
    }

    const now   = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const d1    = daysAgo(1); const d7  = daysAgo(7)
    const d14   = daysAgo(14); const d30 = daysAgo(30); const d60 = daysAgo(60)

    const [ordersRes, recentRes, allStatusRes, profilesTotalRes, profilesNewRes,
           partnersRes, visitorsRes, visitorsTodayRes, lowStockRes] = await Promise.all([
      db.from('orders').select('id, total, status, created_at, shipping_address')
        .gte('created_at', d60.toISOString()).order('created_at', { ascending: true }),
      db.from('orders').select('id, total, status, created_at, shipping_address')
        .in('status', ['confirmed','cod_upfront_paid','processing','shipped','delivered'])
        .order('created_at', { ascending: false }).limit(8),
      db.from('orders').select('status').limit(2000),
      db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'customer'),
      db.from('profiles').select('id', { count: 'exact', head: true })
        .eq('role', 'customer').gte('created_at', d30.toISOString()),
      (db as any).from('delivery_partners').select('id', { count: 'exact', head: true }).eq('is_active', true),
      (db as any).rpc('count_unique_visitors', { since_ts: d30.toISOString() }),
      (db as any).rpc('count_unique_visitors', { since_ts: today.toISOString() }),
      db.from('products').select('id, name, stock, product_skus(stock)')
        .eq('is_active', true).order('stock', { ascending: true }).limit(50),
    ])

    const REVENUE_STATUSES = new Set(['confirmed','cod_upfront_paid','processing','shipped','delivered'])
    type OrderRow = { id: string; total: number | string; status: string; created_at: string; shipping_address: unknown }

    function sumRev(rows: OrderRow[], from: Date, to: Date) {
      return rows.filter(r => { const d = new Date(r.created_at); return REVENUE_STATUSES.has(r.status) && d >= from && d < to })
                 .reduce((s, r) => s + (Number(r.total) || 0), 0)
    }
    function countIn(rows: OrderRow[], from: Date, to: Date) {
      return rows.filter(r => { const d = new Date(r.created_at); return REVENUE_STATUSES.has(r.status) && d >= from && d < to }).length
    }

    const tomorrow = new Date(today.getTime() + 86400000)
    const orders60 = (ordersRes.data ?? []) as OrderRow[]

    const revenueToday  = sumRev(orders60, today, tomorrow); const revenueYesterday = sumRev(orders60, d1, today)
    const revenue7d     = sumRev(orders60, d7, now);         const revenuePrev7d    = sumRev(orders60, d14, d7)
    const revenue30d    = sumRev(orders60, d30, now);        const revenuePrev30d   = sumRev(orders60, d60, d30)
    const ordersToday   = countIn(orders60, today, tomorrow); const ordersYesterday  = countIn(orders60, d1, today)
    const orders7d      = countIn(orders60, d7, now);         const ordersPrev7d     = countIn(orders60, d14, d7)
    const orders30d     = countIn(orders60, d30, now);        const ordersPrev30d    = countIn(orders60, d60, d30)
    const aov30d     = orders30d     > 0 ? revenue30d     / orders30d     : 0
    const aovPrev30d = ordersPrev30d > 0 ? revenuePrev30d / ordersPrev30d : 0

    const seriesMap = new Map<string, { date: string; revenue: number; orders: number }>()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      seriesMap.set(key, { date: key, revenue: 0, orders: 0 })
    }
    for (const o of orders60) {
      if (!REVENUE_STATUSES.has(o.status)) continue
      const pt = seriesMap.get(o.created_at.slice(0, 10))
      if (pt) { pt.revenue += Number(o.total) || 0; pt.orders++ }
    }

    const ordersByStatus: Record<string, number> = {}
    for (const r of (allStatusRes.data ?? []) as { status: string }[])
      ordersByStatus[r.status] = (ordersByStatus[r.status] ?? 0) + 1

    return {
      revenueToday, revenueYesterday, revenue7d, revenuePrev7d, revenue30d, revenuePrev30d,
      ordersToday, ordersYesterday, orders7d, ordersPrev7d, orders30d, ordersPrev30d,
      aov30d, aovPrev30d,
      newCustomers30d: profilesNewRes.count   ?? 0,
      totalCustomers:  profilesTotalRes.count ?? 0,
      visitorsToday:   (visitorsTodayRes as any).data ?? 0,
      visitors30d:     (visitorsRes as any).data      ?? 0,
      ordersByStatus,
      dailySeries:     Array.from(seriesMap.values()),
      recentOrders: ((recentRes.data ?? []) as OrderRow[]).map(o => ({
        id: o.id, total: Number(o.total) || 0, status: o.status,
        customerName: (o.shipping_address as Record<string,string>|null)?.name ?? null,
        created_at: o.created_at,
      })),
      lowStock: ((lowStockRes.data ?? []) as { id: string; name: string; stock: number; product_skus?: { stock: number }[] }[])
        .map(p => {
          const skuTotal = (p.product_skus ?? []).reduce((s, sk) => s + sk.stock, 0)
          const effectiveStock = skuTotal > 0 ? skuTotal : p.stock
          return { id: p.id, name: p.name, stock: effectiveStock }
        })
        .filter(p => p.stock <= 10)
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 6),
      activePartners: (partnersRes as any).count ?? 0,
      pendingAction: (ordersByStatus['confirmed'] ?? 0) + (ordersByStatus['cod_upfront_paid'] ?? 0),
    }
  },
  ['admin-dashboard'],
  { revalidate: 30, tags: ['admin-dashboard', 'admin-orders', 'admin-products'] }
)

// ─── Orders list ──────────────────────────────────────────────────────────────

const DATE_PRESETS: Record<string, { days: number }> = {
  today: { days: 1 }, yesterday: { days: 2 },
  '7d': { days: 7 }, '14d': { days: 14 }, '30d': { days: 30 },
}

function getDateRange(preset: string) {
  const p = DATE_PRESETS[preset]
  if (!p) return null
  const to = new Date(); const from = new Date()
  if (preset === 'yesterday') {
    to.setDate(to.getDate() - 1); to.setHours(23, 59, 59, 999)
    from.setDate(from.getDate() - 1); from.setHours(0, 0, 0, 0)
  } else {
    from.setDate(from.getDate() - (p.days - 1)); from.setHours(0, 0, 0, 0)
  }
  return { from: from.toISOString(), to: to.toISOString() }
}

const PAGE_SIZE_ORDERS = 25

export const getAdminOrders = unstable_cache(
  async (statusFilter: string, datePreset: string, page: number) => {
    const db   = createAdminClient()
    const from = (page - 1) * PAGE_SIZE_ORDERS
    const to   = from + PAGE_SIZE_ORDERS - 1
    const dr   = getDateRange(datePreset)

    const countQb = db.from('orders').select('status')
    if (dr) { countQb.gte('created_at', dr.from).lte('created_at', dr.to) }
    else    { countQb.limit(1000) }

    let listQb = db
      .from('orders')
      .select('id, total, status, payment_status, metadata, created_at, user_id, delivery_awb, delivery_partner', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)
    if (statusFilter) listQb = listQb.eq('status', statusFilter)
    if (dr) listQb = listQb.gte('created_at', dr.from).lte('created_at', dr.to)

    const [{ data: statusCounts }, { data: orders, count }] = await Promise.all([countQb, listQb])

    const countMap: Record<string, number> = {}
    for (const row of statusCounts ?? []) countMap[(row as any).status] = (countMap[(row as any).status] ?? 0) + 1

    const userIds = [...new Set((orders ?? []).map((o: any) => o.user_id).filter(Boolean))]
    const { data: profiles } = await db.from('profiles').select('id, full_name')
      .in('id', userIds.length > 0 ? userIds as string[] : ['00000000-0000-0000-0000-000000000000'])

    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]))

    return {
      countMap,
      count: count ?? 0,
      orders: (orders ?? []).map((o: any) => ({
        ...o,
        customerName:     profileMap.get(o.user_id) ?? null,
        delivery_awb:     o.delivery_awb     ?? null,
        delivery_partner: o.delivery_partner ?? null,
      })),
    }
  },
  ['admin-orders-list'],
  { revalidate: 15, tags: ['admin-orders'] }
)

// ─── Products list ────────────────────────────────────────────────────────────

const PAGE_SIZE_PRODUCTS = 20

export const getAdminProducts = unstable_cache(
  async (q: string, categoryFilter: string, page: number) => {
    const db   = createAdminClient()
    const from = (page - 1) * PAGE_SIZE_PRODUCTS
    const to   = from + PAGE_SIZE_PRODUCTS - 1

    const [{ data: categories }, queryResult] = await Promise.all([
      db.from('categories').select('id, name').order('name'),
      (() => {
        let qb = db
          .from('products')
          .select('id, name, price, stock, is_active, category_id, images, categories(name), product_skus(stock)', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(from, to)
        if (q) qb = qb.ilike('name', `%${q}%`)
        if (categoryFilter) qb = qb.eq('category_id', categoryFilter)
        return qb
      })(),
    ])

    return { categories: categories ?? [], products: queryResult.data ?? [], count: queryResult.count ?? 0 }
  },
  ['admin-products-list'],
  { revalidate: 30, tags: ['admin-products', 'admin-categories'] }
)

// ─── Categories ───────────────────────────────────────────────────────────────

export const getAdminCategories = unstable_cache(
  async () => {
    const db = createAdminClient()
    const { data } = await db
      .from('categories')
      .select('id, name, slug, parent_id, sort_order, categories!parent_id(name)')
      .order('sort_order', { ascending: true })
    return data ?? []
  },
  ['admin-categories'],
  { revalidate: 60, tags: ['admin-categories'] }
)

// ─── Offers ───────────────────────────────────────────────────────────────────

export const getAdminOffers = unstable_cache(
  async () => {
    const db = createAdminClient()
    const { data } = await db.from('offers').select('*').order('sort_order')
    return data ?? []
  },
  ['admin-offers'],
  { revalidate: 60, tags: ['admin-offers'] }
)

// ─── Coupons ──────────────────────────────────────────────────────────────────

export const getAdminCoupons = unstable_cache(
  async () => {
    const db = createAdminClient()
    const { data } = await db.from('coupons')
      .select('id, code, type, value, min_order, uses_count, max_uses, expires_at, is_active')
      .order('created_at', { ascending: false })
    return data ?? []
  },
  ['admin-coupons'],
  { revalidate: 60, tags: ['admin-coupons'] }
)

// ─── Delivery analytics ───────────────────────────────────────────────────────

const DELIVERY_PRESETS: Record<string, { analyticsDays: number; bulkDays: number }> = {
  '7d':  { analyticsDays: 7,  bulkDays: 7  },
  '14d': { analyticsDays: 14, bulkDays: 14 },
  '30d': { analyticsDays: 30, bulkDays: 30 },
  '90d': { analyticsDays: 90, bulkDays: 30 },
}

export const getAdminDelivery = unstable_cache(
  async (datePreset: string) => {
    const db      = createAdminClient()
    const preset  = DELIVERY_PRESETS[datePreset] ?? DELIVERY_PRESETS['90d']
    const aStart  = new Date(Date.now() - preset.analyticsDays * 86400000).toISOString()
    const bStart  = new Date(Date.now() - preset.bulkDays      * 86400000).toISOString()

    const [analyticsResult, bulkResult, partnersResult] = await Promise.all([
      (db as any).from('orders')
        .select('id, status, total, metadata, shipping_address, delivery_partner, delivery_awb, delivery_rate, delivery_service, created_at, user_id')
        .gte('created_at', aStart).not('delivery_partner', 'is', null)
        .order('created_at', { ascending: false }),
      (db as any).from('orders')
        .select('id, status, total, metadata, shipping_address, delivery_partner, delivery_awb, delivery_rate, delivery_service, created_at, user_id, order_items(quantity, unit_price, snapshot)')
        .gte('created_at', bStart)
        .in('status', ['confirmed','cod_upfront_paid','processing','shipped'])
        .order('created_at', { ascending: false }).limit(200),
      (db as any).from('delivery_partners').select('id, display_name, pickup_pincode')
        .eq('is_active', true).order('display_name', { ascending: true }),
    ])

    const rawOrders   = analyticsResult.data ?? []
    const rawBulk     = bulkResult.data ?? []
    const rawPartners = partnersResult.data ?? []

    const allUserIds = [...new Set([...rawOrders, ...rawBulk].map((o: any) => o.user_id).filter(Boolean))]
    const { data: profiles } = allUserIds.length > 0
      ? await db.from('profiles').select('id, full_name, phone').in('id', allUserIds as string[])
      : { data: [] }
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))

    return {
      rawOrders, rawBulk, rawPartners,
      profileEntries: (profiles ?? []).map((p: any) => [p.id, p] as [string, any]),
      analyticsDays: preset.analyticsDays,
    }
  },
  ['admin-delivery'],
  { revalidate: 15, tags: ['admin-delivery', 'admin-orders'] }
)

// ─── Customers list ───────────────────────────────────────────────────────────

const PAGE_SIZE_CUSTOMERS = 25

export const getAdminCustomers = unstable_cache(
  async (q: string, page: number) => {
    const db   = createAdminClient()
    const from = (page - 1) * PAGE_SIZE_CUSTOMERS
    const to   = from + PAGE_SIZE_CUSTOMERS - 1

    let query = db.from('profiles')
      .select('id, full_name, phone, role, created_at', { count: 'exact' })
      .eq('role', 'customer').order('created_at', { ascending: false })
      .range(from, to)
    if (q) query = query.ilike('full_name', `%${q}%`)

    const { data: customers, count } = await query
    const customerIds = (customers ?? []).map((c: any) => c.id)

    const { data: orders } = customerIds.length > 0
      ? await db.from('orders')
          .select('id, user_id, order_items(quantity, snapshot)')
          .in('user_id', customerIds)
          .order('created_at', { ascending: false })
          .limit(customerIds.length * 6)
      : { data: [] }

    const orderMap = new Map<string, { count: number; items: string[] }>()
    for (const o of orders ?? []) {
      if (!orderMap.has((o as any).user_id)) {
        const items = ((o as any).order_items ?? []).map((i: any) => {
          const name = i.snapshot?.name ?? 'Product'
          return `${name} ×${i.quantity}`
        })
        orderMap.set((o as any).user_id, { count: 1, items })
      } else {
        orderMap.get((o as any).user_id)!.count++
      }
    }

    return {
      customers: customers ?? [],
      count: count ?? 0,
      orderEntries: [...orderMap.entries()].map(([id, v]) => ({ id, ...v })),
    }
  },
  ['admin-customers-list'],
  { revalidate: 30, tags: ['admin-customers', 'admin-orders'] }
)

// ─── Banners ──────────────────────────────────────────────────────────────────

export const getAdminBanners = unstable_cache(
  async () => {
    const db = createAdminClient()
    const { data } = await (db as any).from('banners').select('*').order('sort_order')
    return data ?? []
  },
  ['admin-banners'],
  { revalidate: 60, tags: ['admin-banners'] }
)

// ─── Announcements ────────────────────────────────────────────────────────────

export const getAdminAnnouncements = unstable_cache(
  async () => {
    const db = createAdminClient()
    const { data } = await (db as any).from('announcements').select('*').order('created_at', { ascending: false })
    return data ?? []
  },
  ['admin-announcements'],
  { revalidate: 60, tags: ['admin-announcements'] }
)
