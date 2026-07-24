import { adminGuard } from '@/lib/security/admin-guard'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@/lib/supabase/server'
import { revalidateTag } from 'next/cache'


interface PageProps { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: PageProps) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  const payload: Record<string, any> = {}
  if (typeof body.is_approved === 'boolean') payload.is_approved = body.is_approved
  if (typeof body.is_rejected === 'boolean') payload.is_rejected = body.is_rejected

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { error } = await admin.from('reviews').update(payload).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  revalidateTag('reviews')
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: PageProps) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { error } = await admin.from('reviews').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  revalidateTag('reviews')
  return NextResponse.json({ ok: true })
}
