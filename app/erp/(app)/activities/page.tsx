import { requireCapability } from '@/lib/erp/auth'
import { listActivityRequests } from '@/lib/erp/data/activities'
import { PAGE_SIZE, parsePage } from '@/lib/erp/data/query'
import { ACTIVITY_STATUS_LABELS } from '@/lib/erp/format'
import { ACTIVITY_STATUSES, type ActivityStatus } from '@/lib/erp/types'
import { FilterForm, FilterSelect } from '@/components/erp/FilterForm'
import Pagination from '@/components/erp/Pagination'
import ActivityRequestForm from '@/components/erp/activities/ActivityRequestForm'
import ActivityTable from '@/components/erp/activities/ActivityTable'
import { Card, CardHeader, PageHeader } from '@/components/erp/ui'

export const metadata = { title: 'Activity Requests' }

interface Props {
  searchParams: Promise<{ page?: string; status?: string }>
}

export default async function ActivityRequestsPage({ searchParams }: Props) {
  const session = await requireCapability('activities.request')
  const params = await searchParams
  const page = parsePage(params.page)
  const status = ACTIVITY_STATUSES.find(s => s === params.status) as ActivityStatus | undefined

  const { rows, total, pageCount } = await listActivityRequests({
    page, status, requesterId: session.id,
  })

  return (
    <>
      <PageHeader
        title="Activity Requests"
        description="Ask for an activity on a doctor or chemist — a cash benefit, conference, gift, display or board. It is approved level by level up your reporting line, and once an administrator approves it, it is recorded against that doctor or chemist."
      />

      <div className="mb-6">
        <ActivityRequestForm isAdmin={session.role === 'ADMIN'} />
      </div>

      <Card padded={false}>
        <CardHeader title="My requests" />
        <FilterForm action="/erp/activities" hasFilters={!!params.status}>
          <FilterSelect
            name="status" label="Status" defaultValue={params.status}
            options={ACTIVITY_STATUSES.map(s => ({ value: s, label: ACTIVITY_STATUS_LABELS[s] }))}
            allLabel="All statuses"
          />
        </FilterForm>

        <ActivityTable
          rows={rows} mode="mine" viewerId={session.id}
          emptyTitle="No requests yet"
          emptyDescription="Requests you raise will show up here with where they are in the approval chain."
        />

        <Pagination
          page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE}
          searchParams={params} basePath="/erp/activities"
        />
      </Card>
    </>
  )
}
