import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Year-end leave rollover (Leave Management System requirement §3).
 *
 * Same shape as the daily attendance cron (app/api/cron/erp-attendance):
 * wired to Vercel Cron rather than pg_cron, signed with `Authorization:
 * Bearer $CRON_SECRET` when that env var is set, and safe to trigger by
 * hand at this same URL if the scheduled run is ever missed — the
 * underlying function is idempotent for a given year (see
 * erp_leave_year_end_rollover() in 20260918000009_leave_year_end_rollover.sql).
 *
 * Runs once, on 1 January, for the year that's just starting. `year` can be
 * overridden via query string for a manual catch-up run.
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
  const year = Number(req.nextUrl.searchParams.get('year')) || new Date().getUTCFullYear()

  const { data, error } = await admin.rpc('erp_leave_year_end_rollover', { p_new_year: year })

  if (error) {
    console.error('[erp-leave-rollover-cron]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, result: data })
}
