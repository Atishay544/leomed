import { Wallet } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { getExpenseSummary, listAllExpenses } from '@/lib/erp/data/expenses'
import { PAGE_SIZE, parsePage } from '@/lib/erp/data/query'
import {
  EXPENSE_CATEGORY_LABELS, EXPENSE_STATUS_LABELS, EXPENSE_STATUS_STYLES, formatDate, isoDate, money,
} from '@/lib/erp/format'
import { EXPENSE_CATEGORIES, EXPENSE_STATUSES } from '@/lib/erp/types'
import { FilterForm, FilterSelect } from '@/components/erp/FilterForm'
import Pagination from '@/components/erp/Pagination'
import ExpenseReviewButtons from '@/components/erp/expenses/ExpenseReviewButtons'
import { Badge, Card, EmptyState, PageHeader, StatCard, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Expenses' }

interface Props {
  searchParams: Promise<{ page?: string; status?: string; category?: string }>
}

/** First and last calendar day of the current month, in local time. */
function currentMonthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { from: isoDate(from), to: isoDate(to) }
}

export default async function AdminExpensesPage({ searchParams }: Props) {
  await requireCapability('expenses.manage')
  const params = await searchParams
  const page = parsePage(params.page)
  const month = currentMonthRange()

  const [summary, { rows, total, pageCount }] = await Promise.all([
    getExpenseSummary(month.from, month.to),
    listAllExpenses({
      page,
      status: (params.status as 'ALL') ?? 'ALL',
      category: params.category,
    }),
  ])

  const hasFilters = !!(params.status || params.category)
  const marketing = Number(summary.by_category.MARKETING ?? 0) + Number(summary.by_category.PROMOTIONAL ?? 0)
  const travel = Number(summary.by_category.TRAVEL ?? 0) + Number(summary.by_category.FUEL ?? 0)
  const office = Number(summary.by_category.OFFICE ?? 0)
  const other = Number(summary.total) - marketing - travel - office

  return (
    <>
      <PageHeader title="Expenses" description="Company and employee expenses for the current month." />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Total expenses" value={money(summary.total)} icon={Wallet} />
        <StatCard label="Travel & fuel" value={money(travel)} />
        <StatCard label="Marketing" value={money(marketing)} />
        <StatCard label="Office" value={money(office)} />
        <StatCard label="Other" value={money(Math.max(0, other))} />
      </div>

      <Card padded={false}>
        <FilterForm action="/erp/expenses/admin" hasFilters={hasFilters}>
          <FilterSelect
            name="status" label="Status" defaultValue={params.status}
            options={EXPENSE_STATUSES.map(s => ({ value: s, label: EXPENSE_STATUS_LABELS[s] }))}
            allLabel="All statuses"
          />
          <FilterSelect
            name="category" label="Category" defaultValue={params.category}
            options={EXPENSE_CATEGORIES.map(c => ({ value: c, label: EXPENSE_CATEGORY_LABELS[c] }))}
            allLabel="All categories"
          />
        </FilterForm>

        {rows.length === 0 ? (
          <EmptyState icon={Wallet} title="No expenses match" />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[880px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Date</Th>
                  <Th>Employee</Th>
                  <Th>Category</Th>
                  <Th>Description</Th>
                  <Th align="right">Amount</Th>
                  <Th>Status</Th>
                  <Th align="right">Action</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(e => (
                  <tr key={e.id}>
                    <Td>{formatDate(e.expense_date)}</Td>
                    <Td>
                      <span className="font-medium text-gray-900">{e.erp_users?.name ?? '—'}</span>
                    </Td>
                    <Td>{EXPENSE_CATEGORY_LABELS[e.category]}</Td>
                    <Td className="max-w-[220px] truncate">{e.description ?? e.vendor_name ?? '—'}</Td>
                    <Td align="right" className="tabular-nums">{money(e.amount)}</Td>
                    <Td><Badge className={EXPENSE_STATUS_STYLES[e.status]}>{EXPENSE_STATUS_LABELS[e.status]}</Badge></Td>
                    <Td align="right"><ExpenseReviewButtons id={e.id} status={e.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}

        <Pagination page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE} searchParams={params} basePath="/erp/expenses/admin" />
      </Card>
    </>
  )
}
