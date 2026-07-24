import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  if (user.app_metadata?.role === 'admin') return admin
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return admin
}

interface PageProps {
  params: Promise<{ id: string }>
}

export async function PATCH(req: NextRequest, { params }: PageProps) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  const payload: Record<string, any> = { updated_at: new Date().toISOString() }
  if (body.delivery_partner !== undefined) payload.delivery_partner = body.delivery_partner
  if (body.delivery_service !== undefined) payload.delivery_service = body.delivery_service
  if (body.delivery_rate !== undefined) payload.delivery_rate = body.delivery_rate
  if (body.delivery_awb !== undefined) payload.delivery_awb = body.delivery_awb

  const { data, error } = await admin
    .from('orders')
    .update(payload)
    .eq('id', id)
    .select('id, delivery_partner, delivery_service, delivery_rate, delivery_awb')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
