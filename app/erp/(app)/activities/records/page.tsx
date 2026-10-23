import { requireErpUser } from '@/lib/erp/auth'
import { can } from '@/lib/erp/permissions'
import { redirect } from 'next/navigation'
import { listActivityRequests } from '@/lib/erp/data/activities'
import { PAGE_SIZE, parsePage } from '@/lib/erp/data/query'
import { FilterForm, FilterSelect } from '@/components/erp/FilterForm'
import Pagination from '@/components/erp/Pagination'
import SearchBar from '@/components/erp/SearchBar'
import ActivityTable from '@/components/erp/activities/ActivityTable'
import { Card, PageHeader } from '@/components/erp/ui'

export const metadata = { title: 'Approved Activities' }

interface Props {
  searchParams: Promise<{ page?: string; q?: string; target?: string; doctor?: string; chemist?: string }>
}

/**
 * The record of activities that cleared the whole chain and were approved by
 * an administrator — what has been (or is going to be) done for each doctor
 * and chemist. `?doctor=<id>` / `?chemist=<id>` narrows it to one customer,
 * which is how the Doctors / Chemists masters link here. Who sees which rows
 * is the table's RLS: the requester, their reporting chain above, and admin.
 */
export default async function ApprovedActivitiesPage({ searchParams }: Props) {
  const session = await requireErpUser()
  if (!can(session.role, 'activities.request') && !can(session.role, 'activities.approve')) {
    redirect('/erp/denied?need=activities.request')
  }
  const params = await searchParams
  const page = parsePage(params.page)
  const targetType = (['DOCTOR', 'CHEMIST'] as const).find(t => t === params.target)

  const { rows, total, pageCount } = await listActivityRequests({
    page, status: 'APPROVED', orderBy: 'decided_at', q: params.q, targetType,
    doctorId: params.doctor, chemistId: params.chemist,
  })

  return (
    <>
      <PageHeader
        title="Approved Activities"
        description="Activities that have been fully approved and are recorded against a doctor or chemist."
      />

      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <SearchBar placeholder="Doctor, chemist or requester…" />
          <p className="text-[12px] text-gray-500">{total} approved</p>
        </div>
        <FilterForm
          action="/erp/activities/records"
          hasFilters={!!(params.target || params.doctor || params.chemist)}
        >
          <FilterSelect
            name="target" label="For" defaultValue={params.target}
            options={[{ value: 'DOCTOR', label: 'Doctors' }, { value: 'CHEMIST', label: 'Chemists' }]}
            allLabel="Doctors & chemists"
          />
          {params.doctor && <input type="hidden" name="doctor" value={params.doctor} />}
          {params.chemist && <input type="hidden" name="chemist" value={params.chemist} />}
        </FilterForm>

        <ActivityTable
          rows={rows} mode="records" viewerId={session.id}
          emptyTitle="No approved activities"
          emptyDescription="Once an administrator approves a request it is recorded here against the doctor or chemist."
        />

        <Pagination
          page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE}
          searchParams={params} basePath="/erp/activities/records"
        />
      </Card>
    </>
  )
}
