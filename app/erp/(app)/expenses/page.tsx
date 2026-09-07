import { Wallet } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listMyExpenses } from '@/lib/erp/data/expenses'
import { PAGE_SIZE, parsePage } from '@/lib/erp/data/query'
import {
  EXPENSE_CATEGORY_LABELS, EXPENSE_STATUS_LABELS, EXPENSE_STATUS_STYLES, formatDate, money,
} from '@/lib/erp/format'
import ExpenseForm from '@/components/erp/expenses/ExpenseForm'
import Pagination from '@/components/erp/Pagination'
import { Badge, Card, CardHeader, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'My Expenses' }

interface Props {
  searchParams: Promise<{ page?: string }>
}

export default async function MyExpensesPage({ searchParams }: Props) {
  const session = await requireCapability('expenses.submit')
  const params = await searchParams
  const page = parsePage(params.page)

  const { rows, total, pageCount } = await listMyExpenses(session.id, page)

  return (
    <>
      <PageHeader title="My Expenses" description="Submit your own expenses for approval. Other employees' expenses are not shown here." />

      <div className="mb-6 max-w-2xl">
        <ExpenseForm />
      </div>

      <Card padded={false}>
        <CardHeader title="My expenses" />
        {rows.length === 0 ? (
          <EmptyState icon={Wallet} title="No expenses submitted yet" />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[720px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Date</Th>
                  <Th>Category</Th>
                  <Th>Description</Th>
                  <Th align="right">Amount</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(e => (
                  <tr key={e.id}>
                    <Td>{formatDate(e.expense_date)}</Td>
                    <Td>{EXPENSE_CATEGORY_LABELS[e.category]}</Td>
                    <Td className="max-w-[240px] truncate">{e.description ?? e.vendor_name ?? '—'}</Td>
                    <Td align="right" className="tabular-nums">{money(e.amount)}</Td>
                    <Td>
                      <Badge className={EXPENSE_STATUS_STYLES[e.status]}>{EXPENSE_STATUS_LABELS[e.status]}</Badge>
                      {e.notes && <p className="mt-0.5 text-[11px] text-gray-400">{e.notes}</p>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <Pagination page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE} searchParams={params} basePath="/erp/expenses" />
      </Card>
    </>
  )
}
