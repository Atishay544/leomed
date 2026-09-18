import { CalendarDays } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { getEmployeeLeaveSummary, listLeaveTypes, listMyLeaveRequests } from '@/lib/erp/data/leave'
import { PAGE_SIZE, parsePage } from '@/lib/erp/data/query'
import { formatDate, LEAVE_STATUS_LABELS, LEAVE_STATUS_STYLES, qty } from '@/lib/erp/format'
import LeaveApplicationForm from '@/components/erp/leave/LeaveApplicationForm'
import CancelLeaveButton from '@/components/erp/leave/CancelLeaveButton'
import Pagination from '@/components/erp/Pagination'
import {
  Badge, Card, CardHeader, EmptyState, PageHeader, StatCard, TableWrap, Td, Th,
} from '@/components/erp/ui'

export const metadata = { title: 'My Leave' }

interface Props {
  searchParams: Promise<{ page?: string }>
}

export default async function MyLeavePage({ searchParams }: Props) {
  const session = await requireCapability('leave.apply')
  const params = await searchParams
  const page = parsePage(params.page)
  const year = new Date().getFullYear()

  const [leaveTypes, myRequests, balances] = await Promise.all([
    listLeaveTypes(),
    listMyLeaveRequests(session.id, page),
    getEmployeeLeaveSummary(session.id, year),
  ])

  return (
    <>
      <PageHeader title="My Leave" description="Apply for leave and track your own requests. Other employees' leave is not shown here." />

      {balances.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {balances.map(b => (
            <StatCard
              key={b.leave_type_id}
              label={`${b.name} (${year})`}
              value={`${qty(b.remaining)} left`}
              hint={
                `${qty(b.used)} used of ${qty(b.allocated)} allocated` +
                (b.monthly_cap_days != null ? ` · max ${qty(b.monthly_cap_days)}/month` : '')
              }
              tone={b.remaining <= 0 ? 'critical' : b.remaining <= 2 ? 'warning' : 'positive'}
            />
          ))}
        </div>
      )}

      <div className="mb-6 max-w-2xl">
        <LeaveApplicationForm leaveTypes={leaveTypes} balances={balances} />
      </div>

      <Card padded={false}>
        <CardHeader title="My leave requests" />
        {myRequests.rows.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No leave requests yet" />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[640px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>From</Th>
                  <Th>To</Th>
                  <Th>Type</Th>
                  <Th>Reason</Th>
                  <Th>Status</Th>
                  <Th align="right">Action</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {myRequests.rows.map(r => (
                  <tr key={r.id}>
                    <Td>{formatDate(r.from_date)}</Td>
                    <Td>{formatDate(r.to_date)}</Td>
                    <Td>{r.erp_leave_types?.name ?? '—'}</Td>
                    <Td className="max-w-[220px] truncate">{r.reason ?? '—'}</Td>
                    <Td>
                      <Badge className={LEAVE_STATUS_STYLES[r.status]}>{LEAVE_STATUS_LABELS[r.status]}</Badge>
                      {r.admin_remarks && <p className="mt-0.5 text-[11px] text-gray-400">{r.admin_remarks}</p>}
                    </Td>
                    <Td align="right">
                      {r.status === 'PENDING' && <CancelLeaveButton id={r.id} />}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <Pagination
          page={page} pageCount={myRequests.pageCount} total={myRequests.total} pageSize={PAGE_SIZE}
          searchParams={params} basePath="/erp/leave"
        />
      </Card>
    </>
  )
}
