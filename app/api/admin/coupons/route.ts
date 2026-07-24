import { adminGuard } from '@/lib/security/admin-guard'
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'


export async function POST(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const body = await req.json()

  const { data, error } = await admin.from('coupons').insert({
    code:       body.code?.trim().toUpperCase(),
    type:       body.type,           // 'percentage' or 'flat'
    value:      Number(body.value),
    min_order:  body.min_order ? Number(body.min_order) : 0,
    max_uses:   body.max_uses  ? Number(body.max_uses)  : null,
    expires_at: body.expires_at || null,
    is_active:  true,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  revalidateTag('admin-coupons')
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const body = await req.json()
  const { id, ...fields } = body

  const { error } = await admin.from('coupons').update(fields).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  revalidateTag('admin-coupons')
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const { id } = await req.json()
  const { error } = await admin.from('coupons').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  revalidateTag('admin-coupons')
  return NextResponse.json({ success: true })
}
