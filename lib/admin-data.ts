import { unstable_cache } from 'next/cache'
import { createAdminClient } from './supabase/admin'

// ─── Dashboard ────────────────────────────────────────────────────────────────
// This is a B2B informational catalogue now — no accounts, no purchases, no
// stock/price shown publicly. There's nothing customer-shaped left to report
// on; the dashboard just surfaces catalogue health.

export const getAdminDashboard = unstable_cache(
  async () => {
    const db = createAdminClient()

    const [productsTotalRes, newsTotalRes, launchesTotalRes] = await Promise.all([
      db.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
      (db as any).from('news_articles').select('id', { count: 'exact', head: true }).eq('is_published', true),
      (db as any).from('upcoming_launches').select('id', { count: 'exact', head: true }).eq('is_active', true),
    ])

    return {
      totalProducts:      productsTotalRes.count   ?? 0,
      publishedNews:      newsTotalRes.count        ?? 0,
      activeLaunches:     launchesTotalRes.count    ?? 0,
    }
  },
  ['admin-dashboard'],
  { revalidate: 30, tags: ['admin-dashboard', 'admin-products', 'admin-news', 'admin-launches'] }
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
          .select('id, name, is_active, category_id, images, categories!products_category_id_fkey(name)', { count: 'exact' })
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

// ─── News & Articles ────────────────────────────────────────────────────────────

export const getAdminNews = unstable_cache(
  async () => {
    const db = createAdminClient()
    const { data } = await (db as any).from('news_articles').select('*').order('sort_order').order('created_at', { ascending: false })
    return data ?? []
  },
  ['admin-news'],
  { revalidate: 30, tags: ['admin-news'] }
)

// ─── Upcoming Launches ────────────────────────────────────────────────────────────

export const getAdminUpcomingLaunches = unstable_cache(
  async () => {
    const db = createAdminClient()
    const { data } = await (db as any).from('upcoming_launches').select('*').order('sort_order').order('created_at', { ascending: false })
    return data ?? []
  },
  ['admin-launches'],
  { revalidate: 30, tags: ['admin-launches'] }
)

// ─── About page ───────────────────────────────────────────────────────────────

export const getAdminAbout = unstable_cache(
  async () => {
    const db = createAdminClient()
    const { data } = await (db as any).from('about_content').select('*').eq('id', 1).single()
    return data ?? { id: 1, title: 'About Leomed Pharma', body: '' }
  },
  ['admin-about'],
  { revalidate: 60, tags: ['admin-about'] }
)
