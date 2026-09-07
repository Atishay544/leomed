import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Daily attendance finalization (spec §14, §42).
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

  if (error) {
    console.error('[erp-attendance-cron]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, result: data })
}
