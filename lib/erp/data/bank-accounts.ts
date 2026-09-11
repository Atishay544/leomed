import 'server-only'
import { erpDb } from './query'
import type { BankAccount } from '../types'

/** All bank accounts on file, active first — for the Settings screen's
 *  "Bank accounts" list, where admin adds/edits them and picks which one is
 *  printed on sales invoices. */
export async function listBankAccounts(): Promise<BankAccount[]> {
  const db = await erpDb()
  const { data } = await db
    .from('erp_bank_accounts')
    .select('*')
    .order('active', { ascending: false })
    .order('bank_name', { ascending: true })
  return (data ?? []) as BankAccount[]
}

/** The bank account currently selected to appear on printed sales invoices,
 *  or null if none is selected or the selected one has since been
 *  deactivated (deactivating one silently drops it off future invoices,
 *  rather than an admin having to remember to also clear the selection). */
export async function getSelectedBankAccount(id: string | null): Promise<BankAccount | null> {
  if (!id) return null
  const db = await erpDb()
  const { data } = await db
    .from('erp_bank_accounts')
    .select('*')
    .eq('id', id)
    .eq('active', true)
    .maybeSingle()
  return (data as BankAccount | null) ?? null
}
