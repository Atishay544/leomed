import { Wallet } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listEmployeeSalaries } from '@/lib/erp/data/payroll'
import { PAGE_SIZE, parsePage } from '@/lib/erp/data/query'
import { formatDate, money } from '@/lib/erp/format'
import SalaryDialog from '@/components/erp/payroll/SalaryDialog'
import Pagination from '@/components/erp/Pagination'
import { Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Salaries' }

interface Props {
  searchParams: Promise<{ page?: string }>
}

export default async function SalariesPage({ searchParams }: Props) {
  await requireCapability('payroll.manage')
  const params = await searchParams
  const page = parsePage(params.page)

  const { rows, total, pageCount } = await listEmployeeSalaries(page)

  return (
    <>
      <PageHeader
        title="Salaries"
        description="Fixed salary structure per employee. Payroll snapshots this at generation time — a later change never rewrites an already-finalized month."
        action={<SalaryDialog />}
      />

      <Card padded={false}>
        {rows.length === 0 ? (
          <EmptyState icon={Wallet} title="No salaries configured yet" description="Set a salary to include an employee in payroll." />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[820px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Employee</Th>
                  <Th align="right">Fixed salary</Th>
                  <Th align="right">Basic</Th>
                  <Th align="right">Gross</Th>
                  <Th align="right">Allowances</Th>
                  <Th align="right">Std. deductions</Th>
                  <Th>Effective from</Th>
                  <Th align="right">Edit</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(s => (
                  <tr key={s.employee_id}>
                    <Td>
                      <span className="font-medium text-gray-900">{s.erp_users?.name ?? '—'}</span>
                      {s.erp_users?.mr_code && <span className="ml-1.5 font-mono text-[11px] text-gray-400">{s.erp_users.mr_code}</span>}
                    </Td>
                    <Td align="right" className="tabular-nums font-medium">{money(s.fixed_salary)}</Td>
                    <Td align="right" className="tabular-nums">{money(s.basic_salary)}</Td>
                    <Td align="right" className="tabular-nums">{money(s.gross_salary)}</Td>
                    <Td align="right" className="tabular-nums">{money(s.allowances)}</Td>
                    <Td align="right" className="tabular-nums">{money(s.standard_deductions)}</Td>
                    <Td>{formatDate(s.effective_from)}</Td>
                    <Td align="right">
                      <SalaryDialog
                        existing={{ ...s, employeeName: s.erp_users?.name }}
                        trigger={
                          <button type="button" className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[12px] font-medium text-gray-700 hover:bg-gray-50">
                            Edit
                          </button>
                        }
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <Pagination page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE} searchParams={params} basePath="/erp/payroll/salaries" />
      </Card>
    </>
  )
}
