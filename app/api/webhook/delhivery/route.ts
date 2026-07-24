import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const STATUS_MAP: Record<string, string> = {
  'In Transit':         'shipped',
  'Dispatched':         'shipped',
  'Out for Delivery':   'shipped',
  'Delivered':          'delivered',
  'RTO Initiated':      'cancelled',
  'RTO Delivered':      'cancelled',
  'Returned to Origin': 'cancelled',
  'Lost':               'cancelled',
}

// Delhivery sends a static token in the Authorization header.
// Set DELHIVERY_WEBHOOK_TOKEN in env to a random secret (e.g. openssl rand -hex 32)
// and configure the same value in your Delhivery webhook settings.
const WEBHOOK_TOKEN = process.env.DELHIVERY_WEBHOOK_TOKEN

export async function POST(req: NextRequest) {
  // ── 1. Authenticate the webhook call ─────────────────────────────────────
  if (!WEBHOOK_TOKEN) {
    // Token not configured — log and reject (fail closed, not open)
    console.error('DELHIVERY_WEBHOOK_TOKEN is not set — rejecting webhook')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const incomingToken = authHeader.replace('Bearer ', '').replace('Token ', '').trim()

  if (!incomingToken || incomingToken !== WEBHOOK_TOKEN) {
    console.error('Delhivery webhook: invalid or missing token')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Parse payload ──────────────────────────────────────────────────────
  let payload: any
  try { payload = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const shipment  = payload?.ShipmentData?.[0]?.Shipment ?? payload
  const waybill   = shipment?.AWB ?? shipment?.waybill
  const dlvStatus = shipment?.Status?.Status ?? shipment?.status

  if (!waybill) return NextResponse.json({ received: true })

  const admin = createAdminClient()

  // ── 3. Look up order by AWB ───────────────────────────────────────────────
  const { data: order } = await admin
    .from('orders')
    .select('id, status, metadata')
    .eq('delivery_awb', waybill)
    .maybeSingle()

  if (!order) return NextResponse.json({ received: true })

  const currentMeta = ((order as any).metadata ?? {}) as Record<string, any>
  const newStatus   = dlvStatus ? STATUS_MAP[dlvStatus] : null
  const scans       = shipment?.Scans ?? []
  const latest      = scans[0]

  const update: Record<string, any> = {
    metadata: {
      ...currentMeta,
      ...(dlvStatus ? { tracking_status: dlvStatus } : {}),
      ...(latest ? {
        tracking_location: latest.ScanDetail?.ScannedLocation ?? '',
        tracking_updated:  latest.ScanDateTime ?? new Date().toISOString(),
      } : {}),
    },
    updated_at: new Date().toISOString(),
  }

  if (newStatus && newStatus !== (order as any).status) {
    update.status = newStatus
  }

  await admin.from('orders').update(update).eq('id', (order as any).id)

  return NextResponse.json({ received: true })
}
