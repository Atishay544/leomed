'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Star, ShieldCheck } from 'lucide-react'
import type { User } from '@supabase/supabase-js'

interface Props { productId: string }

export default function ReviewForm({ productId }: Props) {
  const [user, setUser]                 = useState<User | null>(null)
  const [loading, setLoading]           = useState(true)
  const [alreadyReviewed, setAlready]   = useState(false)
  const [rating, setRating]             = useState(0)
  const [hovered, setHovered]           = useState(0)
  const [comment, setComment]           = useState('')
  const [submitting, setSubmitting]     = useState(false)
  const [submitted, setSubmitted]       = useState(false)
  const [error, setError]               = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setUser(user)
      if (user) {
        const { data } = await supabase
          .from('reviews')
          .select('id')
          .eq('product_id', productId)
          .eq('user_id', user.id)
          .maybeSingle()
        if (data) setAlready(true)
      }
      setLoading(false)
    })
  }, [productId])

  if (loading) return null
  if (!user) return (
    <div className="mt-10">
      <h2 className="text-xl font-bold mb-4">Write a Review</h2>
      <p className="text-sm text-gray-500 bg-gray-50 border rounded-xl px-5 py-4">
        <a href="/login" className="underline font-medium">Log in</a> to write a review.
      </p>
    </div>
  )

  if (alreadyReviewed) return (
    <div className="mt-10">
      <h2 className="text-xl font-bold mb-4">Write a Review</h2>
      <p className="text-sm text-gray-500 bg-gray-50 border rounded-xl px-5 py-4">
        You&apos;ve already reviewed this product.
      </p>
    </div>
  )

  if (submitted) return (
    <div className="mt-10">
      <h2 className="text-xl font-bold mb-4">Write a Review</h2>
      <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-4 text-sm font-medium flex items-center gap-2">
        <ShieldCheck size={16} /> Thank you! Your review is pending approval.
      </div>
    </div>
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (rating === 0) { setError('Please select a star rating.'); return }
    if (comment.trim().length < 10) { setError('Review must be at least 10 characters.'); return }

    setSubmitting(true)
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, rating, comment }),
    })
    const json = await res.json()
    setSubmitting(false)

    if (!res.ok) {
      setError(json.error ?? 'Failed to submit review.')
      return
    }
    setSubmitted(true)
  }

  return (
    <div className="mt-10">
      <h2 className="text-xl font-bold mb-4">Write a Review</h2>
      <form onSubmit={handleSubmit} className="bg-gray-50 border rounded-2xl p-6 space-y-4 max-w-xl">
        {/* Star rating */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Your Rating *</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(star => (
              <button key={star} type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
                className="focus:outline-none"
                aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}>
                <Star size={28} className={
                  star <= (hovered || rating)
                    ? 'fill-amber-400 text-amber-400 transition'
                    : 'text-gray-300 transition'
                } />
              </button>
            ))}
          </div>
        </div>

        {/* Comment */}
        <div>
          <label htmlFor="review-comment" className="block text-sm font-medium text-gray-700 mb-1">
            Review *
          </label>
          <textarea
            id="review-comment"
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Share your thoughts (min 10 characters)"
            rows={4}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 bg-white resize-none"
            required
            minLength={10}
          />
          <p className="text-xs text-gray-400 mt-1">{comment.length} characters</p>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting}
          className="bg-black text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed">
          {submitting ? 'Submitting…' : 'Submit Review'}
        </button>
        <p className="text-xs text-gray-400 flex items-center gap-1">
          <ShieldCheck size={12} /> Only verified buyers can submit reviews.
        </p>
      </form>
    </div>
  )
}
