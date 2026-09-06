import { CalendarDays } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listAllLeaveRequests, listLeaveTypes } from '@/lib/erp/data/leave'
import { PAGE_SIZE, parsePage } from '@/lib/erp/data/query'
import { formatDate, LEAVE_STATUS_LABELS, LEAVE_STATUS_STYLES } from '@/lib/erp/format'
import { LEAVE_STATUSES } from '@/lib/erp/types'
import { LEAVE_TYPE_FIELDS } from '@/components/erp/master-fields'
import { saveLeaveType } from '@/lib/erp/actions/leave'
import { FilterForm, FilterSelect } from '@/components/erp/FilterForm'
import Pagination from '@/components/erp/Pagination'
import MasterFormDialog from '@/components/erp/MasterFormDialog'
import AdminCreateLeaveDialog from '@/components/erp/leave/AdminCreateLeaveDialog'
import LeaveReviewButtons from '@/components/erp/leave/LeaveReviewButtons'
import { Badge, Card, CardHeader, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Leave Requests' }

interface Props {
  searchParams: Promise<{ page?: string; status?: string; type?: string }>
}

export default async function AdminLeavePage({ searchParams }: Props) {
  await requireCapability('leave.manage')
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
        title="Leave Requests"
        description="Approving a request marks the affected days as Leave in attendance automatically."
        action={<AdminCreateLeaveDialog leaveTypes={leaveTypes.filter(t => t.active)} />}
      />

      <div className="mb-6">
        <Card padded={false}>
          <CardHeader
            title="Leave types"
            action={
              <MasterFormDialog
                action={saveLeaveType}
                fields={LEAVE_TYPE_FIELDS}
                title="Add leave type"
                triggerLabel="Add type"
                submitLabel="Save"
                // No `id` here, so this still inserts rather than updates —
                // only pre-checks the two boxes a new leave type almost
                // always wants (paid, active), since an unchecked checkbox
                // now correctly means false rather than being ignored.
                initial={{ is_paid: true, active: true }}
              />
            }
          />
          <div className="flex flex-wrap gap-2 px-5 py-3.5">
            {leaveTypes.map(t => (
              <MasterFormDialog
                key={t.id}
                action={saveLeaveType}
                fields={LEAVE_TYPE_FIELDS}
                title={`Edit ${t.name}`}
                submitLabel="Save"
                initial={t as unknown as Record<string, unknown>}
                trigger={
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 text-[11.5px] font-medium ring-1 ring-inset ${
                      t.active ? 'bg-gray-50 text-gray-700 ring-gray-300' : 'bg-gray-50 text-gray-400 ring-gray-200 line-through'
                    }`}
                  >
                    {t.name}{!t.is_paid && ' (unpaid)'}
                  </button>
                }
              />
            ))}
          </div>
        </Card>
      </div>

      <Card padded={false}>
        <FilterForm action="/erp/leave/admin" hasFilters={hasFilters}>
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
          <EmptyState icon={CalendarDays} title="No leave requests match" />
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
          searchParams={params} basePath="/erp/leave/admin"
        />
      </Card>
    </>
  )
}
