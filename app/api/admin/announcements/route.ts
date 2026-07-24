import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { adminGuard } from '@/lib/security/admin-guard'

export async function POST(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const body = await req.json()
  const { data, error } = await admin.from('announcements').insert({
    message:     body.message?.trim(),
    bg_color:    body.bg_color   ?? '#000000',
    text_color:  body.text_color ?? '#ffffff',
    link_url:    body.link_url?.trim()  || null,
    link_text:   body.link_text?.trim() || null,
    sort_order:  body.sort_order ?? 0,
    is_active:   body.is_active ?? true,
    starts_at:   body.starts_at || null,
    ends_at:     body.ends_at   || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  revalidateTag('announcements')
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const body = await req.json()
  const { id, message, bg_color, text_color, link_url, link_text, sort_order, is_active, starts_at, ends_at } = body
  const { error } = await admin.from('announcements').update({
    ...(message    !== undefined && { message:    message?.trim() }),
    ...(bg_color   !== undefined && { bg_color }),
    ...(text_color !== undefined && { text_color }),
    ...(link_url   !== undefined && { link_url:   link_url?.trim() || null }),
    ...(link_text  !== undefined && { link_text:  link_text?.trim() || null }),
    ...(sort_order !== undefined && { sort_order }),
    ...(is_active  !== undefined && { is_active }),
    ...(starts_at  !== undefined && { starts_at:  starts_at || null }),
    ...(ends_at    !== undefined && { ends_at:    ends_at || null }),
  }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  revalidateTag('announcements')
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const { id } = await req.json()
  const { error } = await admin.from('announcements').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  revalidateTag('announcements')
  return NextResponse.json({ success: true })
}
