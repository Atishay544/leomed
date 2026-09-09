import 'server-only'
import { erpDb } from './query'

/**
 * Reads for the tiered/flat incentive-rate system on secondary sales.
 * Every write goes through lib/erp/actions/incentives.ts; nothing here
 * mutates.
 */

export interface IncentiveTier {
  id: string
  mr_id: string | null
  min_amount: number
  max_amount: number | null
  percentage: number
}

export async function listDefaultIncentiveTiers(): Promise<IncentiveTier[]> {
  const db = await erpDb()
  const { data } = await db
    .from('erp_incentive_tiers')
    .select('id, mr_id, min_amount, max_amount, percentage')
    .is('mr_id', null)
    .order('min_amount', { ascending: true })
  return (data ?? []) as IncentiveTier[]
}

export async function listMrIncentiveTiers(mrId: string): Promise<IncentiveTier[]> {
  const db = await erpDb()
  const { data } = await db
    .from('erp_incentive_tiers')
    .select('id, mr_id, min_amount, max_amount, percentage')
    .eq('mr_id', mrId)
    .order('min_amount', { ascending: true })
  return (data ?? []) as IncentiveTier[]
}

export interface MrIncentiveSetting {
  mr_id: string
  flat_percentage: number | null
}

export async function getMrIncentiveSetting(mrId: string): Promise<MrIncentiveSetting | null> {
  const db = await erpDb()
  const { data } = await db
    .from('erp_mr_incentive_settings')
    .select('mr_id, flat_percentage')
    .eq('mr_id', mrId)
    .maybeSingle()
  return (data as MrIncentiveSetting | null) ?? null
}

export interface IncentiveSuggestion {
  secondary_sales: number
  percentage: number
  incentive_amount: number
  source: 'FLAT' | 'MR_TIER' | 'DEFAULT_TIER' | 'NONE'
}

/** What erp_incentive_suggestion() computes for one MR over one date range —
 *  a rough figure the Incentives & Bonus screen offers as a starting point,
 *  never written anywhere until admin reviews it and clicks Save there. */
export async function getIncentiveSuggestion(
  mrId: string, from: string, to: string,
): Promise<IncentiveSuggestion | null> {
  const db = await erpDb()
  const { data, error } = await db.rpc('erp_incentive_suggestion', {
    p_mr_id: mrId, p_from: from, p_to: to,
  })
  if (error) {
    console.error('[erp] incentive suggestion failed', error.message)
    return null
  }
  return data as IncentiveSuggestion
}
