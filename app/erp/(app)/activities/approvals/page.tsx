import { requireCapability } from '@/lib/erp/auth'
import { listActivityRequests } from '@/lib/erp/data/activities'
import { PAGE_SIZE, parsePage } from '@/lib/erp/data/query'
import Pagination from '@/components/erp/Pagination'
import ActivityTable from '@/components/erp/activities/ActivityTable'
import { Card, CardHeader, PageHeader } from '@/components/erp/ui'

export const metadata = { title: 'Activity Approvals' }

interface Props {
  searchParams: Promise<{ page?: string; hpage?: string }>
}

/**
 * Two lists, both scoped by the table's own RLS rather than filtered here:
 * what is waiting on you (an administrator is shown every pending request,
 * since they may act at any step), and the requests from your reporting line
 * that have already been decided — so a manager can follow what happened to
 * a request after they approved it.
 */
export default async function ActivityApprovalsPage({ searchParams }: Props) {
  const session = await requireCapability('activities.approve')
  const params = await searchParams
  const isAdmin = session.role === 'ADMIN'

  const queuePage = parsePage(params.page)
  const historyPage = parsePage(params.hpage)

  const [queue, history] = await Promise.all([
    listActivityRequests({
      page: queuePage,
      ...(isAdmin ? { pendingOnly: true } : { approverId: session.id }),
    }),
    listActivityRequests({
      page: historyPage, decidedOnly: true, excludeRequesterId: session.id, orderBy: 'decided_at',
    }),
  ])

  return (
    <>
      <PageHeader
        title="Activity Approvals"
        description={
          isAdmin
            ? 'Every pending activity request. Your approval is final — the activity is then recorded against the doctor or chemist.'
            : 'Activity requests from your team that are waiting on you. Approving passes the request up to your own manager; an administrator gives the final approval.'
        }
      />

      <div className="space-y-6">
        <Card padded={false}>
          <CardHeader title={`Waiting for approval (${queue.total})`} />
          <ActivityTable
            rows={queue.rows} mode="approvals" viewerId={session.id} viewerIsAdmin={isAdmin}
            emptyTitle="Nothing waiting on you"
            emptyDescription="New requests from your team will appear here as soon as they are raised."
          />
          <Pagination
            page={queuePage} pageCount={queue.pageCount} total={queue.total} pageSize={PAGE_SIZE}
            searchParams={params} basePath="/erp/activities/approvals"
          />
        </Card>

        <Card padded={false}>
          <CardHeader title="Decided" />
          <ActivityTable
            rows={history.rows} mode="records" viewerId={session.id}
            emptyTitle="No decided requests yet"
          />
          <Pagination
            page={historyPage} pageCount={history.pageCount} total={history.total} pageSize={PAGE_SIZE}
            searchParams={params} basePath="/erp/activities/approvals" pageParam="hpage"
          />
        </Card>
      </div>
    </>
  )
}
