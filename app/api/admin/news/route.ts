import { adminGuard } from '@/lib/security/admin-guard'
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag, revalidatePath } from 'next/cache'

function bustNewsCache() {
  revalidateTag('news')
  revalidateTag('admin-news')
  revalidatePath('/news')
}

export async function POST(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const body = await req.json()
  const { data, error } = await admin.from('news_articles').insert({
    title:           body.title?.trim(),
    slug:            body.slug?.trim(),
    excerpt:         body.excerpt?.trim() || null,
    body:            body.body?.trim() ?? '',
    cover_image_url: body.cover_image_url || null,
    is_published:    body.is_published ?? false,
    published_at:    body.is_published ? new Date().toISOString() : null,
    sort_order:      Number(body.sort_order) || 0,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  bustNewsCache()
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const body = await req.json()
  const { id, ...fields } = body

  const payload: Record<string, any> = { ...fields, updated_at: new Date().toISOString() }
  // Stamp published_at the first time an article is published; clear it if unpublished.
  if (fields.is_published === true) payload.published_at = new Date().toISOString()
  if (fields.is_published === false) payload.published_at = null

  const { error } = await admin.from('news_articles').update(payload).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  bustNewsCache()
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const { id } = await req.json()
  const { error } = await admin.from('news_articles').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  bustNewsCache()
  return NextResponse.json({ success: true })
}
