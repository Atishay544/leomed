import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Link-based pagination — server component, no client JavaScript. Each page is
 * a real URL, so it survives a refresh and can be shared.
 */
export default function Pagination({
  page, pageCount, total, pageSize, searchParams, basePath,
}: {
  page: number
  pageCount: number
  total: number
  pageSize: number
  searchParams: Record<string, string | undefined>
  basePath: string
}) {
  if (total === 0) return null

  const href = (target: number) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(searchParams)) {
      if (value && key !== 'page') params.set(key, value)
    }
    if (target > 1) params.set('page', String(target))
    const qs = params.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }

  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  const linkClass =
    'inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 ' +
    'text-[12.5px] font-medium text-gray-700 transition hover:bg-gray-50'
  const disabledClass =
    'inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 ' +
    'text-[12.5px] font-medium text-gray-300 cursor-not-allowed'

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3">
      <p className="text-[12px] text-gray-500">
        Showing <span className="font-medium text-gray-700">{first}–{last}</span> of{' '}
        <span className="font-medium text-gray-700">{total}</span>
      </p>

      <div className="flex items-center gap-1.5">
        {page > 1 ? (
          <Link href={href(page - 1)} className={linkClass} rel="prev">
            <ChevronLeft size={14} /> Previous
          </Link>
        ) : (
          <span className={disabledClass}><ChevronLeft size={14} /> Previous</span>
        )}

        <span className="px-2 text-[12px] text-gray-500">Page {page} of {pageCount}</span>

        {page < pageCount ? (
          <Link href={href(page + 1)} className={linkClass} rel="next">
            Next <ChevronRight size={14} />
          </Link>
        ) : (
          <span className={disabledClass}>Next <ChevronRight size={14} /></span>
        )}
      </div>
    </div>
  )
}
