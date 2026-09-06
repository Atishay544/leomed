import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckSquare, LogIn, LogOut, MapPin, Stethoscope, Store } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { getAttendanceDetail } from '@/lib/erp/data/attendance'
import {
  ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_STYLES, formatClockTime, formatDate, formatMinutes, isoDate, money,
} from '@/lib/erp/format'
import { ROLE_LABELS } from '@/lib/erp/permissions'
import type { ErpRole } from '@/lib/erp/types'
import AttendanceCorrectionForm from '@/components/erp/attendance/AttendanceCorrectionForm'
import { Badge, Card, EmptyState } from '@/components/erp/ui'

export const metadata = { title: 'Attendance detail' }

interface Props {
  params: Promise<{ employeeId: string }>
  searchParams: Promise<{ date?: string }>
}

const EVENT_ICON = { check_in: LogIn, check_out: LogOut, doctor_visit: Stethoscope, chemist_visit: Store } as const

export default async function AttendanceDetailPage({ params, searchParams }: Props) {
  await requireCapability('attendance.read.all')
  const { employeeId } = await params
  const { date: dateParam } = await searchParams
  const date = dateParam || isoDate()

  const detail = await getAttendanceDetail(employeeId, date)
  if (!detail.employee) notFound()

  const { attendance, employee, events, orderTotal } = detail
  const isMr = employee.role === 'MR'

  return (
    <>
      <div className="mb-4">
        <Link
          href={`/erp/attendance/admin?date=${date}`}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft size={14} /> Attendance
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-lg font-bold text-gray-900">{employee.name}</h1>
                <p className="mt-0.5 text-[12.5px] text-gray-500">
                  {ROLE_LABELS[employee.role as ErpRole]}
                  {employee.mr_code && <> · {employee.mr_code}</>}
                  {employee.employee_code && <> · {employee.employee_code}</>}
                  {employee.department && <> · {employee.department}</>}
                  {employee.territory && <> · {employee.territory}</>}
                </p>
                {employee.reports_to_user && (
                  <p className="mt-0.5 text-[12px] text-gray-400">Reports to {employee.reports_to_user.name}</p>
                )}
              </div>
              {attendance && (
                <Badge className={ATTENDANCE_STATUS_STYLES[attendance.attendance_status]}>
                  {ATTENDANCE_STATUS_LABELS[attendance.attendance_status]}
                </Badge>
              )}
            </div>

            <p className="mt-3 text-[12.5px] text-gray-500">{formatDate(date)}</p>

            {!attendance ? (
              <EmptyState icon={CheckSquare} title="No attendance record for this date" />
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <p className="text-[11px] text-gray-500">Check-in</p>
                    <p className="text-[14px] font-semibold text-gray-900">{formatClockTime(attendance.check_in_time)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500">Check-out</p>
                    <p className="text-[14px] font-semibold text-gray-900">{formatClockTime(attendance.check_out_time)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500">Working time</p>
                    <p className="text-[14px] font-semibold text-gray-900">{formatMinutes(attendance.total_working_minutes)}</p>
                  </div>
                  {isMr && (
                    <div>
                      <p className="text-[11px] text-gray-500">Field visits</p>
                      <p className="text-[14px] font-semibold text-gray-900">
                        {attendance.doctor_visit_count}/{attendance.required_doctor_visits ?? '—'} doctor ·{' '}
                        {attendance.chemist_visit_count}/{attendance.required_chemist_visits ?? '—'} chemist
                      </p>
                    </div>
                  )}
                </div>

                {attendance.remarks && (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
                    {attendance.remarks}
                  </p>
                )}

                {(attendance.check_in_latitude || attendance.check_out_latitude) && (
                  <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-gray-400">
                    <MapPin size={12} />
                    {attendance.check_in_latitude && (
                      <span>In: {Number(attendance.check_in_latitude).toFixed(5)}, {Number(attendance.check_in_longitude).toFixed(5)}</span>
                    )}
                    {attendance.check_out_latitude && (
                      <span>Out: {Number(attendance.check_out_latitude).toFixed(5)}, {Number(attendance.check_out_longitude).toFixed(5)}</span>
                    )}
                  </p>
                )}

                <div className="mt-4">
                  <AttendanceCorrectionForm attendance={attendance} />
                </div>
              </>
            )}
          </Card>

          {isMr && (
            <Card padded={false}>
              <div className="border-b border-gray-100 px-5 py-3.5">
                <h2 className="text-[13.5px] font-semibold text-gray-800">Field activity</h2>
              </div>
              {events.length === 0 ? (
                <EmptyState title="No activity recorded for this day" />
              ) : (
                <ul className="divide-y divide-gray-100">
                  {events.map((e, i) => {
                    const Icon = EVENT_ICON[e.kind]
                    return (
                      <li key={i} className="flex items-center gap-3 px-5 py-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                          <Icon size={14} />
                        </span>
                        <span className="w-16 shrink-0 font-mono text-[12px] text-gray-400">
                          {formatClockTime(e.time)}
                        </span>
                        <span className="text-[13px] text-gray-800">{e.label}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {isMr && (
            <Card>
              <h2 className="mb-2 text-[13px] font-semibold text-gray-800">Field orders today</h2>
              <p className="text-2xl font-bold tabular-nums text-gray-900">{money(orderTotal)}</p>
              <p className="mt-1 text-[11.5px] text-gray-400">Estimated demand, not a company sale.</p>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
