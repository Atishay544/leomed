import { adminGuard } from '@/lib/security/admin-guard'
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'


export async function POST(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const body = await req.json()
  const { data, error } = await admin.from('categories').insert({
    name:       body.name,
    slug:       body.slug,
    parent_id:  body.parent_id ?? null,
    sort_order: body.sort_order ?? 0,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  revalidateTag('categories'); revalidateTag('admin-categories')
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const body = await req.json()
  const { id, name, slug, parent_id, sort_order } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const payload: Record<string, any> = {}
  if (name       !== undefined) payload.name       = name
  if (slug       !== undefined) payload.slug       = slug
  if (sort_order !== undefined) payload.sort_order = parseInt(sort_order, 10) || 0
  // Allow null to clear parent
  if ('parent_id' in body) payload.parent_id = parent_id ?? null

  const { data, error } = await admin.from('categories').update(payload).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  revalidateTag('categories'); revalidateTag('admin-categories')
  revalidateTag('products')
  return NextResponse.json({ data })
}

export async function DELETE(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const { id } = await req.json()

  // Unlink products before deleting to avoid FK constraint
  const { error: unlinkErr } = await admin
    .from('products')
    .update({ category_id: null })
    .eq('category_id', id)
  if (unlinkErr) return NextResponse.json({ error: unlinkErr.message }, { status: 400 })

  const { error } = await admin.from('categories').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  revalidateTag('categories'); revalidateTag('admin-categories')
  revalidateTag('products')
  return NextResponse.json({ success: true })
}
