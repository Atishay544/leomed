// Delhivery Express API client
// Docs: https://developers.delhivery.com/docs/

const BASE = process.env.DELHIVERY_BASE_URL ?? 'https://track.delhivery.com'
const TOKEN = () => process.env.DELHIVERY_API_TOKEN ?? ''

function headers() {
  return {
    Authorization: `Token ${TOKEN()}`,
    'Content-Type': 'application/json',
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface DelhiveryShipmentInput {
  orderId: string
  orderDate: string         // ISO string
  customerName: string
  customerPhone: string
  address: string
  city: string
  state: string
  pincode: string
  paymentMode: 'Prepaid' | 'COD'
  codAmount: number         // 0 for prepaid
  totalAmount: number
  productDesc: string
  weightGrams: number
  shippingMode: 'Surface' | 'Express'
  items: { name: string; qty: number }[]
}

export interface DelhiveryShipmentResult {
  success: boolean
  waybill: string | null
  error?: string
  raw?: any
}

export interface DelhiveryRateResult {
  surface: number | null
  express: number | null
  serviceable: boolean
}

export interface DelhiveryTrackResult {
  status: string
  scans: { date: string; activity: string; location: string }[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function apiGet(path: string, params?: Record<string, string>) {
  const url = new URL(BASE + path)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
    headers: headers(),
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Delhivery ${path} → ${res.status}`)
  return res.json()
}

// ── API calls ──────────────────────────────────────────────────────────────

/** Check if a pincode is serviceable + get surface/express rates */
export async function getDelhiveryRates(
  fromPin: string,
  toPin: string,
  weightGrams: number,
  cod = false
): Promise<DelhiveryRateResult> {
  try {
    const data = await apiGet('/api/kinko/v0.2/pickup/pincode_availability/', {
      md: 'S',
      ss: 'Delivered',
      d_pin: toPin,
      o_pin: fromPin,
      cgm: String(Math.max(500, weightGrams)),
      pt: cod ? 'COD' : 'Pre-paid',
      cod: cod ? '1' : '0',
    })

    const d = data?.data ?? {}
    return {
      serviceable: !!(d.surface_rate || d.express_rate),
      surface: d.surface_rate ? Number(d.surface_rate) : null,
      express: d.express_rate ? Number(d.express_rate) : null,
    }
  } catch {
    return { serviceable: false, surface: null, express: null }
  }
}

/** Create a shipment with Delhivery — returns AWB number */
export async function createDelhiveryShipment(
  input: DelhiveryShipmentInput
): Promise<DelhiveryShipmentResult> {
  const pickup = {
    name: process.env.DELHIVERY_PICKUP_LOCATION ?? '',
  }

  const shipmentData = {
    shipments: [
      {
        name:            input.customerName,
        add:             input.address,
        pin:             input.pincode,
        city:            input.city,
        state:           input.state,
        country:         'India',
        phone:           input.customerPhone.replace(/\D/g, '').slice(-10),
        order:           input.orderId,
        payment_mode:    input.paymentMode,
        return_pin:      process.env.DELHIVERY_PICKUP_PINCODE ?? '',
        return_city:     process.env.DELHIVERY_PICKUP_CITY ?? '',
        return_phone:    process.env.DELHIVERY_PICKUP_PHONE ?? '',
        return_add:      process.env.DELHIVERY_PICKUP_ADDRESS ?? '',
        return_name:     process.env.DELHIVERY_STORE_NAME ?? 'Store',
        return_state:    process.env.DELHIVERY_PICKUP_STATE ?? '',
        return_country:  'India',
        products_desc:   input.productDesc.slice(0, 100),
        hsn_code:        '',
        cod_amount:      input.codAmount,
        order_date:      input.orderDate,
        total_amount:    input.totalAmount,
        seller_add:      process.env.DELHIVERY_PICKUP_ADDRESS ?? '',
        seller_name:     process.env.DELHIVERY_STORE_NAME ?? 'Store',
        seller_inv:      input.orderId,
        quantity:        input.items.reduce((s, i) => s + i.qty, 0),
        waybill:         '',
        shipment_width:  12,
        shipment_height: 12,
        shipment_length: 12,
        weight:          input.weightGrams,
        seller_gst_tin:  process.env.DELHIVERY_GST ?? '',
        shipping_mode:   input.shippingMode,
        address_type:    'home',
      },
    ],
    pickup_location: pickup,
  }

  // Delhivery expects multipart/form-data with data= JSON string
  const form = new URLSearchParams()
  form.set('format', 'json')
  form.set('data', JSON.stringify(shipmentData))

  const res = await fetch(`${BASE}/api/cmu/create.json`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${TOKEN()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
    signal: AbortSignal.timeout(10000),
  })

  const json = await res.json()

  if (!res.ok) {
    return { success: false, waybill: null, error: json?.error ?? `HTTP ${res.status}`, raw: json }
  }

  const pkg = json?.packages?.[0]
  if (!pkg) {
    return { success: false, waybill: null, error: 'No package in response', raw: json }
  }
  if (pkg.status !== 'Success' && pkg.status !== 'success') {
    return { success: false, waybill: null, error: pkg.error ?? pkg.remarks ?? 'Shipment creation failed', raw: json }
  }

  return { success: true, waybill: pkg.waybill ?? null, raw: json }
}

/** Get PDF label URL for a waybill */
export function getDelhiveryLabelUrl(waybill: string): string {
  return `${BASE}/api/p/packing_slip?wbns=${waybill}&pdf=true`
}

/** Fetch label as buffer (for proxying to admin) */
export async function fetchDelhiveryLabel(waybill: string): Promise<{ ok: boolean; buffer?: Buffer; contentType?: string; error?: string }> {
  try {
    const res = await fetch(getDelhiveryLabelUrl(waybill), {
      headers: { Authorization: `Token ${TOKEN()}` },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return { ok: false, error: `Label fetch failed: ${res.status}` }
    const buffer = Buffer.from(await res.arrayBuffer())
    return { ok: true, buffer, contentType: res.headers.get('content-type') ?? 'application/pdf' }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}

/** Track a shipment by waybill */
export async function trackDelhiveryShipment(waybill: string): Promise<DelhiveryTrackResult> {
  try {
    const data = await apiGet('/api/v1/packages/json/', { waybill, verbose: '1' })
    const shipment = data?.ShipmentData?.[0]?.Shipment
    const scans = (shipment?.Scans ?? []).map((s: any) => ({
      date:     s.ScanDateTime ?? '',
      activity: s.ScanDetail?.Scan ?? s.ScanDetail?.Instructions ?? '',
      location: s.ScanDetail?.ScannedLocation ?? '',
    }))
    return {
      status: shipment?.Status?.Status ?? 'Unknown',
      scans,
    }
  } catch {
    return { status: 'Unknown', scans: [] }
  }
}

/** Cancel a shipment */
export async function cancelDelhiveryShipment(waybill: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${BASE}/api/p/edit`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: JSON.stringify({ waybill, cancellation: true }) }).toString(),
      signal: AbortSignal.timeout(8000),
    })
    const json = await res.json()
    if (json?.cancellation_status === true || json?.[waybill]?.cancellation_status === true) {
      return { success: true }
    }
    return { success: false, error: JSON.stringify(json) }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}
