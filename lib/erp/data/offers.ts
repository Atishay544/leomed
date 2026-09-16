import 'server-only'
import { erpDb, ilikeAny, PAGE_SIZE, rangeFor, safeSearch, toPage, type PageResult } from './query'
import type { OfferLetter, OfferLetterComponent, OfferStatus } from '../types'

export { PAGE_SIZE }

export interface OfferListParams {
  q?: string
  page?: number
  status?: string
}

export interface OfferListRow extends OfferLetter {
  reports_to_name: string | null
}

/** Offer letters, newest first — admin/HR's candidate pipeline. */
export async function listOfferLetters(params: OfferListParams = {}): Promise<PageResult<OfferListRow>> {
  const db = await erpDb()
  const page = params.page ?? 1
  const [from, to] = rangeFor(page)

  let query = db
    .from('erp_offer_letters')
    .select('*, erp_users!erp_offer_letters_reports_to_fkey(name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (params.status) query = query.eq('status', params.status as OfferStatus)

  const term = safeSearch(params.q)
  if (term) {
    query = query.or(ilikeAny(
      ['candidate_name', 'offer_number', 'designation', 'candidate_email', 'candidate_phone'],
      term,
    ))
  }

  const { data, count } = await query
  const rows = (data ?? []).map((row: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const { erp_users, ...rest } = row
    return { ...rest, reports_to_name: erp_users?.name ?? null } as OfferListRow
  })
  return toPage<OfferListRow>(rows, count, page)
}

/** Active admins/managers, for the offer form's "Reports To" dropdown — a
 *  short list (unlike the full staff directory), so unpaginated is fine. */
export async function listPotentialManagers(): Promise<{ id: string; name: string }[]> {
  const db = await erpDb()
  const { data } = await db
    .from('erp_users')
    .select('id, name')
    .eq('active', true)
    .in('role', ['ADMIN', 'MANAGER'])
    .order('name', { ascending: true })
  return (data ?? []) as { id: string; name: string }[]
}

export interface OfferDetail extends OfferLetter {
  components: OfferLetterComponent[]
  reports_to_name: string | null
  converted_employee_name: string | null
}

export async function getOfferLetter(id: string): Promise<OfferDetail | null> {
  const db = await erpDb()
  const { data } = await db
    .from('erp_offer_letters')
    .select(
      `*,
       erp_offer_letter_components(*),
       reports_to_user:erp_users!erp_offer_letters_reports_to_fkey(name),
       converted_user:erp_users!erp_offer_letters_converted_employee_id_fkey(name)`,
    )
    .eq('id', id)
    .maybeSingle()

  if (!data) return null
  const row = data as any // eslint-disable-line @typescript-eslint/no-explicit-any
  const { erp_offer_letter_components, reports_to_user, converted_user, ...rest } = row
  return {
    ...rest,
    components: (erp_offer_letter_components ?? []).sort(
      (a: OfferLetterComponent, b: OfferLetterComponent) => a.sort_order - b.sort_order,
    ),
    reports_to_name: reports_to_user?.name ?? null,
    converted_employee_name: converted_user?.name ?? null,
  } as OfferDetail
}
