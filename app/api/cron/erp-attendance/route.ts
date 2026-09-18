import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Daily attendance finalization (spec §14, §42), plus leave accrual.
 *
 * Wired to Vercel Cron (see vercel.json) rather than pg_cron — this Supabase
 * project has no pg_cron extension enabled. Vercel signs scheduled requests
 * with `Authorization: Bearer $CRON_SECRET` when that env var is set; the
 * same check also lets an operator trigger this by hand if a run is missed.
 *
 * Marks yesterday's attendance for every active non-admin employee who has
 * no row yet as ABSENT (unless a holiday/leave/week-off applies), and
 * finalizes anyone still PENDING_REVIEW. Never touches today's attendance,
 * and never finalizes payroll — that stays a separate, admin-reviewed step.
 *
 * erp_run_leave_accruals() (e.g. Earned Leave's "+1 every 2 months") also
 * runs from here rather than its own cron entry — it's cheap and self-
 * throttling (a no-op most days, see 20260918000012_leave_policy_rules.sql),
 * and Vercel's Hobby plan caps a project at 2 cron jobs, so piggybacking on
 * this once-a-day job avoids needing a 3rd. A failure in either step is
 * reported independently — one must never mask or block the other.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const admin = createAdminClient()

  const yesterday = () => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
  }
  const date = req.nextUrl.searchParams.get('date') ?? yesterday()

  const { data, error } = await admin.rpc('erp_process_daily_attendance', { p_date: date })
  if (error) console.error('[erp-attendance-cron]', error.message)

  const { data: accrualData, error: accrualError } = await admin.rpc('erp_run_leave_accruals')
  if (accrualError) console.error('[erp-leave-accrual-cron]', accrualError.message)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    result: data,
    leaveAccrual: accrualError ? { error: accrualError.message } : accrualData,
  })
}
