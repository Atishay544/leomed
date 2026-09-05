'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AboutForm({ initialTitle, initialBody }: { initialTitle: string; initialBody: string }) {
  const router = useRouter()
  const [title, setTitle] = useState(initialTitle)
  const [body, setBody]   = useState(initialBody)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [saved, setSaved]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSaved(false); setSaving(true)
    const res = await fetch('/api/admin/about', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), body }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed to save'); return }
    setSaved(true)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 max-w-2xl">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      {saved && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">Saved.</div>}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Page Title</label>
        <input type="text" value={title} onChange={e => setTitle(e.target.value)} required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Content</label>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={14}
          placeholder="Tell visitors about Leomed Pharma…"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none font-mono focus:outline-none focus:ring-2 focus:ring-gray-900" />
        <p className="text-[11px] text-gray-400 mt-1">Plain text — line breaks are preserved on the public page.</p>
      </div>
      <button type="submit" disabled={saving}
        className="bg-gray-900 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </form>
  )
}
