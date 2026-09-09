import { Percent } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import {
  listDefaultIncentiveTiers, listMrIncentiveTiers, getMrIncentiveSetting,
} from '@/lib/erp/data/incentives'
import { listMrs } from '@/lib/erp/data/users'
import {
  saveIncentiveTier, deleteIncentiveTier, saveMrFlatIncentive, clearMrFlatIncentive,
} from '@/lib/erp/actions/incentives'
import { INCENTIVE_TIER_FIELDS, FLAT_INCENTIVE_FIELDS } from '@/components/erp/master-fields'
import { money } from '@/lib/erp/format'
import { FilterForm, FilterSelect } from '@/components/erp/FilterForm'
import MasterFormDialog from '@/components/erp/MasterFormDialog'
import DeleteRowButton from '@/components/erp/DeleteRowButton'
import { Card, CardHeader, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Incentive Rules' }

interface Props {
  searchParams: Promise<{ mr?: string }>
}

/**
 * Configures how erp_incentive_suggestion() turns an MR's secondary sales
 * (submitted field-order invoices for a period) into a suggested incentive
 * on the Incentives & Bonus screen — brackets by default, overridable per
 * MR with either a custom bracket ladder or one flat rate that bypasses
 * brackets entirely. Nothing here writes a payroll item; it only decides
 * what number the Incentives & Bonus screen offers as a starting point.
 */
export default async function IncentiveRulesPage({ searchParams }: Props) {
  await requireCapability('payroll.manage')
  const params = await searchParams

  const [defaultTiers, mrs] = await Promise.all([listDefaultIncentiveTiers(), listMrs()])

  const selectedMr = params.mr || ''
  const [mrTiers, mrFlat] = selectedMr
    ? await Promise.all([listMrIncentiveTiers(selectedMr), getMrIncentiveSetting(selectedMr)])
    : [[], null]

  const bracketLabel = (t: { min_amount: number; max_amount: number | null }) =>
    t.max_amount == null ? `${money(t.min_amount)} and above` : `${money(t.min_amount)} – ${money(t.max_amount)}`

  return (
    <>
      <PageHeader
        title="Incentive Rules"
        description="How an MR's secondary sales (submitted invoices) turns into a suggested incentive — brackets by default, or a per-MR override."
      />

      <div className="max-w-3xl space-y-6">
        <Card padded={false}>
          <CardHeader
            title="Default brackets"
            action={
              <MasterFormDialog
                action={saveIncentiveTier}
                fields={INCENTIVE_TIER_FIELDS}
                title="Add a default bracket"
                triggerLabel="Add bracket"
                submitLabel="Save"
              />
            }
          />
          <p className="border-b border-gray-100 px-5 py-2.5 text-[12px] leading-relaxed text-gray-500">
            Applies to every MR who has neither a flat rate nor their own brackets set below. The
            rate for the whole amount is whichever bracket the total falls into — not slab-wise.
          </p>
          {defaultTiers.length === 0 ? (
            <EmptyState icon={Percent} title="No default brackets set" description="Add one to start suggesting incentives company-wide." />
          ) : (
            <TableWrap>
              <table className="w-full min-w-[440px]">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>Secondary sales</Th>
                    <Th align="right">Incentive %</Th>
                    <Th align="right">Remove</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {defaultTiers.map(t => (
                    <tr key={t.id}>
                      <Td>{bracketLabel(t)}</Td>
                      <Td align="right" className="tabular-nums font-medium">{t.percentage}%</Td>
                      <Td align="right">
                        <DeleteRowButton id={t.id} action={deleteIncentiveTier} confirmText="Remove this bracket?" />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        <Card padded={false}>
          <CardHeader title="Per-MR overrides" />
          <FilterForm action="/erp/payroll/incentive-rules" hasFilters={!!params.mr}>
            <FilterSelect
              name="mr" label="MR" defaultValue={selectedMr}
              options={mrs.map(m => ({ value: m.id, label: m.mr_code ? `${m.mr_code} — ${m.name}` : m.name }))}
              allLabel="Select an MR…"
            />
          </FilterForm>

          {!selectedMr ? (
            <EmptyState icon={Percent} title="Select an MR" description="Choose an MR above to set their flat rate or custom brackets." />
          ) : (
            <div className="space-y-5 p-5">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold text-gray-800">Flat rate</h3>
                  <MasterFormDialog
                    action={saveMrFlatIncentive}
                    fields={FLAT_INCENTIVE_FIELDS}
                    hiddenFields={{ mr_id: selectedMr }}
                    initial={mrFlat?.flat_percentage != null ? { flat_percentage: mrFlat.flat_percentage } : undefined}
                    title="Set a flat incentive rate"
                    triggerLabel={mrFlat?.flat_percentage != null ? 'Change' : 'Set flat rate'}
                    submitLabel="Save"
                  />
                </div>
                {mrFlat?.flat_percentage != null ? (
                  <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
                    <p className="text-[13px] text-emerald-900">
                      Flat <strong>{mrFlat.flat_percentage}%</strong> on all secondary sales — brackets below are ignored while this is set.
                    </p>
                    <DeleteRowButton id={selectedMr} action={clearMrFlatIncentive} confirmText="Clear this MR's flat rate? They'll fall back to their own brackets, or the default ones." />
                  </div>
                ) : (
                  <p className="text-[12.5px] text-gray-500">No flat rate set — this MR uses the brackets below, or the default ones.</p>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold text-gray-800">Custom brackets for this MR</h3>
                  <MasterFormDialog
                    action={saveIncentiveTier}
                    fields={INCENTIVE_TIER_FIELDS}
                    hiddenFields={{ mr_id: selectedMr }}
                    title="Add a bracket for this MR"
                    triggerLabel="Add bracket"
                    submitLabel="Save"
                  />
                </div>
                {mrTiers.length === 0 ? (
                  <p className="text-[12.5px] text-gray-500">No custom brackets — this MR uses the default ones (unless a flat rate is set above).</p>
                ) : (
                  <TableWrap>
                    <table className="w-full min-w-[440px]">
                      <thead className="bg-gray-50">
                        <tr>
                          <Th>Secondary sales</Th>
                          <Th align="right">Incentive %</Th>
                          <Th align="right">Remove</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {mrTiers.map(t => (
                          <tr key={t.id}>
                            <Td>{bracketLabel(t)}</Td>
                            <Td align="right" className="tabular-nums font-medium">{t.percentage}%</Td>
                            <Td align="right">
                              <DeleteRowButton id={t.id} action={deleteIncentiveTier} confirmText="Remove this bracket?" />
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
