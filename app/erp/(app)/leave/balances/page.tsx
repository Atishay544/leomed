import { CalendarRange, Filter } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listLeaveBalancesSummary } from '@/lib/erp/data/leave'
import { qty } from '@/lib/erp/format'
import LeaveBalanceDialog from '@/components/erp/leave/LeaveBalanceDialog'
import { Badge, Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Leave Balances' }

interface Props {
  searchParams: Promise<{ year?: string }>
}

function Remaining({ allocated, used }: { allocated: number; used: number }) {
  const remaining = Math.max(0, allocated - used)
  const isLow = allocated > 0 && remaining <= 0
  return (
    <span className={isLow ? 'font-medium text-red-600' : 'text-gray-900'}>
      {qty(remaining)} <span className="text-gray-400">/ {qty(allocated)}</span>
    </span>
  )
}

export default async function LeaveBalancesPage({ searchParams }: Props) {
  await requireCapability('leave.manage')
  const params = await searchParams
  const now = new Date()
  const year = Number(params.year) || now.getFullYear()
  const yearOptions = [year - 1, year, year + 1]

  const rows = await listLeaveBalancesSummary(year)

  return (
    <>
      <PageHeader
        title="Leave Balances"
        description="Earned/Sick/Casual Leave quota per employee per year. Applying for one of these is blocked once the remaining balance runs out — the employee is asked to use Unpaid Leave / Loss of Pay instead."
        action={<LeaveBalanceDialog year={year} />}
      />

      <Card padded={false}>
        <form method="get" action="/erp/leave/balances" className="flex flex-wrap items-end gap-2.5 border-b border-gray-100 px-4 py-3">
          <div>
            <label htmlFor="f-year" className="mb-1 block text-[11px] font-medium text-gray-500">Year</label>
            <select id="f-year" name="year" defaultValue={String(year)}
                    className="rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-[12.5px] text-gray-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-none">
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-[12.5px] font-semibold text-white transition hover:bg-gray-800">
            <Filter size={13} /> Apply
          </button>
        </form>

        {rows.length === 0 ? (
          <EmptyState
            icon={CalendarRange}
            title={`No leave balances set for ${year}`}
            description="Set one to let that employee apply for Earned/Sick/Casual Leave against a real quota."
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[760px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Employee</Th>
                  <Th align="right">Earned Leave</Th>
                  <Th align="right">Sick Leave</Th>
                  <Th align="right">Casual Leave</Th>
                  <Th align="right">Edit</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => (
                  <tr key={r.employee_id}>
                    <Td>
                      <span className="font-medium text-gray-900">{r.employee_name}</span>
                      {r.mr_code && <Badge className="ml-2 bg-gray-100 text-gray-600 ring-gray-400/20">{r.mr_code}</Badge>}
                    </Td>
                    <Td align="right" className="tabular-nums"><Remaining allocated={r.el_allocated} used={r.el_used} /></Td>
                    <Td align="right" className="tabular-nums"><Remaining allocated={r.sl_allocated} used={r.sl_used} /></Td>
                    <Td align="right" className="tabular-nums"><Remaining allocated={r.cl_allocated} used={r.cl_used} /></Td>
                    <Td align="right">
                      <LeaveBalanceDialog
                        year={year}
                        existing={r}
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
      </Card>
    </>
  )
}
