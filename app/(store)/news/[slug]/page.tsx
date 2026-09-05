import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { createPublicClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

export const revalidate = 300
export const dynamicParams = true

interface Props { params: Promise<{ slug: string }> }

const getArticleBySlug = unstable_cache(
  async (slug: string) => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null
    const supabase = createPublicClient()
    const { data } = await supabase
      .from('news_articles')
      .select('*')
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle()
    return data
  },
  ['news-article-by-slug'],
  { revalidate: 300, tags: ['news'] }
)

const getArticle = cache(getArticleBySlug)

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const article = await getArticle(slug)
  if (!article) return { title: 'Article Not Found' }
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.leomedpharma.in'
  return {
    title: `${article.title} | Leomed Pharma`,
    description: article.excerpt ?? article.title,
    alternates: { canonical: `${BASE_URL}/news/${slug}` },
    ...(article.cover_image_url && {
      openGraph: { images: [{ url: article.cover_image_url }] },
    }),
  }
}

export default async function NewsArticlePage({ params }: Props) {
  const { slug } = await params
  const article = await getArticle(slug)
  if (!article) notFound()

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <Link href="/news" className="text-sm text-gray-400 hover:text-gray-700 transition">← Back to News</Link>

      {article.published_at && (
        <p className="text-xs text-gray-400 mt-4">
          {new Date(article.published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      )}
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-2 mb-6">{article.title}</h1>

      {article.cover_image_url && (
        <div className="aspect-video relative rounded-2xl overflow-hidden bg-gray-50 mb-6">
          <Image src={article.cover_image_url} alt={article.title} fill className="object-cover" />
        </div>
      )}

      <div className="prose prose-sm sm:prose-base max-w-none text-gray-700 whitespace-pre-line leading-relaxed">
        {article.body}
      </div>
    </article>
  )
}
