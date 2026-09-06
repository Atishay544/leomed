'use client'

import { useState, useTransition } from 'react'
import { Loader2, LogIn, LogOut, MapPin } from 'lucide-react'
import { checkIn, checkOut } from '@/lib/erp/actions/attendance'
import {
  ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_STYLES, formatClockTime, formatMinutes,
} from '@/lib/erp/format'
import { Badge } from '@/components/erp/ui'
import type { ErpAttendance } from '@/lib/erp/types'

/**
 * The check-in/check-out screen every non-admin employee uses. GPS is
 * captured on a best-effort basis — a denied or unavailable location must
 * never block checking in or out (spec §6), so failures are swallowed and
 * the request still goes through with null coordinates.
 */

function captureLocation(): Promise<{ latitude?: number; longitude?: number; accuracy?: number }> {
  return new Promise(resolve => {
    if (!('geolocation' in navigator)) return resolve({})
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    )
  })
}

export default function AttendanceWidget({
  initial,
  compact = false,
}: {
  initial: ErpAttendance | null
  compact?: boolean
}) {
  const [attendance, setAttendance] = useState(initial)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function doCheckIn() {
    setError(null)
    startTransition(async () => {
      const gps = await captureLocation()
      const result = await checkIn(gps)
      if (result.ok) {
        setAttendance(prev => ({
          ...(prev ?? {} as ErpAttendance),
          check_in_time: (result.data?.check_in_time as string) ?? new Date().toISOString(),
          check_out_time: null,
          attendance_status: 'PENDING_REVIEW',
        }))
      } else {
        setError(result.error ?? 'Could not check in.')
      }
    })
  }

  function doCheckOut() {
    setError(null)
    startTransition(async () => {
      const gps = await captureLocation()
      const result = await checkOut(gps)
      if (result.ok && result.data) {
        setAttendance(result.data as unknown as ErpAttendance)
      } else {
        setError(result.error ?? 'Could not check out.')
      }
    })
  }

  const checkedIn = !!attendance?.check_in_time
  const checkedOut = !!attendance?.check_out_time

  return (
    <div className={compact
      ? 'rounded-xl border border-gray-200 bg-white p-4 shadow-sm'
      : 'mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm text-center'}
    >
      {!compact && (
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Today</p>
      )}

      {error && (
        <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">
          {error}
        </div>
      )}

      {!checkedIn ? (
        <div className={compact ? 'flex items-center justify-between gap-3' : ''}>
          <div className={compact ? '' : 'mb-4'}>
            <p className="text-[13px] font-medium text-gray-500">Status</p>
            <p className="text-[15px] font-bold text-gray-900">Not checked in</p>
          </div>
          <button
            type="button" onClick={doCheckIn} disabled={pending}
            className={`flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-3
                       text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-emerald-800
                       disabled:cursor-not-allowed disabled:opacity-60 ${compact ? '' : 'w-full'}`}
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            {pending ? 'Checking in…' : 'Check in'}
          </button>
        </div>
      ) : !checkedOut ? (
        <div className={compact ? 'flex items-center justify-between gap-3' : ''}>
          <div className={compact ? '' : 'mb-4'}>
            <p className="text-[13px] font-medium text-emerald-600">Checked in</p>
            <p className="text-[20px] font-bold tabular-nums text-gray-900">
              {formatClockTime(attendance.check_in_time)}
            </p>
          </div>
          <button
            type="button" onClick={doCheckOut} disabled={pending}
            className={`flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-5 py-3
                       text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-black
                       disabled:cursor-not-allowed disabled:opacity-60 ${compact ? '' : 'w-full'}`}
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
            {pending ? 'Checking out…' : 'Check out'}
          </button>
        </div>
      ) : (
        <div className={compact ? 'flex items-center justify-between gap-4' : 'space-y-2'}>
          <div className={compact ? 'flex gap-4' : 'grid grid-cols-2 gap-3'}>
            <div>
              <p className="text-[11px] text-gray-500">Check-in</p>
              <p className="text-[14px] font-semibold tabular-nums text-gray-900">
                {formatClockTime(attendance.check_in_time)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-gray-500">Check-out</p>
              <p className="text-[14px] font-semibold tabular-nums text-gray-900">
                {formatClockTime(attendance.check_out_time)}
              </p>
            </div>
            {!compact && (
              <div>
                <p className="text-[11px] text-gray-500">Working time</p>
                <p className="text-[14px] font-semibold tabular-nums text-gray-900">
                  {formatMinutes(attendance.total_working_minutes)}
                </p>
              </div>
            )}
          </div>
          <Badge className={ATTENDANCE_STATUS_STYLES[attendance.attendance_status]}>
            {ATTENDANCE_STATUS_LABELS[attendance.attendance_status]}
          </Badge>
        </div>
      )}

      {!compact && (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
          <MapPin size={12} /> Your location is captured for attendance verification
        </p>
      )}
    </div>
  )
}
