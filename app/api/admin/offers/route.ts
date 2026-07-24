import { adminGuard } from '@/lib/security/admin-guard'
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'


export async function GET() {
  const admin = createAdminClient()
  const { data, error } = await admin.from('offers').select('*').order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard
  const body = await req.json()
  const { data, error } = await admin.from('offers').insert({
    title:      body.title?.trim(),
    description: body.description?.trim() || null,
    type:       body.type,       // 'cod_upfront' | 'custom'
    upfront_pct: body.upfront_pct ? Number(body.upfront_pct) : null,
    discount_pct: body.discount_pct ? Number(body.discount_pct) : null,
    is_active:  body.is_active ?? true,
    sort_order: body.sort_order ? Number(body.sort_order) : 0,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  revalidateTag('offers'); revalidateTag('admin-offers')
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard
  const body = await req.json()
  const { id, ...fields } = body
  const { error } = await admin.from('offers').update(fields).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  revalidateTag('offers'); revalidateTag('admin-offers')
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard
  const { id } = await req.json()
  const { error } = await admin.from('offers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  revalidateTag('offers'); revalidateTag('admin-offers')
  return NextResponse.json({ success: true })
}
