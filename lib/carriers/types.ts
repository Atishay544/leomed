export interface CarrierConfig {
  id: string
  name: string           // slug: 'delhivery' | 'dtdc' | 'shiprocket' | 'bluedart'
  display_name: string
  api_key: string | null
  api_secret: string | null
  account_code: string | null
  pickup_location_name: string | null
  pickup_pincode: string | null
  config: {
    pickup_address?: string
    pickup_city?: string
    pickup_state?: string
    pickup_phone?: string
    store_name?: string
    gst_number?: string
    base_url?: string
  }
  is_active: boolean
}

export interface PackageDimensions {
  length: number  // cm
  width: number   // cm
  height: number  // cm
}

export interface CarrierRate {
  carrier_id: string
  carrier_name: string
  carrier_slug: string
  service: string
  estimated_days: string
  rate: number
  is_live: boolean       // false = mock/estimated
  chargedGrams?: number
}

export interface OrderShipmentInput {
  orderId: string
  orderDate: string
  customerName: string
  customerPhone: string
  address: string
  city: string
  state: string
  pincode: string
  paymentMode: 'Prepaid' | 'COD'
  codAmount: number
  totalAmount: number
  productDesc: string
  weightGrams: number
  shippingMode: string
  items: { name: string; qty: number }[]
}

export interface BookResult {
  success: boolean
  waybill: string | null
  error?: string
}
