import { requireAdmin } from '@/lib/admin-auth'
import { getAdminNews } from '@/lib/admin-data'
import NewsForm from './NewsForm'
import NewsListItem from './NewsListItem'

export const metadata = { title: 'News & Articles' }

export default async function NewsPage() {
  await requireAdmin()
  const articles = await getAdminNews()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">News & Articles</h1>
        <p className="text-sm text-gray-500 mt-1">Published articles appear at /news on the public site.</p>
      </div>

      <NewsForm />

      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Existing Articles ({articles?.length ?? 0})
        </h2>
        {(!articles || articles.length === 0) ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 py-12 text-center text-gray-400 text-sm">
            No articles yet. Create one above.
          </div>
        ) : (
          <div className="space-y-3">
            {articles.map((a: any) => <NewsListItem key={a.id} article={a} />)}
          </div>
        )}
      </div>
    </div>
  )
}
