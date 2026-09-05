import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/admin'

export const revalidate = 300

export function generateMetadata() {
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.leomedpharma.in'
  return {
    title: 'About Us | Leomed Pharma',
    description: 'About Leomed Pharma.',
    alternates: { canonical: `${BASE_URL}/about` },
  }
}

const getAboutContent = unstable_cache(
  async () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return { title: 'About Leomed Pharma', body: '' }
    const supabase = createPublicClient()
    const { data } = await supabase.from('about_content').select('title,body').eq('id', 1).single()
    return data ?? { title: 'About Leomed Pharma', body: '' }
  },
  ['public-about'],
  { revalidate: 300, tags: ['about'] }
)

export default async function AboutPage() {
  const about = await getAboutContent()

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">{about.title}</h1>
      {about.body ? (
        <div className="prose prose-sm sm:prose-base max-w-none text-gray-700 whitespace-pre-line leading-relaxed">
          {about.body}
        </div>
      ) : (
        <p className="text-gray-400">Content coming soon.</p>
      )}
    </div>
  )
}
