import { adminGuard } from '@/lib/security/admin-guard'
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag, revalidatePath } from 'next/cache'

function bustLaunchesCache() {
  revalidateTag('launches')
  revalidateTag('admin-launches')
  revalidatePath('/upcoming-launches')
}

export async function POST(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const body = await req.json()
  const { data, error } = await admin.from('upcoming_launches').insert({
    name:          body.name?.trim(),
    description:   body.description?.trim() || null,
    image_url:     body.image_url || null,
    expected_date: body.expected_date || null,
    is_active:     body.is_active ?? true,
    sort_order:    Number(body.sort_order) || 0,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  bustLaunchesCache()
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const body = await req.json()
  const { id, ...fields } = body
  const { error } = await admin.from('upcoming_launches').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  bustLaunchesCache()
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const { id } = await req.json()
  const { error } = await admin.from('upcoming_launches').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  bustLaunchesCache()
  return NextResponse.json({ success: true })
}
