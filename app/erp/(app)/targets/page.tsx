import { Target as TargetIcon } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { getTargetProgress } from '@/lib/erp/data/dashboard'
import { listMrs } from '@/lib/erp/data/users'
import { saveTarget } from '@/lib/erp/actions/admin'
import { TARGET_TYPES, type TargetType } from '@/lib/erp/types'
import { formatDate, money, qty, TARGET_TYPE_LABELS } from '@/lib/erp/format'
import type { FieldSpec } from '@/components/erp/form/Field'
import MasterFormDialog from '@/components/erp/MasterFormDialog'
import DeleteTargetButton from '@/components/erp/DeleteTargetButton'
import { Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Targets' }

export default async function TargetsPage() {
  await requireCapability('targets.manage')

  const [rows, mrs] = await Promise.all([getTargetProgress(), listMrs()])

  const fields: FieldSpec[] = [
    {
      name: 'mr_id', label: 'Medical representative', type: 'select', span: 2,
      options: mrs.map(m => ({
        value: m.id, label: m.mr_code ? `${m.mr_code} — ${m.name}` : m.name,
      })),
      hint: 'Leave blank and fill in a territory for a team-wide target instead.',
    },
    { name: 'territory',    label: 'Territory', span: 2 },
    {
      name: 'target_type', label: 'Measure', type: 'select', required: true,
      options: TARGET_TYPES.map(t => ({ value: t, label: TARGET_TYPE_LABELS[t] })),
    },
    { name: 'target_value', label: 'Target', type: 'number', required: true, min: '1', step: '0.01' },
    { name: 'period_start', label: 'From', type: 'date', required: true },
    { name: 'period_end',   label: 'To',   type: 'date', required: true },
  ]

  return (
    <>
      <PageHeader
        title="Targets"
        description="Set what each MR is aiming for. Achievement is counted live from visits, orders and invoices."
        action={
          <MasterFormDialog
            action={saveTarget}
            fields={fields}
            title="Set a target"
            triggerLabel="Add target"
            submitLabel="Save target"
          />
        }
      />

      <Card padded={false}>
        {rows.length === 0 ? (
          <EmptyState
            icon={TargetIcon}
            title="No targets set"
            description="Set a target for an MR or a territory to start tracking progress against it."
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[880px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Assigned to</Th>
                  <Th>Measure</Th>
                  <Th>Period</Th>
                  <Th align="right">Target</Th>
                  <Th align="right">Achieved</Th>
                  <Th>Progress</Th>
                  <Th align="right"></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(row => {
                  const isValue = row.target_type === 'SALES'
                  const target = Number(row.target_value)
                  const achieved = Number(row.achieved ?? 0)
                  const percent = target > 0 ? Math.min(999, Math.round((achieved / target) * 100)) : 0
                  const met = achieved >= target
                  const ended = row.period_end < new Date().toISOString().slice(0, 10)

                  return (
                    <tr key={row.target_id} className="hover:bg-gray-50/60">
                      <Td>
                        {row.mr_name ? (
                          <>
                            <span className="font-medium text-gray-900">{row.mr_name}</span>
                            {row.mr_code && (
                              <p className="mt-0.5 font-mono text-[11px] text-gray-400">{row.mr_code}</p>
                            )}
                          </>
                        ) : (
                          <span className="font-medium text-gray-900">{row.territory ?? 'Team'}</span>
                        )}
                      </Td>
                      <Td>{TARGET_TYPE_LABELS[row.target_type as TargetType] ?? row.target_type}</Td>
                      <Td className="text-[12.5px]">
                        {formatDate(row.period_start)} — {formatDate(row.period_end)}
                        {ended && <p className="mt-0.5 text-[11px] text-gray-400">Ended</p>}
                      </Td>
                      <Td align="right" className="tabular-nums">
                        {isValue ? money(target) : qty(target)}
                      </Td>
                      <Td align="right" className="tabular-nums font-medium text-gray-900">
                        {isValue ? money(achieved) : qty(achieved)}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-200">
                            <div
                              className={`h-full rounded-full ${met ? 'bg-emerald-600' : ended ? 'bg-red-500' : 'bg-amber-500'}`}
                              style={{ width: `${Math.min(100, percent)}%` }}
                            />
                          </div>
                          <span className={`text-[12px] font-semibold tabular-nums ${
                            met ? 'text-emerald-700' : ended ? 'text-red-700' : 'text-gray-600'
                          }`}>
                            {percent}%
                          </span>
                        </div>
                      </Td>
                      <Td align="right">
                        <DeleteTargetButton id={row.target_id} />
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <p className="mt-4 text-[11.5px] leading-relaxed text-gray-400">
        A sales target is measured against Leomed&apos;s invoiced revenue for the period, which no
        single MR owns. Visit, new-doctor and field-order targets are measured against that MR&apos;s
        own recorded work.
      </p>
    </>
  )
}
