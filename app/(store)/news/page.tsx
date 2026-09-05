import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import Image from 'next/image'

export const revalidate = 300

export function generateMetadata() {
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.leomedpharma.in'
  return {
    title: 'News & Articles | Leomed Pharma',
    description: 'Latest news and articles from Leomed Pharma.',
    alternates: { canonical: `${BASE_URL}/news` },
  }
}

const getPublishedNews = unstable_cache(
  async () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return []
    const supabase = createPublicClient()
    const { data } = await supabase
      .from('news_articles')
      .select('id,title,slug,excerpt,cover_image_url,published_at')
      .eq('is_published', true)
      .order('sort_order')
      .order('published_at', { ascending: false })
    return data ?? []
  },
  ['public-news-list'],
  { revalidate: 300, tags: ['news'] }
)

export default async function NewsListPage() {
  const articles = await getPublishedNews()

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">News & Articles</h1>

      {articles.length === 0 ? (
        <p className="text-gray-400 text-center py-20">No articles yet — check back soon.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {articles.map((a: any) => (
            <Link key={a.id} href={`/news/${a.slug}`}
              className="group block bg-white rounded-2xl overflow-hidden border border-gray-100 hover:border-gray-200 hover:shadow-lg transition-all duration-300">
              <div className="aspect-video bg-gray-50 relative overflow-hidden">
                {a.cover_image_url ? (
                  <Image src={a.cover_image_url} alt={a.title} fill
                    sizes="(max-width: 640px) 100vw, 33vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl">📰</div>
                )}
              </div>
              <div className="p-4">
                {a.published_at && (
                  <p className="text-xs text-gray-400 mb-1">
                    {new Date(a.published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
                <h2 className="font-semibold text-gray-900 group-hover:text-emerald-700 transition-colors leading-snug">{a.title}</h2>
                {a.excerpt && <p className="text-sm text-gray-500 mt-1.5 line-clamp-2">{a.excerpt}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
