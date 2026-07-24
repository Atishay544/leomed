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

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await admin
    .from('delivery_partners' as any)
    .select('*')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, display_name, api_key, api_secret, account_code, pickup_location_name, pickup_pincode, is_active, config } = body

  if (!name?.trim() || !display_name?.trim()) {
    return NextResponse.json({ error: 'name and display_name are required' }, { status: 400 })
  }
  if (!pickup_location_name?.trim() || !pickup_pincode?.trim()) {
    return NextResponse.json({ error: 'Pickup location name and pincode are required' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('delivery_partners' as any)
    .insert({
      name:                 name.trim(),
      display_name:         display_name.trim(),
      api_key:              api_key?.trim() || null,
      api_secret:           api_secret?.trim() || null,
      account_code:         account_code?.trim() || null,
      pickup_location_name: pickup_location_name.trim(),
      pickup_pincode:       pickup_pincode.trim(),
      is_active:            is_active ?? true,
      config:               config ?? {},
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const payload: Record<string, any> = { updated_at: new Date().toISOString() }
  if (fields.name              !== undefined) payload.name              = fields.name.trim()
  if (fields.display_name      !== undefined) payload.display_name      = fields.display_name.trim()
  if (fields.api_key           !== undefined) payload.api_key           = fields.api_key?.trim() || null
  if (fields.api_secret        !== undefined) payload.api_secret        = fields.api_secret?.trim() || null
  if (fields.account_code      !== undefined) payload.account_code      = fields.account_code?.trim() || null
  if (fields.pickup_location_name !== undefined) payload.pickup_location_name = fields.pickup_location_name?.trim() || null
  if (fields.pickup_pincode    !== undefined) payload.pickup_pincode    = fields.pickup_pincode?.trim() || null
  if (fields.is_active         !== undefined) payload.is_active         = fields.is_active
  if (fields.config            !== undefined) payload.config            = fields.config

  const { data, error } = await admin
    .from('delivery_partners' as any)
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await admin
    .from('delivery_partners' as any)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
