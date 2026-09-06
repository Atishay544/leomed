import { requireCapability } from '@/lib/erp/auth'
import { getMyAttendanceToday, listMyAttendanceHistory } from '@/lib/erp/data/attendance'
import {
  ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_STYLES, formatClockTime, formatDate, formatMinutes,
} from '@/lib/erp/format'
import { PAGE_SIZE, parsePage } from '@/lib/erp/data/query'
import AttendanceWidget from '@/components/erp/attendance/AttendanceWidget'
import Pagination from '@/components/erp/Pagination'
import { Badge, Card, CardHeader, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'
import { Fingerprint } from 'lucide-react'

export const metadata = { title: 'My Attendance' }

interface Props {
  searchParams: Promise<{ page?: string }>
}

export default async function MyAttendancePage({ searchParams }: Props) {
  const session = await requireCapability('attendance.checkin')
  const params = await searchParams
  const page = parsePage(params.page)

  const [today, history] = await Promise.all([
    getMyAttendanceToday(session.id),
    listMyAttendanceHistory(session.id, page),
  ])

  return (
    <>
      <PageHeader title="My Attendance" description="Check in when your day starts, check out when it ends." />

      <div className="mb-6">
        <AttendanceWidget initial={today} />
      </div>

      <Card padded={false}>
        <CardHeader title="History" />
        {history.rows.length === 0 ? (
          <EmptyState icon={Fingerprint} title="No attendance recorded yet" />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[640px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Date</Th>
                  <Th>Check-in</Th>
                  <Th>Check-out</Th>
                  <Th align="right">Working time</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.rows.map(row => (
                  <tr key={row.id}>
                    <Td>{formatDate(row.date)}</Td>
                    <Td>{formatClockTime(row.check_in_time)}</Td>
                    <Td>{formatClockTime(row.check_out_time)}</Td>
                    <Td align="right" className="tabular-nums">{formatMinutes(row.total_working_minutes)}</Td>
                    <Td>
                      <Badge className={ATTENDANCE_STATUS_STYLES[row.attendance_status]}>
                        {ATTENDANCE_STATUS_LABELS[row.attendance_status]}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <Pagination
          page={page} pageCount={history.pageCount} total={history.total} pageSize={PAGE_SIZE}
          searchParams={params} basePath="/erp/attendance"
        />
      </Card>
    </>
  )
}
