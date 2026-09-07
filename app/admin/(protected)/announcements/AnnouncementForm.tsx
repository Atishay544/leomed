'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
export default function AnnouncementForm() {
  const router = useRouter()

  const [message, setMessage]     = useState('')
  const [bgColor, setBgColor]     = useState('#000000')
  const [textColor, setTextColor] = useState('#ffffff')
  const [linkUrl, setLinkUrl]     = useState('')
  const [linkText, setLinkText]   = useState('')
  const [sortOrder, setSortOrder]  = useState(0)
  const [isActive, setIsActive]   = useState(true)
  const [startsAt, setStarts]     = useState('')
  const [endsAt, setEnds]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const res = await fetch('/api/admin/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message:     message.trim(),
        bg_color:    bgColor,
        text_color:  textColor,
        link_url:    linkUrl.trim()  || null,
        link_text:   linkText.trim() || null,
        sort_order:  sortOrder,
        is_active:   isActive,
        starts_at:   startsAt || null,
        ends_at:     endsAt   || null,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(json.error ?? 'Failed to create announcement')
    } else {
      setMessage(''); setLinkUrl(''); setLinkText('')
      setStarts(''); setEnds('')
      router.refresh()
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-base font-semibold text-gray-800 mb-4">New Announcement</h2>

      {/* Live preview */}
      {message && (
        <div
          className="rounded-lg px-4 py-2.5 text-sm font-medium mb-4"
          style={{ backgroundColor: bgColor, color: textColor }}
        >
          {message}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Row 1: message + colors */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Message *</label>
            <input
              type="text" value={message} onChange={e => setMessage(e.target.value)} required
              placeholder="Free shipping on orders over ₹499!"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Background</label>
            <div className="flex gap-1.5">
              <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
                className="h-9 w-10 rounded border border-gray-300 p-0.5 cursor-pointer shrink-0" />
              <input type="text" value={bgColor} onChange={e => setBgColor(e.target.value)}
                className="w-24 border border-gray-300 rounded-lg px-2 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Text Color</label>
            <div className="flex gap-1.5">
              <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)}
                className="h-9 w-10 rounded border border-gray-300 p-0.5 cursor-pointer shrink-0" />
              <input type="text" value={textColor} onChange={e => setTextColor(e.target.value)}
                className="w-24 border border-gray-300 rounded-lg px-2 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
          </div>
        </div>

        {/* Row 2: link url + link text + position + schedule */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Link URL</label>
            <input type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
              placeholder="https://…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Link Text</label>
            <input type="text" value={linkText} onChange={e => setLinkText(e.target.value)}
              placeholder="Shop Now"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Position</label>
            <select value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
              <option value={0}>0 — Top (sticky)</option>
              <option value={1}>1 — Below nav</option>
              <option value={2}>2 — Below featured products</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Show from</label>
            <input type="datetime-local" value={startsAt} onChange={e => setStarts(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Hide after</label>
            <input type="datetime-local" value={endsAt} onChange={e => setEnds(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
        </div>

        {/* Row 3: active toggle + submit */}
        <div className="flex items-center gap-4 pt-1">
          <div className="flex items-center gap-2">
            <button type="button" role="switch" aria-checked={isActive}
              onClick={() => setIsActive(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isActive ? 'bg-green-500' : 'bg-gray-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isActive ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm text-gray-700">{isActive ? 'Active' : 'Inactive'}</span>
          </div>

          <button type="submit" disabled={saving}
            className="bg-gray-900 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
            {saving ? 'Creating…' : '+ Create Announcement'}
          </button>
        </div>
      </form>
    </div>
  )
}
