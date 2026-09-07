'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import ImageUploader from '../products/ImageUploader'
import ConfirmModal from '@/components/ui/ConfirmModal'

type Style = 'overlay' | 'image_only' | 'solid'

interface Banner {
  id: string
  display_style: string | null
  title: string | null
  subtitle: string | null
  image_url: string | null
  link_url: string | null
  link_text: string | null
  bg_color: string | null
  text_color: string | null
  sort_order: number
  is_active: boolean
}

export default function BannerListItem({ banner }: { banner: Banner }) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  // ── Edit form state ──────────────────────────────────────────────────────────
  const [style, setStyle]         = useState<Style>((banner.display_style as Style) ?? 'overlay')
  const [title, setTitle]         = useState(banner.title ?? '')
  const [subtitle, setSubtitle]   = useState(banner.subtitle ?? '')
  const [images, setImages]       = useState<string[]>(banner.image_url ? [banner.image_url] : [])
  const [linkUrl, setLinkUrl]     = useState(banner.link_url ?? '')
  const [linkText, setLinkText]   = useState(banner.link_text ?? '')
  const [bgColor, setBgColor]     = useState(banner.bg_color ?? '#111827')
  const [textColor, setTextColor] = useState(banner.text_color ?? '#ffffff')
  const [sortOrder, setSortOrder] = useState(String(banner.sort_order))
  const [isActive, setIsActive]   = useState(banner.is_active)

  function cancelEdit() {
    // Reset to original values
    setStyle((banner.display_style as Style) ?? 'overlay')
    setTitle(banner.title ?? '')
    setSubtitle(banner.subtitle ?? '')
    setImages(banner.image_url ? [banner.image_url] : [])
    setLinkUrl(banner.link_url ?? '')
    setLinkText(banner.link_text ?? '')
    setBgColor(banner.bg_color ?? '#111827')
    setTextColor(banner.text_color ?? '#ffffff')
    setSortOrder(String(banner.sort_order))
    setIsActive(banner.is_active)
    setError('')
    setIsEditing(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (style !== 'solid' && !images[0]) {
      setError('Please upload a banner image.')
      return
    }
    setBusy(true)
    const res = await fetch('/api/admin/banners', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id:            banner.id,
        display_style: style,
        title:         title.trim()    || null,
        subtitle:      subtitle.trim() || null,
        image_url:     images[0]       ?? null,
        link_url:      linkUrl.trim()  || null,
        link_text:     linkText.trim() || null,
        bg_color:      bgColor,
        text_color:    textColor,
        sort_order:    parseInt(sortOrder, 10) || 0,
        is_active:     isActive,
      }),
    })
    setBusy(false)
    if (!res.ok) {
      const j = await res.json()
      setError(j.error ?? 'Failed to update banner')
      return
    }
    setIsEditing(false)
    router.refresh()
  }

  async function toggleActive() {
    setBusy(true); setError('')
    const res = await fetch('/api/admin/banners', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: banner.id, is_active: !banner.is_active }),
    })
    setBusy(false)
    if (!res.ok) { const j = await res.json(); setError(j.error); return }
    router.refresh()
  }

  async function handleDelete() {
    setBusy(true); setError('')
    const res = await fetch('/api/admin/banners', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: banner.id }),
    })
    setBusy(false)
    setBusy(false)
    setShowConfirm(false)
    if (!res.ok) { const j = await res.json(); setError(j.error); return }
    router.refresh()
  }

  const showText   = style !== 'image_only'
  const showImage  = style !== 'solid'
  const showColors = style !== 'image_only'

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Banner preview */}
      <div
        className="relative h-32 flex items-center px-8"
        style={{ backgroundColor: banner.bg_color ?? '#111827' }}
      >
        {banner.image_url && (
          <Image
            src={banner.image_url}
            alt={banner.title ?? 'Banner'}
            fill
            sizes="(max-width: 768px) 100vw, 800px"
            className="object-cover opacity-30"
          />
        )}
        <div className="relative z-10" style={{ color: banner.text_color ?? '#ffffff' }}>
          {banner.title    && <p className="text-lg font-extrabold leading-tight">{banner.title}</p>}
          {banner.subtitle && <p className="text-sm opacity-80 mt-0.5">{banner.subtitle}</p>}
          {banner.link_text && (
            <span className="inline-block mt-2 text-xs border border-current px-3 py-1 rounded-full">
              {banner.link_text}
            </span>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div className="px-4 py-3 flex items-center justify-between gap-4 bg-gray-50 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 text-xs text-gray-500 flex-wrap">
          <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-white ${
            banner.display_style === 'featured_card' ? 'bg-purple-600'
              : banner.sort_order === 0 ? 'bg-blue-600'
              : banner.sort_order === 1 ? 'bg-orange-500' : 'bg-gray-400'
          }`}>
            {banner.display_style === 'featured_card'
              ? `Promo Card${banner.sort_order === 0 ? ' (Left)' : banner.sort_order === 1 ? ' (Right)' : ''}`
              : `Sort ${banner.sort_order} — ${banner.sort_order === 0 ? 'Hero Carousel' : banner.sort_order === 1 ? 'Deals Strip' : 'Extra'}`}
          </span>
          <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full font-medium ${
            banner.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
          }`}>
            {banner.is_active ? 'Active' : 'Inactive'}
          </span>
          {banner.link_url && <span className="truncate">→ {banner.link_url}</span>}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { setIsEditing(v => !v); setError('') }}
            disabled={busy}
            className="text-xs px-2.5 py-1 rounded text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-40"
          >
            {isEditing ? 'Close' : 'Edit'}
          </button>
          <button
            onClick={toggleActive}
            disabled={busy}
            className={`text-xs px-2.5 py-1 rounded transition-colors disabled:opacity-40 ${
              banner.is_active
                ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                : 'text-green-700 bg-green-50 hover:bg-green-100'
            }`}
          >
            {busy ? '…' : banner.is_active ? 'Deactivate' : 'Activate'}
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={busy}
            className="text-xs text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded transition-colors disabled:opacity-40"
          >
            Delete
          </button>
          {showConfirm && (
            <ConfirmModal
              message="Delete this banner? This cannot be undone."
              onConfirm={handleDelete}
              onCancel={() => setShowConfirm(false)}
              loading={busy}
            />
          )}
        </div>
      </div>

      {error && (
        <p className="px-4 pb-2 text-[11px] text-red-500">{error}</p>
      )}

      {/* ── Inline Edit Form ─────────────────────────────────────────────────── */}
      {isEditing && (
        <form onSubmit={handleSave} className="border-t border-gray-200 p-5 space-y-4 bg-white">
          <p className="text-sm font-semibold text-gray-800">Edit Banner</p>

          {/* Style picker */}
          <div className="grid grid-cols-3 gap-2">
            {(['overlay', 'image_only', 'solid'] as Style[]).map(s => (
              <button key={s} type="button" onClick={() => setStyle(s)}
                className={`text-left px-3 py-2.5 rounded-xl border-2 transition text-sm ${
                  style === s ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                <p className="font-semibold text-xs">
                  {s === 'overlay' ? '🌫️ Smoky Overlay' : s === 'image_only' ? '🖼️ Image Only' : '🎨 Solid Color'}
                </p>
              </button>
            ))}
          </div>

          {/* Image */}
          {showImage && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Banner Image
                <span className="text-gray-400 font-normal ml-1">
                  ({style === 'featured_card' ? '1200 × 1200 px (square)' : '2048 × 1143 px (16:9)'} · max 5 MB)
                </span>
              </label>
              <ImageUploader value={images} onChange={setImages} maxImages={1} />
            </div>
          )}

          {/* Text */}
          {showText && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="Banner title"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Subtitle</label>
                <input type="text" value={subtitle} onChange={e => setSubtitle(e.target.value)}
                  placeholder="Subtitle text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>
          )}

          {/* Link */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Link URL</label>
              <input type="text" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                placeholder="/products"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            {showText && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Button Text</label>
                <input type="text" value={linkText} onChange={e => setLinkText(e.target.value)}
                  placeholder="Shop Now"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            )}
          </div>

          {/* Colors */}
          {showColors && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Background Color</label>
                <div className="flex gap-1.5">
                  <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
                    className="h-9 w-10 rounded border border-gray-300 p-0.5 cursor-pointer shrink-0" />
                  <input type="text" value={bgColor} onChange={e => setBgColor(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
              </div>
              {showText && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Text Color</label>
                  <div className="flex gap-1.5">
                    <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)}
                      className="h-9 w-10 rounded border border-gray-300 p-0.5 cursor-pointer shrink-0" />
                    <input type="text" value={textColor} onChange={e => setTextColor(e.target.value)}
                      className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sort + active */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600">Sort</label>
              <input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)}
                className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div className="flex items-center gap-2">
              <button type="button" role="switch" aria-checked={isActive}
                onClick={() => setIsActive(v => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isActive ? 'bg-green-500' : 'bg-gray-300'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isActive ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <span className="text-sm text-gray-700">{isActive ? 'Active' : 'Inactive'}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={busy}
              className="bg-gray-900 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {busy ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" onClick={cancelEdit} disabled={busy}
              className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
