import { CreditCard } from 'lucide-react'
import { listBankAccounts } from '@/lib/erp/data/bank-accounts'
import { saveBankAccount, selectBankAccount, setBankAccountActive } from '@/lib/erp/actions/masters'
import { BANK_ACCOUNT_FIELDS } from '@/components/erp/master-fields'
import MasterFormDialog from '@/components/erp/MasterFormDialog'
import ToggleActiveButton from '@/components/erp/ToggleActiveButton'
import SelectInvoiceBankButton from '@/components/erp/SelectInvoiceBankButton'
import { Badge, EmptyState, TableWrap, Td, Th } from '@/components/erp/ui'

/** Admin keeps as many bank accounts on file as needed; whichever one is
 *  marked "Used on invoices" is the one printed on every sales invoice —
 *  a single admin-wide choice, not something picked per invoice. */
export default async function BankAccountsSection({
  selectedBankAccountId,
}: {
  selectedBankAccountId: string | null
}) {
  const accounts = await listBankAccounts()

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-gray-900">Bank accounts</h2>
          <p className="mt-0.5 text-[12px] text-gray-500">
            Keep as many on file as you like — whichever one is &quot;Used on invoices&quot; is printed on every sales invoice.
          </p>
        </div>
        <MasterFormDialog
          action={saveBankAccount}
          fields={BANK_ACCOUNT_FIELDS}
          title="Add bank account"
          triggerLabel="Add bank account"
          submitLabel="Save bank account"
        />
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No bank accounts yet"
          description="Add one so it can be printed on sales invoices."
        />
      ) : (
        <TableWrap>
          <table className="w-full min-w-[760px]">
            <thead className="bg-gray-50">
              <tr>
                <Th>Bank</Th>
                <Th>Account holder</Th>
                <Th>Account no. / IFSC</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {accounts.map(b => (
                <tr key={b.id} className="hover:bg-gray-50/60">
                  <Td>
                    <span className="font-medium text-gray-900">{b.bank_name}</span>
                    {!b.active && <Badge className="ml-2 bg-gray-100 text-gray-500 ring-gray-400/20">Inactive</Badge>}
                    {b.branch && <p className="mt-0.5 text-[11.5px] text-gray-400">{b.branch}</p>}
                  </Td>
                  <Td>
                    {b.account_holder_name}
                    {b.upi_id && <p className="mt-0.5 text-[11.5px] text-gray-400">UPI: {b.upi_id}</p>}
                  </Td>
                  <Td className="font-mono text-[11.5px]">
                    {b.account_number}
                    <p className="mt-0.5 text-gray-400">{b.ifsc_code}</p>
                  </Td>
                  <Td align="right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <SelectInvoiceBankButton
                        id={b.id}
                        selected={b.active && b.id === selectedBankAccountId}
                        action={selectBankAccount}
                      />
                      <MasterFormDialog
                        action={saveBankAccount}
                        fields={BANK_ACCOUNT_FIELDS}
                        title={`Edit ${b.bank_name}`}
                        submitLabel="Save changes"
                        initial={b as unknown as Record<string, unknown>}
                        trigger={
                          <button type="button" className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50">
                            Edit
                          </button>
                        }
                      />
                      <ToggleActiveButton
                        id={b.id} active={b.active}
                        action={setBankAccountActive} noun="bank account"
                      />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </section>
  )
}
