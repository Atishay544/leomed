import type { CarrierConfig, CarrierRate, OrderShipmentInput, BookResult } from './types'
import {
  delhiveryGetRates, delhiveryBookShipment, delhiveryFetchLabel, delhiveryCancel,
  delhiveryTrack, delhiveryNDRAction, delhiveryCreatePickup,
  delhiveryCreateWarehouse, delhiveryUpdateWarehouse, delhiveryListWarehouses,
  delhiveryTestConnection, delhiveryCheckPincode,
} from './delhivery'

export type { CarrierConfig, CarrierRate, OrderShipmentInput, BookResult }
export type { PackageDimensions } from './types'
export type { TrackResult, TrackScan, NDRInput, NDRAction, PickupRequest, WarehouseInput, WarehouseRecord, ShipmentUpdateInput, PincodeResult } from './delhivery'

export { delhiveryTrack, delhiveryNDRAction, delhiveryCreatePickup, delhiveryCreateWarehouse, delhiveryUpdateWarehouse, delhiveryListWarehouses, delhiveryTestConnection, delhiveryCheckPincode }

/** Fetch rates from all active carriers in parallel, sorted by price */
export async function getAllCarrierRates(
  carriers: CarrierConfig[],
  fromPin: string,
  toPin: string,
  weightGrams: number,
  isCOD: boolean,
  dims?: import('./types').PackageDimensions
): Promise<CarrierRate[]> {
  const results = await Promise.allSettled(
    carriers.map(c => getCarrierRates(c, fromPin, toPin, weightGrams, isCOD, dims))
  )

  const all: CarrierRate[] = []
  results.forEach(r => { if (r.status === 'fulfilled') all.push(...r.value) })

  // Sort by price ascending (cheapest first)
  return all.sort((a, b) => a.rate - b.rate)
}

async function getCarrierRates(
  cfg: CarrierConfig,
  fromPin: string,
  toPin: string,
  weightGrams: number,
  isCOD: boolean,
  dims?: import('./types').PackageDimensions
): Promise<CarrierRate[]> {
  switch (cfg.name) {
    case 'delhivery':
      return delhiveryGetRates(cfg, fromPin, toPin, weightGrams, isCOD, dims)
    default:
      return [{ carrier_id: cfg.id, carrier_name: cfg.display_name, carrier_slug: cfg.name, service: 'Standard', estimated_days: '3-5 days', rate: 75, is_live: false }]
  }
}

/** Book a shipment with a specific carrier */
export async function bookCarrierShipment(
  cfg: CarrierConfig,
  input: OrderShipmentInput
): Promise<BookResult> {
  switch (cfg.name) {
    case 'delhivery':
      return delhiveryBookShipment(cfg, input)
    default:
      return { success: false, waybill: null, error: `Carrier "${cfg.name}" booking not implemented` }
  }
}

/** Download label for a booked shipment */
export async function fetchCarrierLabel(
  cfg: CarrierConfig,
  waybill: string
): Promise<{ ok: boolean; buffer?: Buffer; contentType?: string; error?: string }> {
  switch (cfg.name) {
    case 'delhivery':
      return delhiveryFetchLabel(cfg, waybill)
    default:
      return { ok: false, error: `Label download not supported for "${cfg.name}"` }
  }
}

/** Cancel a booked shipment */
export async function cancelCarrierShipment(
  cfg: CarrierConfig,
  waybill: string
): Promise<{ success: boolean; error?: string }> {
  switch (cfg.name) {
    case 'delhivery':
      return delhiveryCancel(cfg, waybill)
    default:
      return { success: false, error: `Cancellation not supported for "${cfg.name}"` }
  }
}

/** Track a shipment */
export async function trackCarrierShipment(cfg: CarrierConfig, waybill: string) {
  switch (cfg.name) {
    case 'delhivery':
      return delhiveryTrack(cfg, waybill)
    default:
      return { status: 'Unknown', edd: null, scans: [] }
  }
}

/** Perform NDR action on a shipment */
export async function carrierNDRAction(cfg: CarrierConfig, input: import('./delhivery').NDRInput) {
  switch (cfg.name) {
    case 'delhivery':
      return delhiveryNDRAction(cfg, input)
    default:
      return { success: false, error: `NDR not supported for "${cfg.name}"` }
  }
}
