import Link from 'next/link'
import {
  CalendarClock, ClipboardList, Stethoscope, Store, UserPlus, IndianRupee, ArrowRight,
} from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { getMrDayStats, listFollowups } from '@/lib/erp/data/visits'
import { formatDate, isoDate, money } from '@/lib/erp/format'
import { Badge, Card, EmptyState, StatCard } from '@/components/erp/ui'
import { FOLLOWUP_PRIORITY_STYLES } from '@/lib/erp/format'

export const metadata = { title: 'My Day' }

/**
 * The MR home screen. Deliberately narrow: today's numbers, the four things an
 * MR does, and what's overdue. No inventory, no invoices, no margins — an MR
 * between appointments needs a launchpad, not a control panel (spec §31).
 */
export default async function MrHomePage() {
  const session = await requireCapability('visits.read.own')
  const today = isoDate()

  const [stats, followups] = await Promise.all([
    getMrDayStats(session.id, today),
    listFollowups({ mrId: session.id, status: 'PENDING', upTo: today, page: 1 }),
  ])

  const firstName = session.name.split(/\s+/)[0]

  return (
    <>
      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
          Good day, {firstName}
        </h1>
        <p className="mt-1 text-[13px] text-gray-500">
          {formatDate(today)}
          {session.mrCode && <> · {session.mrCode}</>}
          {session.territory && <> · {session.territory}</>}
        </p>
      </div>

      {/* Quick actions come first: the most common reason to open this app is
          to record a visit that just happened. */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <Link
          href="/erp/mr/doctor-visits/new"
          className="flex items-center gap-3 rounded-xl bg-emerald-700 px-4 py-4 text-white
                     shadow-sm transition hover:bg-emerald-800"
        >
          <Stethoscope size={20} className="shrink-0" />
          <span className="text-[13.5px] font-semibold leading-tight">Doctor<br />visit</span>
        </Link>
        <Link
          href="/erp/mr/chemist-visits/new"
          className="flex items-center gap-3 rounded-xl bg-teal-700 px-4 py-4 text-white
                     shadow-sm transition hover:bg-teal-800"
        >
          <Store size={20} className="shrink-0" />
          <span className="text-[13.5px] font-semibold leading-tight">Chemist<br />visit</span>
        </Link>
      </div>

      <h2 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-gray-500">
        Today so far
      </h2>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Doctor visits"  value={stats.doctorVisits}  icon={Stethoscope}
                  href="/erp/mr/doctor-visits" />
        <StatCard label="Chemist visits" value={stats.chemistVisits} icon={Store}
                  href="/erp/mr/chemist-visits" />
        <StatCard label="New doctors"    value={stats.newDoctors}    icon={UserPlus}
                  tone={stats.newDoctors > 0 ? 'positive' : 'default'} />
        <StatCard label="Field orders"   value={stats.fieldOrders}   icon={ClipboardList}
                  href="/erp/mr/orders" />
        <StatCard label="Order value"    value={money(stats.orderValue)} icon={IndianRupee}
                  hint="Estimated demand" />
      </div>

      <Card padded={false}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <h2 className="text-[13.5px] font-semibold text-gray-800">Follow-ups due</h2>
            {stats.followupsOverdue > 0 && (
              <Badge className="bg-red-50 text-red-700 ring-red-600/20">
                {stats.followupsOverdue} overdue
              </Badge>
            )}
          </div>
          <Link href="/erp/mr/followups" className="flex items-center gap-1 text-[12.5px] font-medium text-emerald-700 hover:underline">
            View all <ArrowRight size={13} />
          </Link>
        </div>

        {followups.rows.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Nothing due today"
            description="Follow-ups you schedule during a visit will appear here on the day they're due."
          />
        ) : (
          <ul className="divide-y divide-gray-100">
            {followups.rows.slice(0, 6).map(f => {
              const name = f.erp_doctors?.doctor_name ?? f.erp_chemists?.chemist_name ?? 'Unknown'
              const phone = f.erp_doctors?.phone ?? f.erp_chemists?.phone
              const overdue = f.followup_date < today
              return (
                <li key={f.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-gray-900">{name}</p>
                    {f.description && (
                      <p className="mt-0.5 truncate text-[12px] text-gray-500">{f.description}</p>
                    )}
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-gray-400">
                      <span className={overdue ? 'font-semibold text-red-600' : ''}>
                        {overdue ? 'Overdue · ' : ''}{formatDate(f.followup_date)}
                      </span>
                      <Badge className={FOLLOWUP_PRIORITY_STYLES[f.priority]}>{f.priority}</Badge>
                    </p>
                  </div>
                  {phone && (
                    <a
                      href={`tel:${phone}`}
                      className="shrink-0 rounded-lg border border-gray-300 px-2.5 py-1.5 text-[12px]
                                 font-medium text-gray-700 transition hover:bg-gray-50"
                    >
                      Call
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </>
  )
}
