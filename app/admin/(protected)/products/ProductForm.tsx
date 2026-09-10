'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import ImageUploader from './ImageUploader'
import VideoUploader from './VideoUploader'

interface Category { id: string; name: string }

interface Product {
  id: string
  name: string
  slug: string
  description: string | null
  composition: string | null
  generic_name?: string | null
  uses?: string | null
  mrp?: number | null
  pack_size?: string | null
  unit?: string | null
  category_id: string | null
  is_active: boolean
  images: string[]
  video_url?: string | null
  merchandising_tag?: string | null
}

/** One ERP Product Master row, exactly the fields propagated into the
 *  storefront listing the moment it's linked. */
interface ErpProductOption {
  id: string
  product_name: string
  product_code: string
  generic_name: string | null
  category: string | null
  composition: string | null
  uses: string | null
  mrp: number | null
  pack_size: string | null
  unit: string | null
}

interface Props {
  product?: Product
  categories: Category[]
  healthConcerns?: Category[]
  initialHealthConcernIds?: string[]
  erpProducts?: ErpProductOption[]
  /** The ERP product currently linked to this storefront product, if any —
   *  looked up from erp_products.storefront_product_id server-side, since
   *  that's the one place this relationship is stored. */
  linkedErpProductId?: string | null
}

function slugify(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900'
const LABEL = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

export default function ProductForm({
  product, categories, healthConcerns = [], initialHealthConcernIds = [],
  erpProducts = [], linkedErpProductId = null,
}: Props) {
  const router = useRouter()
  const isEdit = !!product

  const [name, setName]             = useState(product?.name ?? '')
  const [slug, setSlug]             = useState(product?.slug ?? '')
  const [description, setDesc]      = useState(product?.description ?? '')
  const [composition, setComposition] = useState(product?.composition ?? '')
  const [genericName, setGenericName] = useState(product?.generic_name ?? '')
  const [uses, setUses]             = useState(product?.uses ?? '')
  const [mrp, setMrp]               = useState(product?.mrp != null ? String(product.mrp) : '')
  const [packSize, setPackSize]     = useState(product?.pack_size ?? '')
  const [unit, setUnit]             = useState(product?.unit ?? '')
  const [categoryId, setCategoryId] = useState(product?.category_id ?? '')
  const [isActive, setIsActive]     = useState(product?.is_active ?? true)
  const [images, setImages]         = useState<string[]>(product?.images ?? [])
  const [videoUrl, setVideoUrl]     = useState<string | null>(product?.video_url ?? null)
  const [merchandisingTag, setMerchandisingTag] = useState(product?.merchandising_tag ?? '')
  const [healthConcernIds, setHealthConcernIds] = useState<string[]>(initialHealthConcernIds)
  const [linkedErpId, setLinkedErpId] = useState(linkedErpProductId ?? '')
  const [justPropagated, setJustPropagated] = useState(false)
  const [erpCategoryHint, setErpCategoryHint] = useState<string | null>(null)

  /** Fills composition/generic name/uses from the linked ERP product, and
   *  tries an exact (case-insensitive) name match for category — ERP's
   *  category is free text, the storefront's is a real taxonomy, so this is
   *  a convenience, not a guarantee; the ERP category is shown as a hint
   *  either way so the admin can pick the right one when it doesn't match. */
  function linkErpProduct(erpId: string) {
    setLinkedErpId(erpId)
    const erp = erpProducts.find(p => p.id === erpId)
    if (!erp) { setErpCategoryHint(null); return }

    setComposition(erp.composition ?? '')
    setGenericName(erp.generic_name ?? '')
    setUses(erp.uses ?? '')
    setMrp(erp.mrp != null ? String(erp.mrp) : '')
    setPackSize(erp.pack_size ?? '')
    setUnit(erp.unit ?? '')

    if (erp.category) {
      const match = categories.find(c => c.name.toLowerCase() === erp.category!.toLowerCase())
      if (match) setCategoryId(match.id)
      setErpCategoryHint(erp.category)
    } else {
      setErpCategoryHint(null)
    }

    setJustPropagated(true)
  }

  function toggleHealthConcern(id: string) {
    setHealthConcernIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => { if (!isEdit) setSlug(slugify(name)) }, [name, isEdit])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const payload = {
      name:          name.trim(),
      slug:          slug.trim(),
      description:   description.trim() || null,
      composition:   composition.trim() || null,
      generic_name:  genericName.trim() || null,
      uses:          uses.trim() || null,
      mrp:           mrp.trim() ? Number(mrp) : null,
      pack_size:     packSize.trim() || null,
      unit:          unit.trim() || null,
      category_id:   categoryId || null,
      is_active:     isActive,
      images,
      video_url:     videoUrl || null,
      merchandising_tag: merchandisingTag || null,
      health_concern_ids: healthConcernIds,
      linked_erp_product_id: linkedErpId || null,
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

          {/* Link to Product Master (ERP) */}
          {erpProducts.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-2">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Link to Product Master</h2>
              <select value={linkedErpId} onChange={e => linkErpProduct(e.target.value)} className={INPUT}>
                <option value="">— Not linked —</option>
                {erpProducts.map(p => (
                  <option key={p.id} value={p.id}>{p.product_name} ({p.product_code})</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400">
                Connecting fills in Generic Name, Uses, Composition, MRP, Pack Size and Unit below
                from the ERP product master — still editable before you save.
              </p>
              {justPropagated && (
                <p className="text-[11px] text-emerald-600 font-medium">Fields below were filled from the linked product.</p>
              )}
            </div>
          )}

          {/* Basic Info */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Basic Info</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={LABEL}>Product Name *</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} required
                  placeholder="e.g. Paracetamol 500mg"
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
                <label className={LABEL}>Generic Name</label>
                <input type="text" value={genericName} onChange={e => setGenericName(e.target.value)}
                  placeholder="e.g. Paracetamol"
                  className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>MRP (₹)</label>
                <input type="number" min="0" step="0.01" value={mrp}
                  onChange={e => setMrp(e.target.value)}
                  onFocus={e => e.target.select()}
                  placeholder="e.g. 45.00"
                  className={INPUT} />
                <p className="text-[11px] text-gray-400 mt-1">Shown on the public product page — informational, not a checkout price.</p>
              </div>
              <div>
                <label className={LABEL}>Pack Size</label>
                <input type="text" value={packSize} onChange={e => setPackSize(e.target.value)}
                  placeholder="e.g. Strip of 10 tablets"
                  className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Unit</label>
                <input type="text" value={unit} onChange={e => setUnit(e.target.value)}
                  placeholder="e.g. BOX, STRIP, BOTTLE"
                  className={INPUT} />
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL}>Composition</label>
                <textarea value={composition} onChange={e => setComposition(e.target.value)} rows={3}
                  placeholder="Active ingredients, e.g. Paracetamol IP 500mg"
                  className={INPUT + ' resize-none'} />
                <p className="text-[11px] text-gray-400 mt-1">Shown on the public product page.</p>
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL}>Uses</label>
                <textarea value={uses} onChange={e => setUses(e.target.value)} rows={3}
                  placeholder="e.g. Fever, body pain, inflammation"
                  className={INPUT + ' resize-none'} />
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL}>Description</label>
                <textarea value={description} onChange={e => setDesc(e.target.value)} rows={5}
                  placeholder="Describe the product — usage, benefits, features…"
                  className={INPUT + ' resize-none'} />
              </div>
            </div>
          </div>

          {/* Category & tags */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Category & Tags</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Category</label>
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                  className={INPUT}>
                  <option value="">None</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {erpCategoryHint && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    ERP category: <span className="font-medium text-gray-500">{erpCategoryHint}</span>
                    {' '}— pick the closest match above if it wasn&apos;t selected automatically.
                  </p>
                )}
              </div>
              <div>
                <label className={LABEL}>Merchandising Badge</label>
                <select value={merchandisingTag} onChange={e => setMerchandisingTag(e.target.value)}
                  className={INPUT}>
                  <option value="">None</option>
                  <option value="best_seller">Best Seller</option>
                  <option value="new">New</option>
                  <option value="trending">Trending</option>
                  <option value="must_have">Must Have</option>
                </select>
              </div>
            </div>
            {healthConcerns.length > 0 && (
              <div>
                <label className={LABEL}>Health Concerns (optional — shows this product under "Shop by Health Concern")</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {healthConcerns.map(hc => (
                    <label key={hc.id}
                      className={`text-xs px-3 py-1.5 rounded-full border cursor-pointer transition ${
                        healthConcernIds.includes(hc.id)
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-emerald-400'
                      }`}
                    >
                      <input type="checkbox" className="hidden"
                        checked={healthConcernIds.includes(hc.id)}
                        onChange={() => toggleHealthConcern(hc.id)} />
                      {hc.name}
                    </label>
                  ))}
                </div>
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
                  {isActive ? 'Visible in catalogue' : 'Hidden from catalogue'}
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
