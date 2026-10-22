import { CalendarDays } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listAllLeaveRequests, listLeaveTypes } from '@/lib/erp/data/leave'
import { PAGE_SIZE, parsePage } from '@/lib/erp/data/query'
import { formatDate, LEAVE_STATUS_LABELS, LEAVE_STATUS_STYLES } from '@/lib/erp/format'
import { LEAVE_STATUSES } from '@/lib/erp/types'
import { FilterForm, FilterSelect } from '@/components/erp/FilterForm'
import Pagination from '@/components/erp/Pagination'
import LeaveReviewButtons from '@/components/erp/leave/LeaveReviewButtons'
import { Badge, Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: "My Team's Leave" }

interface Props {
  searchParams: Promise<{ page?: string; status?: string; type?: string }>
}

/**
 * A manager's own narrow view — only leave requests from employees who
 * report to them (erp_users.reports_to), enforced by erp_leave_requests'
 * own RLS select policy, not by filtering here. No leave-type management,
 * no "create leave on anyone's behalf" — those stay admin/HR only on the
 * separate /erp/leave/admin screen, which this deliberately does not reuse.
 */
export default async function TeamLeavePage({ searchParams }: Props) {
  await requireCapability('leave.manage_team')
  const params = await searchParams
  const page = parsePage(params.page)

  const [leaveTypes, { rows, total, pageCount }] = await Promise.all([
    listLeaveTypes(false),
    listAllLeaveRequests({
      page,
      status: (params.status as 'ALL') ?? 'ALL',
      leaveTypeId: params.type,
    }),
  ])

  const hasFilters = !!(params.status || params.type)

  return (
    <>
      <PageHeader
        title="My Team's Leave"
        description="Leave requests from the people who report to you. Approving marks the affected days as Leave in their attendance automatically."
      />

      <Card padded={false}>
        <FilterForm action="/erp/leave/team" hasFilters={hasFilters}>
          <FilterSelect
            name="status" label="Status" defaultValue={params.status}
            options={LEAVE_STATUSES.map(s => ({ value: s, label: LEAVE_STATUS_LABELS[s] }))}
            allLabel="All statuses"
          />
          <FilterSelect
            name="type" label="Leave type" defaultValue={params.type}
            options={leaveTypes.map(t => ({ value: t.id, label: t.name }))}
            allLabel="All types"
          />
        </FilterForm>

        {rows.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No leave requests match"
            description="Either nobody reporting to you has applied, or everything's already been reviewed."
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[860px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Employee</Th>
                  <Th>Type</Th>
                  <Th>From</Th>
                  <Th>To</Th>
                  <Th>Reason</Th>
                  <Th>Status</Th>
                  <Th align="right">Action</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => (
                  <tr key={r.id}>
                    <Td>
                      <span className="font-medium text-gray-900">{r.erp_users?.name ?? '—'}</span>
                      {r.erp_users?.mr_code && <span className="ml-1.5 font-mono text-[11px] text-gray-400">{r.erp_users.mr_code}</span>}
                    </Td>
                    <Td>{r.erp_leave_types?.name ?? '—'}</Td>
                    <Td>{formatDate(r.from_date)}</Td>
                    <Td>{formatDate(r.to_date)}</Td>
                    <Td className="max-w-[200px] truncate">{r.reason ?? '—'}</Td>
                    <Td><Badge className={LEAVE_STATUS_STYLES[r.status]}>{LEAVE_STATUS_LABELS[r.status]}</Badge></Td>
                    <Td align="right"><LeaveReviewButtons id={r.id} status={r.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}

        <Pagination
          page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE}
          searchParams={params} basePath="/erp/leave/team"
        />
      </Card>
    </>
  )
}
