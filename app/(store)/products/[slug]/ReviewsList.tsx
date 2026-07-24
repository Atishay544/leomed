import { Star, ShieldCheck } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function ReviewsList({ reviews }: { reviews: any[] }) {
  return (
    <div className="space-y-5">
      {reviews.map(r => (
        <div key={r.id} className="border-b pb-5">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <div className="flex">
              {[1,2,3,4,5].map(s => (
                <Star key={s} size={14}
                  className={s <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'} />
              ))}
            </div>
            <span className="text-sm font-medium">{r.profiles?.full_name ?? 'Customer'}</span>
            {r.is_verified_purchase && (
              <span className="inline-flex items-center gap-1 text-[11px] text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                <ShieldCheck size={11} /> Verified Purchase
              </span>
            )}
            <span className="text-xs text-gray-400">
              {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
            </span>
          </div>
          {r.comment && <p className="text-sm text-gray-600">{r.comment}</p>}
        </div>
      ))}
    </div>
  )
}
