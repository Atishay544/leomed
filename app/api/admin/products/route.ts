import { adminGuard } from '@/lib/security/admin-guard'
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'

// Only accept IDs that are actually health_concern-taxonomy categories — a
// product-taxonomy category ID (or a garbage string) submitted here would
// otherwise silently corrupt the health-concern browse pages.
async function filterValidHealthConcernIds(admin: any, ids: unknown): Promise<string[]> {
  if (!Array.isArray(ids) || ids.length === 0) return []
  const { data } = await admin
    .from('categories')
    .select('id')
    .eq('taxonomy', 'health_concern')
    .in('id', ids)
  return (data ?? []).map((c: any) => c.id)
}

export async function POST(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const body = await req.json()
  const { health_concern_ids, ...productData } = body

  const { data: product, error } = await admin
    .from('products')
    .insert({
      name:          productData.name?.trim(),
      slug:          productData.slug?.trim(),
      description:   productData.description?.trim() || null,
      composition:   productData.composition?.trim() || null,
      category_id:   productData.category_id || null,
      is_active:     productData.is_active ?? true,
      images:        productData.images ?? [],
      video_url:     productData.video_url || null,
      merchandising_tag: productData.merchandising_tag || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Health-concern tags (many-to-many, non-exclusive with category_id)
  if (product) {
    const validIds = await filterValidHealthConcernIds(admin, health_concern_ids)
    if (validIds.length > 0) {
      await admin.from('product_health_concerns').insert(
        validIds.map((category_id: string) => ({ product_id: product.id, category_id }))
      )
    }
  }

  revalidateTag('products'); revalidateTag('admin-products'); revalidateTag('admin-dashboard')
  return NextResponse.json({ data: product })
}

export async function PATCH(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const body = await req.json()
  const { id, health_concern_ids, ...fields } = body

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const payload: Record<string, any> = {}
  if (fields.name          !== undefined) payload.name          = fields.name.trim()
  if (fields.slug          !== undefined) payload.slug          = fields.slug.trim()
  if (fields.description   !== undefined) payload.description   = fields.description?.trim() || null
  if (fields.composition   !== undefined) payload.composition   = fields.composition?.trim() || null
  if (fields.category_id   !== undefined) payload.category_id   = fields.category_id || null
  if (fields.is_active     !== undefined) payload.is_active     = fields.is_active
  if (fields.images        !== undefined) payload.images        = fields.images
  if (fields.video_url     !== undefined) payload.video_url     = fields.video_url || null
  if (fields.merchandising_tag !== undefined) payload.merchandising_tag = fields.merchandising_tag || null
  payload.updated_at = new Date().toISOString()

  const [{ error }, deleteHealthConcerns] = await Promise.all([
    admin.from('products').update(payload).eq('id', id),
    Array.isArray(health_concern_ids)
      ? admin.from('product_health_concerns').delete().eq('product_id', id)
      : Promise.resolve({ error: null }),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (deleteHealthConcerns?.error) return NextResponse.json({ error: deleteHealthConcerns.error.message }, { status: 400 })

  // Re-insert health-concern tags after delete completes
  const validHealthConcernIds = await filterValidHealthConcernIds(admin, health_concern_ids)
  if (validHealthConcernIds.length > 0) {
    await admin.from('product_health_concerns').insert(
      validHealthConcernIds.map((category_id: string) => ({ product_id: id, category_id }))
    )
  }

  revalidateTag('products'); revalidateTag('admin-products'); revalidateTag('admin-dashboard')
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const { id } = await req.json()
  const { error } = await admin.from('products').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  revalidateTag('products'); revalidateTag('admin-products'); revalidateTag('admin-dashboard')
  return NextResponse.json({ success: true })
}
