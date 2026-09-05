import { CalendarClock } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listFollowups, parsePage } from '@/lib/erp/data/visits'
import { listMrs } from '@/lib/erp/data/users'
import { can } from '@/lib/erp/permissions'
import { PAGE_SIZE } from '@/lib/erp/data/query'
import {
  FOLLOWUP_PRIORITY_STYLES, FOLLOWUP_STATUS_LABELS, formatDate, isoDate,
} from '@/lib/erp/format'
import { FOLLOWUP_STATUSES } from '@/lib/erp/types'
import { FilterForm, FilterSelect } from '@/components/erp/FilterForm'
import FollowupActions from '@/components/erp/FollowupActions'
import Pagination from '@/components/erp/Pagination'
import { Badge, Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Follow-ups' }

interface Props {
  searchParams: Promise<{ page?: string; status?: string; mr?: string }>
}

export default async function FollowupsPage({ searchParams }: Props) {
  const session = await requireCapability('followups.manage')
  const params = await searchParams
  const page = parsePage(params.page)
  const today = isoDate()

  const seesEveryone = can(session.role, 'visits.read.all')
  const mrFilter = seesEveryone ? params.mr : session.id
  const status = params.status ?? 'PENDING'

  const [{ rows, total, pageCount }, mrs] = await Promise.all([
    listFollowups({ page, mrId: mrFilter, status }),
    seesEveryone ? listMrs() : Promise.resolve([]),
  ])

  const overdue = rows.filter(f => f.status === 'PENDING' && f.followup_date < today).length

  return (
    <>
      <PageHeader
        title="Follow-ups"
        description="Commitments made during visits. Overdue items are listed first."
      />

      {overdue > 0 && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-[13px] text-red-900">
            <strong>{overdue}</strong> follow-up{overdue > 1 ? 's are' : ' is'} past its due date.
          </p>
        </div>
      )}

      <Card padded={false}>
        <FilterForm action="/erp/mr/followups" hasFilters={status !== 'PENDING' || !!params.mr}>
          <FilterSelect
            name="status" label="Status" defaultValue={status}
            options={FOLLOWUP_STATUSES.map(s => ({ value: s, label: FOLLOWUP_STATUS_LABELS[s] }))}
            allLabel="All statuses"
          />
          {seesEveryone && mrs.length > 0 && (
            <FilterSelect
              name="mr" label="MR" defaultValue={params.mr}
              options={mrs.map(m => ({
                value: m.id, label: m.mr_code ? `${m.mr_code} — ${m.name}` : m.name,
              }))}
              allLabel="All MRs"
            />
          )}
        </FilterForm>

        {rows.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Nothing here"
            description={status === 'PENDING'
              ? 'No pending follow-ups. Schedule one while recording a visit.'
              : 'No follow-ups match this filter.'}
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[840px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Due</Th>
                  <Th>Customer</Th>
                  <Th>What to do</Th>
                  {seesEveryone && <Th>MR</Th>}
                  <Th>Priority</Th>
                  <Th align="right">Action</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(f => {
                  const name = f.erp_doctors?.doctor_name ?? f.erp_chemists?.chemist_name ?? '—'
                  const phone = f.erp_doctors?.phone ?? f.erp_chemists?.phone
                  const area = f.erp_doctors?.area ?? f.erp_chemists?.area
                  const isOverdue = f.status === 'PENDING' && f.followup_date < today
                  return (
                    <tr key={f.id} className={isOverdue ? 'bg-red-50/40' : 'hover:bg-gray-50/60'}>
                      <Td>
                        <span className={isOverdue ? 'font-semibold text-red-700' : 'text-gray-700'}>
                          {formatDate(f.followup_date)}
                        </span>
                        {isOverdue && (
                          <p className="mt-0.5 text-[11px] font-medium text-red-600">Overdue</p>
                        )}
                      </Td>
                      <Td>
                        <span className="font-medium text-gray-900">{name}</span>
                        <p className="mt-0.5 text-[11px] uppercase tracking-wide text-gray-400">
                          {f.customer_type === 'DOCTOR' ? 'Doctor' : 'Chemist'}
                          {area ? ` · ${area}` : ''}
                        </p>
                      </Td>
                      <Td className="max-w-xs">
                        {f.description ?? <span className="text-gray-400">—</span>}
                      </Td>
                      {seesEveryone && <Td>{f.erp_users?.mr_code ?? f.erp_users?.name ?? '—'}</Td>}
                      <Td>
                        <Badge className={FOLLOWUP_PRIORITY_STYLES[f.priority]}>{f.priority}</Badge>
                      </Td>
                      <Td align="right">
                        <div className="flex items-center justify-end gap-2">
                          {phone && f.status === 'PENDING' && (
                            <a
                              href={`tel:${phone}`}
                              className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-[12px]
                                         font-medium text-gray-700 transition hover:bg-gray-50"
                            >
                              Call
                            </a>
                          )}
                          <FollowupActions followupId={f.id} status={f.status} />
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableWrap>
        )}

        <Pagination
          page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE}
          searchParams={params} basePath="/erp/mr/followups"
        />
      </Card>
    </>
  )
}
