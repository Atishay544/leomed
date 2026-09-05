import 'server-only'
import { cache } from 'react'
import { erpDb } from './query'
import type { ErpSettings } from '../types'

/** Falls back to the same values as the table's column defaults, so a page
 *  still renders sensibly if the settings row is missing or unreadable. */
const DEFAULTS: ErpSettings = {
  id: 1,
  company_name: 'Leomed Pharma',
  company_gst_number: null,
  company_drug_license: null,
  company_address: null,
  expiry_warning_days: 90,
  mr_edit_window_hours: 24,
  allow_expired_sale: false,
  financial_year_start_month: 4,
  low_stock_multiplier: 1,
}

export const getErpSettings = cache(async (): Promise<ErpSettings> => {
  const db = await erpDb()
  const { data } = await db.from('erp_settings').select('*').eq('id', 1).maybeSingle()
  return { ...DEFAULTS, ...((data as Partial<ErpSettings> | null) ?? {}) }
})

/** Mirrors erp_within_edit_window() in SQL, so the UI offers an Edit button
 *  exactly when the database would accept the edit. */
export function withinEditWindow(createdAt: string, windowHours: number): boolean {
  if (windowHours <= 0) return false
  const created = new Date(createdAt).getTime()
  if (Number.isNaN(created)) return false
  return Date.now() - created < windowHours * 3_600_000
}
