import { unstable_cache } from 'next/cache'
import { createAdminClient } from './supabase/admin'

// ─── Dashboard ────────────────────────────────────────────────────────────────
// The storefront is browse-only — checkout, orders, delivery, and visitor
// tracking were removed, so this reports only what's still live: the catalog
// and signed-up customers. Historical order/revenue data still exists in the
// database (untouched) but has no admin screen anymore, so it's deliberately
// not surfaced here.

export const getAdminDashboard = unstable_cache(
  async () => {
    const db = createAdminClient()

    const now   = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const d30   = new Date(today); d30.setDate(d30.getDate() - 30)

    const [profilesTotalRes, profilesNewRes, productsTotalRes, lowStockRes] = await Promise.all([
      db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'customer'),
      db.from('profiles').select('id', { count: 'exact', head: true })
        .eq('role', 'customer').gte('created_at', d30.toISOString()),
      db.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
      db.from('products').select('id, name, stock, product_skus(stock)')
        .eq('is_active', true).order('stock', { ascending: true }).limit(50),
    ])

    return {
      newCustomers30d: profilesNewRes.count   ?? 0,
      totalCustomers:  profilesTotalRes.count ?? 0,
      totalProducts:   productsTotalRes.count ?? 0,
      lowStock: ((lowStockRes.data ?? []) as { id: string; name: string; stock: number; product_skus?: { stock: number }[] }[])
        .map(p => {
          const skuTotal = (p.product_skus ?? []).reduce((s, sk) => s + sk.stock, 0)
          const effectiveStock = skuTotal > 0 ? skuTotal : p.stock
          return { id: p.id, name: p.name, stock: effectiveStock }
        })
        .filter(p => p.stock <= 10)
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 6),
    }
  },
  ['admin-dashboard'],
  { revalidate: 30, tags: ['admin-dashboard', 'admin-products'] }
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
          .select('id, name, price, stock, is_active, category_id, images, categories!products_category_id_fkey(name), product_skus(stock)', { count: 'exact' })
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
      .select('id, name, slug, parent_id, sort_order, taxonomy, accent_color, image_url, categories!parent_id(name)')
      .order('sort_order', { ascending: true })
    return data ?? []
  },
  ['admin-categories'],
  { revalidate: 60, tags: ['admin-categories'] }
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
