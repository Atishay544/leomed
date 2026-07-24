import { adminGuard } from '@/lib/security/admin-guard'
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag, revalidatePath } from 'next/cache'

function bustBannerCache() {
  revalidateTag('banners')
  revalidatePath('/', 'page')
}


export async function POST(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const body = await req.json()
  const { data, error } = await admin.from('banners').insert({
    display_style: body.display_style ?? 'overlay',
    title:         body.title      || null,
    subtitle:      body.subtitle   || null,
    image_url:     body.image_url  || null,
    link_url:      body.link_url   || null,
    link_text:     body.link_text  || null,
    bg_color:      body.bg_color   ?? '#111827',
    text_color:    body.text_color ?? '#ffffff',
    sort_order:    Number(body.sort_order) || 0,
    is_active:     body.is_active  ?? true,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  bustBannerCache()
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const body = await req.json()
  const { id, ...fields } = body
  const { error } = await admin.from('banners').update(fields).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  bustBannerCache()
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const { id } = await req.json()
  const { error } = await admin.from('banners').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  bustBannerCache()
  return NextResponse.json({ success: true })
}
