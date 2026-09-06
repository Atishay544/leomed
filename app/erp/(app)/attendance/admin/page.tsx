import Link from 'next/link'
import { AlertTriangle, CalendarOff, CheckCircle2, Clock, Fingerprint, Users } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { getAttendanceSummary, listAttendance } from '@/lib/erp/data/attendance'
import { listErpUsers } from '@/lib/erp/data/users'
import { PAGE_SIZE, parsePage } from '@/lib/erp/data/query'
import {
  ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_STYLES, formatClockTime, formatMinutes, isoDate,
} from '@/lib/erp/format'
import { ATTENDANCE_STATUSES, ERP_ROLES } from '@/lib/erp/types'
import { ROLE_LABELS } from '@/lib/erp/permissions'
import { FilterForm, FilterSelect } from '@/components/erp/FilterForm'
import SearchBar from '@/components/erp/SearchBar'
import Pagination from '@/components/erp/Pagination'
import {
  Badge, Card, EmptyState, PageHeader, StatCard, TableWrap, Td, Th,
} from '@/components/erp/ui'

export const metadata = { title: 'Attendance' }

interface Props {
  searchParams: Promise<{
    page?: string; date?: string; role?: string; territory?: string
    department?: string; status?: string; q?: string
  }>
}

export default async function AdminAttendancePage({ searchParams }: Props) {
  await requireCapability('attendance.read.all')
  const params = await searchParams
  const page = parsePage(params.page)
  const date = params.date || isoDate()

  const [summary, { rows, total, pageCount }, staff] = await Promise.all([
    getAttendanceSummary(date, params.role, params.territory, params.department),
    listAttendance({
      page, date, employeeId: undefined, role: params.role, territory: params.territory,
      department: params.department,
      status: (params.status as typeof ATTENDANCE_STATUSES[number] | undefined) ?? 'ALL',
      q: params.q,
    }),
    listErpUsers({ page: 1 }),
  ])

  const territories = [...new Set(staff.rows.map(u => u.territory).filter((t): t is string => !!t))].sort()
  const departments = [...new Set(staff.rows.map(u => u.department).filter((d): d is string => !!d))].sort()
  const hasFilters = !!(params.role || params.territory || params.department || params.status || params.q)

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ date, ...(params.role && { role: params.role }), ...extra })
    return `/erp/attendance/admin?${p.toString()}`
  }

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Every non-admin employee's check-in/out, working time and — for MRs — field visit counts."
      />

      <form method="get" className="mb-4 flex items-center gap-2">
        <input type="hidden" name="role" value={params.role ?? ''} />
        <label htmlFor="date" className="text-[12.5px] font-medium text-gray-600">Date</label>
        <input
          id="date" type="date" name="date" defaultValue={date} max={isoDate()}
          className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-[12.5px]
                     focus:border-emerald-600 focus:outline-none"
        />
        <button type="submit" className="rounded-lg bg-gray-900 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-gray-800">
          Go
        </button>
      </form>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <StatCard label="Employees"      value={summary.total_employees} icon={Users}
                  href={qs({ status: '' })} />
        <StatCard label="Present"        value={summary.present}         icon={CheckCircle2} tone="positive"
                  href={qs({ status: 'PRESENT' })} />
        <StatCard label="Absent"         value={summary.absent}          icon={CalendarOff}  tone="critical"
                  href={qs({ status: 'ABSENT' })} />
        <StatCard label="Half day"       value={summary.half_day}        icon={Clock}        tone="warning"
                  href={qs({ status: 'HALF_DAY' })} />
        <StatCard label="Leave"          value={summary.leave}           icon={Fingerprint}
                  href={qs({ status: 'LEAVE' })} />
        <StatCard label="Pending review" value={summary.pending_review}  icon={AlertTriangle} tone="warning"
                  href={qs({ status: 'PENDING_REVIEW' })} />
        <StatCard label="Exceptions"     value={summary.exceptions}      icon={AlertTriangle} tone="warning"
                  href={qs({ status: 'PRESENT_WITH_EXCEPTION' })} />
      </div>

      <Card padded={false}>
        <div className="border-b border-gray-100 px-4 py-3">
          <SearchBar placeholder="Employee name, MR code…" />
        </div>
        <FilterForm action="/erp/attendance/admin" hasFilters={hasFilters}>
          <input type="hidden" name="date" value={date} />
          <FilterSelect
            name="role" label="Role" defaultValue={params.role}
            options={ERP_ROLES.filter(r => r !== 'ADMIN').map(r => ({ value: r, label: ROLE_LABELS[r] }))}
            allLabel="All roles"
          />
          <FilterSelect
            name="territory" label="Territory" defaultValue={params.territory}
            options={territories.map(t => ({ value: t, label: t }))}
            allLabel="All territories"
          />
          <FilterSelect
            name="department" label="Department" defaultValue={params.department}
            options={departments.map(d => ({ value: d, label: d }))}
            allLabel="All departments"
          />
          <FilterSelect
            name="status" label="Status" defaultValue={params.status}
            options={ATTENDANCE_STATUSES.map(s => ({ value: s, label: ATTENDANCE_STATUS_LABELS[s] }))}
            allLabel="All statuses"
          />
        </FilterForm>

        {rows.length === 0 ? (
          <EmptyState icon={Fingerprint} title="No attendance rows match" description="Try a different date or clear the filters." />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[860px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Employee</Th>
                  <Th>Role</Th>
                  <Th>Check-in</Th>
                  <Th>Check-out</Th>
                  <Th align="right">Working time</Th>
                  <Th align="center">Doctor / Chemist</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(row => (
                  <tr key={row.id} className="hover:bg-gray-50/60">
                    <Td>
                      <Link
                        href={`/erp/attendance/admin/${row.employee_id}?date=${row.date}`}
                        className="font-medium text-emerald-700 hover:underline"
                      >
                        {row.erp_users?.name ?? '—'}
                      </Link>
                      {row.erp_users?.mr_code && (
                        <p className="font-mono text-[11px] text-gray-400">{row.erp_users.mr_code}</p>
                      )}
                    </Td>
                    <Td>{row.erp_users?.role ? ROLE_LABELS[row.erp_users.role as keyof typeof ROLE_LABELS] : '—'}</Td>
                    <Td>{formatClockTime(row.check_in_time)}</Td>
                    <Td>{formatClockTime(row.check_out_time)}</Td>
                    <Td align="right" className="tabular-nums">{formatMinutes(row.total_working_minutes)}</Td>
                    <Td align="center" className="tabular-nums">
                      {row.erp_users?.role === 'MR'
                        ? `${row.doctor_visit_count}/${row.required_doctor_visits ?? '—'} · ${row.chemist_visit_count}/${row.required_chemist_visits ?? '—'}`
                        : <span className="text-gray-400">N/A</span>}
                    </Td>
                    <Td>
                      <Badge className={ATTENDANCE_STATUS_STYLES[row.attendance_status]}>
                        {ATTENDANCE_STATUS_LABELS[row.attendance_status]}
                      </Badge>
                      {row.is_manual_override && (
                        <p className="mt-0.5 text-[10.5px] text-gray-400">Manually corrected</p>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}

        <Pagination
          page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE}
          searchParams={{ ...params, date }} basePath="/erp/attendance/admin"
        />
      </Card>
    </>
  )
}
