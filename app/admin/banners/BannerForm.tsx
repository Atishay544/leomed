'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import ImageUploader from '../products/ImageUploader'

type Style = 'overlay' | 'image_only' | 'solid' | 'featured_card'

const STYLE_OPTIONS: { value: Style; label: string; desc: string }[] = [
  { value: 'overlay',       label: '🌫️ Smoky Overlay',  desc: 'Image with dark overlay + optional text' },
  { value: 'image_only',    label: '🖼️ Image Only',      desc: 'Full image, no text, click = redirect' },
  { value: 'solid',         label: '🎨 Solid Color',     desc: 'Solid background + text, no image needed' },
  { value: 'featured_card', label: '🃏 Promo Card',      desc: 'For Him / For Her — 2-column home section' },
]

export default function BannerForm() {
  const router = useRouter()
  const [style, setStyle]         = useState<Style>('overlay')
  const [title, setTitle]         = useState('')
  const [subtitle, setSubtitle]   = useState('')
  const [images, setImages]       = useState<string[]>([])
  const [linkUrl, setLinkUrl]     = useState('')
  const [linkText, setLinkText]   = useState('')
  const [bgColor, setBgColor]     = useState('#111827')
  const [textColor, setTextColor] = useState('#ffffff')
  const [sortOrder, setSortOrder] = useState('0')
  const [isActive, setIsActive]   = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (style !== 'solid' && !images[0]) {
      setError('Please upload a banner image.')
      return
    }

    setSaving(true)
    const res = await fetch('/api/admin/banners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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

    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed to create banner'); return }

    setTitle(''); setSubtitle(''); setImages([]); setLinkUrl(''); setLinkText('')
    router.refresh()
  }

  const showText   = style !== 'image_only'
  const showImage  = style !== 'solid'
  const showColors = style !== 'image_only'
  const isPromoCard = style === 'featured_card'

  // Recommended upload size per position
  const recommendedSize = isPromoCard ? '1200 × 1200 px (square)' : '2048 × 1143 px (16:9)'

  // Where this banner will actually render, based on style + sort
  const positionDescription = isPromoCard
    ? 'Promo Card — the "For Him / For Her" 2-column section. Sort 0 = left card, Sort 1 = right card.'
    : sortOrder === '0'
      ? 'Top Hero Carousel — the full-width slideshow at the top of the home page.'
      : sortOrder === '1'
        ? 'Deals Strip — the wide promo banner further down the home page.'
        : `Extra (Sort ${sortOrder}) — not shown in a standard slot. Use Sort 0 for Hero or Sort 1 for the Deals strip.`

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-base font-semibold text-gray-800 mb-4">New Banner</h2>

      {/* Style picker */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        {STYLE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setStyle(opt.value)}
            className={`text-left px-3 py-2.5 rounded-xl border-2 transition text-sm ${
              style === opt.value
                ? 'border-gray-900 bg-gray-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <p className="font-semibold text-gray-900">{opt.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
          </button>
        ))}
      </div>

      {/* Position guide — tells the admin exactly where this banner lands + what size to upload */}
      <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs space-y-1">
        <p className="font-semibold text-emerald-900">📍 Where this banner appears</p>
        <p className="text-emerald-700">{positionDescription}</p>
        <p className="text-emerald-500">
          Recommended image: <strong className="text-emerald-700">{recommendedSize}</strong>
        </p>
      </div>

      {/* Live preview */}
      <div className="rounded-xl overflow-hidden mb-5 relative" style={{ minHeight: '96px' }}>
        {style === 'image_only' && (
          <div className="relative h-36 bg-gray-200 flex items-center justify-center">
            {images[0]
              ? <Image src={images[0]} alt="preview" fill className="object-cover" />
              : <p className="text-gray-400 text-sm">Upload image to preview</p>}
            {linkUrl && (
              <div className="absolute inset-0 flex items-end justify-center pb-3 z-10">
                <span className="text-xs bg-black/50 text-white px-3 py-1 rounded-full">
                  Clicks → {linkUrl}
                </span>
              </div>
            )}
          </div>
        )}

        {style === 'overlay' && (
          <div className="relative h-36 flex items-center px-8" style={{ backgroundColor: bgColor }}>
            {images[0] && (
              <Image src={images[0]} alt="preview" fill className="object-cover opacity-30" />
            )}
            <div className="relative z-10" style={{ color: textColor }}>
              <p className="font-extrabold text-xl leading-tight">{title || 'Banner Title'}</p>
              {subtitle && <p className="text-sm mt-1 opacity-80">{subtitle}</p>}
              {linkText && (
                <span className="inline-block mt-2 text-xs border border-current px-3 py-1 rounded-full">
                  {linkText}
                </span>
              )}
            </div>
          </div>
        )}

        {style === 'solid' && (
          <div className="relative h-36 flex items-center justify-center px-8 text-center"
            style={{ backgroundColor: bgColor }}>
            <div style={{ color: textColor }}>
              <p className="font-extrabold text-2xl leading-tight">{title || 'Banner Title'}</p>
              {subtitle && <p className="text-sm mt-1 opacity-80">{subtitle}</p>}
              {linkText && (
                <span className="inline-block mt-3 text-xs border border-current px-4 py-1.5 rounded-full">
                  {linkText}
                </span>
              )}
            </div>
          </div>
        )}

        {style === 'featured_card' && (
          <div className="relative h-36 overflow-hidden rounded-xl flex" style={{ backgroundColor: bgColor }}>
            {images[0] && (
              <Image src={images[0]} alt="preview" fill className="object-cover object-right" />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-transparent" />
            <div className="relative z-10 p-4 flex flex-col justify-between w-1/2">
              <p className="font-bold italic text-xl leading-tight drop-shadow-sm"
                style={{ color: textColor, fontFamily: 'Georgia, serif' }}>
                {title || 'For Him'}
              </p>
              <span className="inline-flex items-center gap-1 self-start bg-black text-white text-[9px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full">
                {linkText || 'View Collection'} →
              </span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Image upload */}
        {showImage && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Banner Image{style === 'overlay' ? <span className="text-red-500 ml-0.5">*</span> : ''}
              <span className="text-gray-400 font-normal ml-1">({recommendedSize} · max 5 MB)</span>
            </label>
            <ImageUploader value={images} onChange={setImages} maxImages={1} />
          </div>
        )}

        {/* Text fields */}
        {showText && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Title <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="New Season Arrivals"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Subtitle <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input type="text" value={subtitle} onChange={e => setSubtitle(e.target.value)}
                placeholder="Discover the latest styles"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
          </div>
        )}

        {/* Link + CTA */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Link URL <span className="text-gray-400 font-normal">(optional — defaults to /products)</span>
            </label>
            <input type="text" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
              placeholder="/products"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          {showText && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Button Text <span className="text-gray-400 font-normal">(leave empty = no button)</span>
              </label>
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

        {/* Sort + active + submit */}
        <div className="flex items-center gap-4 flex-wrap pt-1">
          {isPromoCard && (
            <p className="w-full text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              💡 <strong>Promo Cards</strong> appear in the &quot;For Him / For Her&quot; section on the home page. Create 2 cards — sort 0 = left, sort 1 = right.
            </p>
          )}
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
          <button type="submit" disabled={saving}
            className="bg-gray-900 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
            {saving ? 'Creating…' : '+ Create Banner'}
          </button>
        </div>
      </form>
    </div>
  )
}
