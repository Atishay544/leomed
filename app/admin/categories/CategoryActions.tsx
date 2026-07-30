'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ConfirmModal from '@/components/ui/ConfirmModal'
import ImageUploader from '../products/ImageUploader'

interface Category { id: string; name: string }

interface Props {
  categoryId:   string
  categoryName: string
  categorySlug: string
  parentId:     string | null
  sortOrder:    number
  categories:   Category[]   // all categories (for parent select, excluding self)
  taxonomy?:    'product' | 'health_concern'
  accentColor?: string | null
  imageUrl?:    string | null
}

function slugify(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export default function CategoryActions({
  categoryId, categoryName, categorySlug, parentId, sortOrder, categories,
  taxonomy: initialTaxonomy, accentColor: initialAccentColor, imageUrl: initialImageUrl,
}: Props) {
  const router = useRouter()

  // Delete state
  const [showConfirm, setShowConfirm] = useState(false)
  const [deleting,    setDeleting]    = useState(false)

  // Edit state
  const [editing,    setEditing]    = useState(false)
  const [name,       setName]       = useState(categoryName)
  const [slug,       setSlug]       = useState(categorySlug)
  const [parent,     setParent]     = useState(parentId ?? '')
  const [sort,       setSort]       = useState(String(sortOrder))
  const [taxonomy,   setTaxonomy]   = useState<'product' | 'health_concern'>(initialTaxonomy ?? 'product')
  const [accentColor, setAccentColor] = useState(initialAccentColor ?? '#e8f3ec')
  const [images,     setImages]     = useState<string[]>(initialImageUrl ? [initialImageUrl] : [])
  const [saving,     setSaving]     = useState(false)
  const [editError,  setEditError]  = useState('')

  function openEdit() {
    setName(categoryName)
    setSlug(categorySlug)
    setParent(parentId ?? '')
    setSort(String(sortOrder))
    setTaxonomy(initialTaxonomy ?? 'product')
    setAccentColor(initialAccentColor ?? '#e8f3ec')
    setImages(initialImageUrl ? [initialImageUrl] : [])
    setEditError('')
    setEditing(true)
  }

  function handleNameChange(v: string) {
    setName(v)
    setSlug(slugify(v))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setEditError('')

    if (initialTaxonomy && taxonomy !== initialTaxonomy) {
      const ok = window.confirm(
        `Changing "${categoryName}" from ${initialTaxonomy === 'health_concern' ? 'Health Concern' : 'Product Category'} to ${taxonomy === 'health_concern' ? 'Health Concern' : 'Product Category'} will break its current URL ` +
        `(/${initialTaxonomy === 'health_concern' ? 'health-concern' : 'category'}/${categorySlug} will stop working). Continue?`
      )
      if (!ok) return
    }

    setSaving(true)
    const res = await fetch('/api/admin/categories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id:           categoryId,
        name:         name.trim(),
        slug:         slug.trim(),
        parent_id:    parent || null,
        sort_order:   parseInt(sort, 10) || 0,
        taxonomy,
        accent_color: accentColor,
        image_url:    images[0] ?? null,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const j = await res.json()
      setEditError(j.error ?? 'Failed to update')
      return
    }
    setEditing(false)
    router.refresh()
  }

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch('/api/admin/categories', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: categoryId }),
    })
    setDeleting(false)
    setShowConfirm(false)
    if (res.ok) router.refresh()
  }

  const otherCategories = categories.filter(c => c.id !== categoryId)

  return (
    <>
      <div className="flex items-center gap-3">
        <button onClick={openEdit} className="text-xs text-blue-600 hover:underline">
          Edit
        </button>
        <button onClick={() => setShowConfirm(true)} className="text-xs text-red-600 hover:underline">
          Delete
        </button>
      </div>

      {/* Inline edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Edit Category</h2>

            {editError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {editError}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => handleNameChange(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
                <input
                  type="text"
                  value={slug}
                  onChange={e => setSlug(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parent Category</label>
                <select
                  value={parent}
                  onChange={e => setParent(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">None (top-level)</option>
                  {otherCategories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                <input
                  type="number"
                  value={sort}
                  onChange={e => setSort(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Browse Type</label>
                <select
                  value={taxonomy}
                  onChange={e => setTaxonomy(e.target.value as 'product' | 'health_concern')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="product">Product Category</option>
                  <option value="health_concern">Health Concern</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tile Accent Color</label>
                <input
                  type="color"
                  value={accentColor}
                  onChange={e => setAccentColor(e.target.value)}
                  className="w-16 h-10 border border-gray-300 rounded-lg cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tile Image</label>
                <ImageUploader value={images} onChange={setImages} maxImages={1} />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showConfirm && (
        <ConfirmModal
          message={`Are you sure you want to delete "${categoryName}"? Products in this category will be uncategorized.`}
          onConfirm={handleDelete}
          onCancel={() => setShowConfirm(false)}
          loading={deleting}
        />
      )}
    </>
  )
}
