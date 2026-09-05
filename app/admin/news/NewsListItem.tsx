'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import ImageUploader from '../products/ImageUploader'
import ConfirmModal from '@/components/ui/ConfirmModal'

interface Article {
  id: string
  title: string
  slug: string
  excerpt: string | null
  body: string
  cover_image_url: string | null
  is_published: boolean
  sort_order: number
}

export default function NewsListItem({ article }: { article: Article }) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  const [title, setTitle]     = useState(article.title)
  const [excerpt, setExcerpt] = useState(article.excerpt ?? '')
  const [body, setBody]       = useState(article.body)
  const [images, setImages]   = useState<string[]>(article.cover_image_url ? [article.cover_image_url] : [])
  const [sortOrder, setSortOrder] = useState(String(article.sort_order))

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setBusy(true)
    const res = await fetch('/api/admin/news', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: article.id,
        title: title.trim(),
        excerpt: excerpt.trim() || null,
        body: body.trim(),
        cover_image_url: images[0] ?? null,
        sort_order: parseInt(sortOrder, 10) || 0,
      }),
    })
    setBusy(false)
    if (!res.ok) { const j = await res.json(); setError(j.error); return }
    setIsEditing(false)
    router.refresh()
  }

  async function togglePublished() {
    setBusy(true); setError('')
    const res = await fetch('/api/admin/news', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: article.id, is_published: !article.is_published }),
    })
    setBusy(false)
    if (!res.ok) { const j = await res.json(); setError(j.error); return }
    router.refresh()
  }

  async function handleDelete() {
    setBusy(true); setError('')
    const res = await fetch('/api/admin/news', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: article.id }),
    })
    setBusy(false); setShowConfirm(false)
    if (!res.ok) { const j = await res.json(); setError(j.error); return }
    router.refresh()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-gray-200 relative">
            {article.cover_image_url
              ? <Image src={article.cover_image_url} alt={article.title} fill className="object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-lg text-gray-300">📰</div>}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-900 text-sm truncate">{article.title}</p>
            <p className="text-xs text-gray-400 truncate">/news/{article.slug}</p>
          </div>
          <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            article.is_published ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
          }`}>
            {article.is_published ? 'Published' : 'Draft'}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => { setIsEditing(v => !v); setError('') }} disabled={busy}
            className="text-xs px-2.5 py-1 rounded text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-40">
            {isEditing ? 'Close' : 'Edit'}
          </button>
          <button onClick={togglePublished} disabled={busy}
            className={`text-xs px-2.5 py-1 rounded transition-colors disabled:opacity-40 ${
              article.is_published ? 'text-amber-700 bg-amber-50 hover:bg-amber-100' : 'text-green-700 bg-green-50 hover:bg-green-100'
            }`}>
            {busy ? '…' : article.is_published ? 'Unpublish' : 'Publish'}
          </button>
          <button onClick={() => setShowConfirm(true)} disabled={busy}
            className="text-xs text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded transition-colors disabled:opacity-40">
            Delete
          </button>
          {showConfirm && (
            <ConfirmModal message="Delete this article? This cannot be undone."
              onConfirm={handleDelete} onCancel={() => setShowConfirm(false)} loading={busy} />
          )}
        </div>
      </div>

      {error && <p className="px-4 pb-2 text-[11px] text-red-500">{error}</p>}

      {isEditing && (
        <form onSubmit={handleSave} className="border-t border-gray-200 p-5 space-y-4 bg-gray-50">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Excerpt</label>
            <input type="text" value={excerpt} onChange={e => setExcerpt(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Body</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={6}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white resize-none focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cover Image</label>
            <ImageUploader value={images} onChange={setImages} maxImages={1} />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-gray-600">Sort</label>
            <input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)}
              className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={busy}
              className="bg-gray-900 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {busy ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" onClick={() => setIsEditing(false)} disabled={busy}
              className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
