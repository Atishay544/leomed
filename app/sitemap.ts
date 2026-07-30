import { createPublicClient } from '@/lib/supabase/admin'
import type { MetadataRoute } from 'next'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.leomedpharma.in'

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return []

  const supabase = createPublicClient()

  const [{ data: products }, { data: categories }, { data: healthConcerns }] = await Promise.all([
    supabase.from('products').select('slug,updated_at').eq('is_active', true),
    supabase.from('categories').select('slug,updated_at').eq('taxonomy', 'product'),
    supabase.from('categories').select('slug,updated_at').eq('taxonomy', 'health_concern'),
  ])

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${baseUrl}`,                  lastModified: new Date(), changeFrequency: 'daily',   priority: 1.0 },
    { url: `${baseUrl}/products`,         lastModified: new Date(), changeFrequency: 'daily',   priority: 0.9 },
    { url: `${baseUrl}/care-plan`,        lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/faq`,              lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/contact`,          lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/shipping-policy`,  lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/refund-policy`,    lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/privacy-policy`,   lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
    { url: `${baseUrl}/terms`,            lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  ]

  const productRoutes: MetadataRoute.Sitemap = (products ?? []).map(p => ({
    url: `${baseUrl}/products/${p.slug}`,
    lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.85,
  }))

  const categoryRoutes: MetadataRoute.Sitemap = (categories ?? []).map(c => ({
    url: `${baseUrl}/category/${c.slug}`,
    lastModified: (c as any).updated_at ? new Date((c as any).updated_at) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.75,
  }))

  const healthConcernRoutes: MetadataRoute.Sitemap = (healthConcerns ?? []).map(c => ({
    url: `${baseUrl}/health-concern/${c.slug}`,
    lastModified: (c as any).updated_at ? new Date((c as any).updated_at) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  return [...staticRoutes, ...categoryRoutes, ...healthConcernRoutes, ...productRoutes]
}
