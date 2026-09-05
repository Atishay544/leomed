'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import ImageUploader from '../products/ImageUploader'

function slugify(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export default function NewsForm() {
  const router = useRouter()
  const [title, setTitle]       = useState('')
  const [slug, setSlug]         = useState('')
  const [excerpt, setExcerpt]   = useState('')
  const [body, setBody]         = useState('')
  const [images, setImages]     = useState<string[]>([])
  const [isPublished, setIsPublished] = useState(false)
  const [sortOrder, setSortOrder] = useState('0')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => { setSlug(slugify(title)) }, [title])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const res = await fetch('/api/admin/news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        slug: slug.trim(),
        excerpt: excerpt.trim() || null,
        body: body.trim(),
        cover_image_url: images[0] ?? null,
        is_published: isPublished,
        sort_order: parseInt(sortOrder, 10) || 0,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed to create article'); return }
    setTitle(''); setExcerpt(''); setBody(''); setImages([]); setIsPublished(false)
    router.refresh()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-base font-semibold text-gray-800 mb-4">New Article</h2>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Slug *</label>
          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-gray-900">
            <span className="px-3 py-2 text-xs text-gray-400 bg-gray-50 border-r border-gray-200 shrink-0">/news/</span>
            <input type="text" value={slug} onChange={e => setSlug(e.target.value)} required
              className="flex-1 px-3 py-2 text-sm font-mono focus:outline-none" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Excerpt</label>
          <input type="text" value={excerpt} onChange={e => setExcerpt(e.target.value)}
            placeholder="Short summary shown on the news list"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Body *</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={6} required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Cover Image</label>
          <ImageUploader value={images} onChange={setImages} maxImages={1} />
        </div>
        <div className="flex items-center gap-4 flex-wrap pt-1">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-600">Sort</label>
            <input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)}
              className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" role="switch" aria-checked={isPublished}
              onClick={() => setIsPublished(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isPublished ? 'bg-green-500' : 'bg-gray-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isPublished ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm text-gray-700">{isPublished ? 'Published' : 'Draft'}</span>
          </div>
          <button type="submit" disabled={saving}
            className="bg-gray-900 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
            {saving ? 'Creating…' : '+ Create Article'}
          </button>
        </div>
      </form>
    </div>
  )
}
