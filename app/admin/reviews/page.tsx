import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import ReviewActions from './ReviewActions'

export const metadata = { title: 'Reviews' }

interface PageProps {
  searchParams: Promise<{ filter?: string }>
}

export default async function ReviewsPage({ searchParams }: PageProps) {
  await requireAdmin()
  const supabase = createAdminClient()

  const params = await searchParams
  const filter = params.filter ?? 'pending'

  let query = supabase
    .from('reviews')
    .select(`
      id, rating, comment, is_approved, is_rejected, created_at,
      products(id, name),
      profiles(full_name)
    `)
    .order('created_at', { ascending: false })

  if (filter === 'pending') {
    query = query.eq('is_approved', false).eq('is_rejected', false)
  } else if (filter === 'approved') {
    query = query.eq('is_approved', true)
  } else if (filter === 'rejected') {
    query = query.eq('is_rejected', true)
  }

  const { data: reviews } = await query.limit(50)

  const tabs = [
    { key: 'pending',  label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'all',      label: 'All' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Reviews</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {tabs.map(tab => (
          <a
            key={tab.key}
            href={`/reviews?filter=${tab.key}`}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === tab.key
                ? 'bg-gray-900 text-white'
                : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </a>
        ))}
      </div>

      {/* Reviews list */}
      <div className="space-y-4">
        {reviews?.map(review => (
          <div key={review.id} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  {/* Star rating */}
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map(s => (
                      <svg
                        key={s}
                        className={`w-4 h-4 ${s <= review.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}`}
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <span className="text-sm font-medium text-gray-700">
                    {(review.profiles as any)?.full_name ?? 'Anonymous'}
                  </span>
                  <span className="text-xs text-gray-400">
                    on <span className="text-gray-600">{(review.products as any)?.name ?? '—'}</span>
                  </span>
                </div>

                {review.comment && (
                  <p className="text-sm text-gray-600 mt-1">{review.comment}</p>
                )}

                <div className="flex items-center gap-2 mt-2">
                  {review.is_approved && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Approved</span>
                  )}
                  {review.is_rejected && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Rejected</span>
                  )}
                  {!review.is_approved && !review.is_rejected && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Pending</span>
                  )}
                  <span className="text-xs text-gray-400">
                    {new Date(review.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                  </span>
                </div>
              </div>

              <ReviewActions
                reviewId={review.id}
                isApproved={review.is_approved}
                isRejected={review.is_rejected}
              />
            </div>
          </div>
        ))}

        {(!reviews || reviews.length === 0) && (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400">
            No {filter === 'all' ? '' : filter} reviews.
          </div>
        )}
      </div>
    </div>
  )
}
