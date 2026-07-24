'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, GripVertical } from 'lucide-react'
import ImageUploader from './ImageUploader'
import VideoUploader from './VideoUploader'
import SkuMatrix, { type SkuRow } from './SkuMatrix'

interface Category { id: string; name: string }
interface VariantOption { value: string; images: string[] }
interface VariantRow { name: string; optionInput: string; options: VariantOption[] }

interface Product {
  id: string
  name: string
  slug: string
  description: string | null
  price: number
  compare_price: number | null
  stock: number
  weight_grams: number | null
  category_id: string | null
  is_active: boolean
  images: string[]
  video_url?: string | null
}

interface Props {
  product?: Product
  categories: Category[]
  initialVariants?: VariantRow[]
  initialSkus?: SkuRow[]
}

function slugify(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function comboKey(attrs: Record<string, string>) {
  return Object.entries(attrs).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('|')
}

const INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900'
const LABEL = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

export default function ProductForm({ product, categories, initialVariants = [], initialSkus = [] }: Props) {
  const router = useRouter()
  const isEdit = !!product

  const [name, setName]             = useState(product?.name ?? '')
  const [slug, setSlug]             = useState(product?.slug ?? '')
  const [description, setDesc]      = useState(product?.description ?? '')
  const [price, setPrice]           = useState(String(product?.price ?? ''))
  const [comparePrice, setCompare]  = useState(String(product?.compare_price ?? ''))
  const [stock, setStock]           = useState(String(product?.stock ?? '0'))
  const [weight, setWeight]         = useState(String(product?.weight_grams ?? '500'))
  const [categoryId, setCategoryId] = useState(product?.category_id ?? '')
  const [isActive, setIsActive]     = useState(product?.is_active ?? true)
  const [images, setImages]         = useState<string[]>(product?.images ?? [])
  const [videoUrl, setVideoUrl]     = useState<string | null>(product?.video_url ?? null)
  const [variants, setVariants]     = useState<VariantRow[]>(initialVariants)
  const [skus, setSkus]             = useState<SkuRow[]>(initialSkus)
  // tracks which option is the main display: "variantName::optionValue"
  const [defaultOptionKey, setDefaultOptionKey] = useState<string | null>(() => {
    for (const v of initialVariants) {
      for (const o of v.options) {
        if ((o as any).isDefault) return `${v.name}::${o.value}`
      }
    }
    return null
  })
  const [openOptionKey, setOpenOptionKey] = useState<string | null>(null)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => { if (!isEdit) setSlug(slugify(name)) }, [name, isEdit])

  // ── Variant helpers ──────────────────────────────────────────────────────
  function addVariant() { setVariants(v => [...v, { name: '', optionInput: '', options: [] }]) }
  function removeVariant(i: number) {
    setVariants(v => v.filter((_, idx) => idx !== i))
    setOpenOptionKey(null)
  }
  function setVariantName(i: number, val: string) {
    setVariants(v => v.map((row, idx) => idx === i ? { ...row, name: val } : row))
  }
  function setVariantOptionInput(i: number, val: string) {
    setVariants(v => v.map((row, idx) => idx === i ? { ...row, optionInput: val } : row))
  }
  function addOption(i: number) {
    setVariants(v => v.map((row, idx) => {
      if (idx !== i) return row
      const trimmed = row.optionInput.trim()
      if (!trimmed || row.options.some(o => o.value === trimmed)) return { ...row, optionInput: '' }
      return { ...row, options: [...row.options, { value: trimmed, images: [] }], optionInput: '' }
    }))
  }
  function removeOption(varIdx: number, optIdx: number) {
    const key = `${varIdx}-${optIdx}`
    if (openOptionKey === key) setOpenOptionKey(null)
    const removedValue = variants[varIdx].options[optIdx]?.value
    const variantName = variants[varIdx].name
    setVariants(v => v.map((row, idx) =>
      idx === varIdx ? { ...row, options: row.options.filter((_, oi) => oi !== optIdx) } : row
    ))
    if (variantName.trim() && removedValue) {
      setSkus(prev => prev.filter(s => s.attributes[variantName] !== removedValue))
    }
  }
  function setOptionImages(varIdx: number, optIdx: number, images: string[]) {
    setVariants(v => v.map((row, idx) =>
      idx === varIdx
        ? { ...row, options: row.options.map((opt, oi) => oi === optIdx ? { ...opt, images } : opt) }
        : row
    ))
  }
  function toggleOptionPanel(varIdx: number, optIdx: number) {
    const key = `${varIdx}-${optIdx}`
    setOpenOptionKey(prev => prev === key ? null : key)
  }
  function handleOptionKeyDown(e: React.KeyboardEvent, i: number) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addOption(i) }
  }

  // ── Variant / stock helpers ──────────────────────────────────────────────
  const activeVariants = variants.filter(v => v.name.trim() && v.options.length > 0)
  const hasVariants = activeVariants.length > 0
  const isSingleVariant = activeVariants.length === 1

  function getOptionStock(variantName: string, optionValue: string): number {
    const key = comboKey({ [variantName]: optionValue })
    return skus.find(s => comboKey(s.attributes) === key)?.stock ?? 0
  }

  function setOptionStock(variantName: string, optionValue: string, newStock: number) {
    const attrs = { [variantName]: optionValue }
    const key = comboKey(attrs)
    setSkus(prev => {
      if (prev.some(s => comboKey(s.attributes) === key))
        return prev.map(s => comboKey(s.attributes) === key ? { ...s, stock: newStock } : s)
      return [...prev, { attributes: attrs, stock: newStock }]
    })
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)

    let defaultVariantRef: { variantName: string; optionValue: string } | null = null
    if (defaultOptionKey) {
      const [variantName, optionValue] = defaultOptionKey.split('::')
      defaultVariantRef = { variantName, optionValue }
    }

    const payload = {
      name:          name.trim(),
      slug:          slug.trim(),
      description:   description.trim() || null,
      price:         parseFloat(price),
      compare_price: comparePrice ? parseFloat(comparePrice) : null,
      stock:         parseInt(stock, 10),
      weight_grams:  parseInt(weight, 10) || 500,
      category_id:   categoryId || null,
      is_active:     isActive,
      images,
      video_url:     videoUrl || null,
      variants:      variants
        .filter(v => v.name.trim() && v.options.length > 0)
        .map(v => ({ name: v.name.trim(), options: v.options })),
      skus:              skus.filter(s => Object.keys(s.attributes).length > 0),
      defaultVariantRef,
    }

    if (isNaN(payload.price) || payload.price < 0) {
      setError('Price must be a valid positive number.')
      setSaving(false)
      return
    }

    const res = await fetch('/api/admin/products', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isEdit ? { id: product!.id, ...payload } : payload),
    })

    const json = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(json.error ?? 'Failed to save product')
    } else {
      router.push('/admin/products')
      router.refresh()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5">

        {/* ── LEFT COLUMN ── */}
        <div className="space-y-5">

          {/* Basic Info */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Basic Info</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={LABEL}>Product Name *</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} required
                  placeholder="e.g. Classic Cotton T-Shirt"
                  className={INPUT} />
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL}>Slug *</label>
                <div className={`flex items-center border rounded-lg overflow-hidden ${isEdit ? 'border-gray-200 bg-gray-50' : 'border-gray-300 focus-within:ring-2 focus-within:ring-gray-900'}`}>
                  <span className="px-3 py-2 text-xs text-gray-400 bg-gray-50 border-r border-gray-200 shrink-0">/products/</span>
                  <input type="text" value={slug} required readOnly={isEdit}
                    onChange={e => { if (!isEdit) setSlug(e.target.value) }}
                    className={`flex-1 px-3 py-2 text-sm font-mono focus:outline-none ${isEdit ? 'text-gray-400 cursor-not-allowed' : ''}`} />
                </div>
                {isEdit && (
                  <p className="text-[11px] text-amber-600 mt-1">Slug is locked after creation — changing it would break existing product URLs and SEO.</p>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL}>Description</label>
                <textarea value={description} onChange={e => setDesc(e.target.value)} rows={5}
                  placeholder="Describe the product — materials, fit, features…"
                  className={INPUT + ' resize-none'} />
              </div>
            </div>
          </div>

          {/* Pricing & Inventory */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Pricing & Inventory</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className={LABEL}>Price (₹) *</label>
                <input type="number" min="0" step="0.01" value={price}
                  onChange={e => setPrice(e.target.value)} required placeholder="0.00"
                  className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Compare At (₹)</label>
                <input type="number" min="0" step="0.01" value={comparePrice}
                  onChange={e => setCompare(e.target.value)} placeholder="0.00"
                  className={INPUT} />
                <p className="text-[11px] text-gray-400 mt-1">Shows strikethrough MRP</p>
              </div>
              <div>
                <label className={LABEL}>Stock {!hasVariants && '*'}</label>
                <input type="number" min="0" step="1"
                  value={hasVariants ? '' : stock}
                  onChange={e => setStock(e.target.value)}
                  required={!hasVariants}
                  disabled={hasVariants}
                  placeholder={hasVariants ? '—' : '0'}
                  className={INPUT + (hasVariants ? ' bg-gray-100 text-gray-400 cursor-not-allowed' : '')} />
                {hasVariants
                  ? <p className="text-[11px] text-emerald-500 mt-1">Controlled by variations below</p>
                  : null}
              </div>
              <div>
                <label className={LABEL}>Weight (grams) *</label>
                <input type="number" min="1" step="1" value={weight}
                  onChange={e => setWeight(e.target.value)} required
                  className={INPUT} placeholder="e.g. 500" />
                <p className="text-[11px] text-gray-400 mt-1">Used for shipping rate calculation</p>
              </div>
              <div>
                <label className={LABEL}>Category</label>
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                  className={INPUT}>
                  <option value="">None</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            {/* Discount preview */}
            {price && comparePrice && parseFloat(comparePrice) > parseFloat(price) && (
              <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <span className="font-semibold">
                  {Math.round((1 - parseFloat(price) / parseFloat(comparePrice)) * 100)}% OFF
                </span>
                <span className="text-green-600">
                  · customer saves ₹{Math.round(parseFloat(comparePrice) - parseFloat(price))}
                </span>
              </div>
            )}
          </div>

          {/* Variations */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Variations</h2>
                <p className="text-xs text-gray-400 mt-0.5">Size, Color, Material — click a chip to upload images per option</p>
              </div>
              <div className="flex items-center gap-2">
                {isSingleVariant && (
                  <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                    {skus.reduce((s, r) => s + r.stock, 0)} pcs total
                  </span>
                )}
              <button type="button" onClick={addVariant}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50 transition">
                <Plus size={13} /> Add Variation
              </button>
              </div>
            </div>

            {variants.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
                <p className="text-sm text-gray-400">No variations — click &ldquo;Add Variation&rdquo; to add size, color, etc.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {variants.map((v, i) => (
                  <div key={i} className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
                    <div className="flex items-center gap-3">
                      <GripVertical size={14} className="text-gray-400 shrink-0" />
                      <input type="text" value={v.name} onChange={e => setVariantName(i, e.target.value)}
                        placeholder="Variation name (e.g. Size, Color)"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                      <button type="button" onClick={() => removeVariant(i)}
                        className="text-gray-400 hover:text-red-500 transition p-1">
                        <X size={16} />
                      </button>
                    </div>
                    <div className="space-y-2">
                      {/* Add new option input */}
                      <div className="flex gap-2">
                        <input type="text" value={v.optionInput}
                          onChange={e => setVariantOptionInput(i, e.target.value)}
                          onKeyDown={e => handleOptionKeyDown(e, i)}
                          placeholder="Type option + Enter  (e.g. Red, Blue, Green)"
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                        <button type="button" onClick={() => addOption(i)}
                          className="text-xs font-medium border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-white bg-gray-50 transition">
                          Add
                        </button>
                      </div>

                      {/* One row per option with its own image upload */}
                      {v.options.map((opt, oi) => {
                        const key = `${i}-${oi}`
                        const isOpen = openOptionKey === key
                        return (
                          <div key={oi} className="border border-gray-200 rounded-xl bg-white overflow-hidden">
                            {/* Option row */}
                            <div className="flex items-center gap-3 px-3 py-2.5">
                              <span className="flex-1 text-sm font-medium text-gray-800">{opt.value}</span>
                              {isSingleVariant && v.name.trim() && (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-xs text-gray-400">Stock:</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={getOptionStock(v.name, opt.value) || ''}
                                    placeholder="0"
                                    onChange={e => setOptionStock(v.name, opt.value, Math.max(0, parseInt(e.target.value, 10) || 0))}
                                    className="w-16 text-right border border-gray-300 rounded-lg px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-gray-900"
                                  />
                                </div>
                              )}
                              <span className="text-xs text-gray-400">
                                {opt.images.length > 0
                                  ? `${opt.images.length} photo${opt.images.length > 1 ? 's' : ''}`
                                  : 'No photos'}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleOptionPanel(i, oi)}
                                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                                  isOpen
                                    ? 'bg-emerald-600 text-white'
                                    : opt.images.length > 0
                                      ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                              >
                                📸 {isOpen ? 'Close' : opt.images.length > 0 ? 'Edit Photos' : 'Add Photos'}
                              </button>
                              {v.name.trim() && opt.images.length > 0 && (() => {
                                const optKey = `${v.name}::${opt.value}`
                                const isMainDisplay = defaultOptionKey === optKey
                                return (
                                  <button
                                    type="button"
                                    onClick={() => setDefaultOptionKey(prev => prev === optKey ? null : optKey)}
                                    title={isMainDisplay ? 'Main display image — click to unset' : 'Set as main display image for listing cards'}
                                    className={`text-base transition shrink-0 ${isMainDisplay ? 'opacity-100' : 'opacity-25 hover:opacity-70'}`}
                                  >
                                    ⭐
                                  </button>
                                )
                              })()}
                              <button type="button" onClick={() => removeOption(i, oi)}
                                className="text-gray-300 hover:text-red-500 transition p-1">
                                <X size={14} />
                              </button>
                            </div>

                            {/* Expandable image upload panel */}
                            {isOpen && (
                              <div className="border-t border-emerald-100 bg-emerald-50/50 px-3 py-3 space-y-2">
                                <p className="text-xs text-emerald-600 font-medium">
                                  Upload 2–5 photos for &ldquo;{opt.value}&rdquo; — these show in the gallery when shoppers select this option
                                </p>
                                <ImageUploader
                                  value={opt.images}
                                  onChange={imgs => setOptionImages(i, oi, imgs)}
                                  maxImages={5}
                                />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {/* Stock per combination — only needed when 2+ variants (cartesian combos) */}
                {!isSingleVariant && hasVariants && (
                  <div className="mt-4 border-t border-gray-200 pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Stock per Combination</span>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Required</span>
                    </div>
                    <SkuMatrix variants={variants} value={skus} onChange={setSkus} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="space-y-5">

          {/* Status */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Status</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  {isActive ? 'Active' : 'Inactive'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {isActive ? 'Visible in store' : 'Hidden from store'}
                </p>
              </div>
              <button type="button" role="switch" aria-checked={isActive}
                onClick={() => setIsActive(v => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isActive ? 'bg-green-500' : 'bg-gray-300'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isActive ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>

          {/* Images */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Product Images</h2>
              <p className="text-xs text-gray-400 mt-0.5">Up to 5 · first image is main photo</p>
            </div>
            <ImageUploader value={images} onChange={setImages} maxImages={5} />
          </div>

          {/* Video */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Product Video</h2>
              <p className="text-xs text-gray-400 mt-0.5">Optional · MP4 recommended · max 100 MB</p>
            </div>
            <VideoUploader value={videoUrl} onChange={setVideoUrl} />
          </div>

          {/* Save actions — sticky at bottom of right col */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3">
            <button type="submit" disabled={saving}
              className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Product'}
            </button>
            <button type="button" onClick={() => router.back()}
              className="w-full border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}
