/**
 * Delhivery tracking webhook
 *
 * Configure this URL in Delhivery developer portal → Webhooks:
 *   https://yourdomain.com/api/webhooks/delhivery
 *   (optionally add ?token=<DELHIVERY_WEBHOOK_SECRET> for validation)
 *
 * Delhivery POSTs either JSON or form-encoded payloads with fields:
 *   AWB, Status, StatusDateTime, Location, etc.
 *
 * On receipt we:
 *   1. Find the order by AWB
 *   2. Map Delhivery status → our order status
 *   3. Update the order (Supabase Realtime then pushes to subscribed clients)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Delhivery status codes/strings → our order statuses
// https://one.delhivery.com/developer-portal/documents/b2c/tracking
const STATUS_MAP: Record<string, string> = {
  // Cancellation / Return
  'cancelled':        'cancelled',
  'cancel':           'cancelled',
  'rco':              'cancelled',   // Return to consignor
  'ric':              'cancelled',   // Return in courier
  'returned':         'cancelled',
  'rtd':              'cancelled',   // Return to destination
  'lost':             'cancelled',
  // Delivered
  'delivered':        'delivered',
  'dl':               'delivered',
  // In transit / Processing
  'transit':          'shipped',
  'intransit':        'shipped',
  'pkd':              'shipped',     // Picked up
  'inscan':           'shipped',
  'manifested':       'processing',
}

function mapStatus(raw: string): string | null {
  return STATUS_MAP[raw.toLowerCase().replace(/[\s_-]/g, '')] ?? null
}

export async function POST(req: NextRequest) {
  // Optional secret-token validation
  const secret = process.env.DELHIVERY_WEBHOOK_SECRET
  if (secret) {
    const token = req.headers.get('x-webhook-token') ??
                  req.nextUrl.searchParams.get('token')
    if (token !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // Parse body — Delhivery sends form-encoded or JSON depending on account config
  const contentType = req.headers.get('content-type') ?? ''
  let payload: Record<string, string> = {}

  try {
    if (contentType.includes('application/json')) {
      payload = await req.json()
    } else {
      const text = await req.text()
      // Try JSON first in case content-type header is wrong
      try { payload = JSON.parse(text) }
      catch { for (const [k, v] of new URLSearchParams(text)) payload[k] = v }
    }
  } catch {
    return NextResponse.json({ ok: true }) // ignore malformed body
  }

  // Extract fields (Delhivery uses varying key casing)
  const awb = payload.AWB ?? payload.awb ?? payload.waybill
  const rawStatus = payload.Status ?? payload.status ?? payload.StatusType ?? payload.statusType ?? ''

  if (!awb) return NextResponse.json({ ok: true })

  const admin = createAdminClient()

  // Find the order by AWB
  const { data: order } = await admin
    .from('orders')
    .select('id, status, metadata')
    .eq('delivery_awb', awb)
    .maybeSingle()

  if (!order) return NextResponse.json({ ok: true }) // AWB not in our system

  const newStatus = mapStatus(rawStatus)
  const isCancelled = newStatus === 'cancelled'

  // Build the update — always persist raw tracking status in metadata
  const update: Record<string, any> = {
    updated_at: new Date().toISOString(),
    metadata: {
      ...((order.metadata as Record<string, any>) ?? {}),
      tracking_status:     rawStatus,
      tracking_updated_at: new Date().toISOString(),
      tracking_location:   payload.Location ?? payload.location ?? undefined,
    },
  }

  // Advance order status only if it's a valid forward/terminal transition
  const terminalStatuses = new Set(['delivered', 'cancelled', 'refunded'])
  if (newStatus && newStatus !== order.status && !terminalStatuses.has(order.status)) {
    update.status = newStatus
  }

  // Cancelled from Delhivery side — clear all delivery fields
  if (isCancelled) {
    update.delivery_awb     = null
    update.delivery_partner = null
    update.delivery_service = null
    update.delivery_rate    = null
    // If order wasn't delivered/refunded, mark it cancelled
    if (!terminalStatuses.has(order.status)) {
      update.status = 'cancelled'
    }
  }

  await admin.from('orders').update(update).eq('id', order.id)

  return NextResponse.json({ ok: true })
}

// Delhivery may send a GET to verify the endpoint during setup
export async function GET() {
  return NextResponse.json({ ok: true, service: 'delhivery-webhook' })
}
