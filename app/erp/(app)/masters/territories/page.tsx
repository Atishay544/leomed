import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listActiveDistributorsForDropdown, listTerritories } from '@/lib/erp/data/geography'
import { saveTerritory, setTerritoryActive } from '@/lib/erp/actions/masters'
import type { FieldSpec } from '@/components/erp/form/Field'
import MasterFormDialog from '@/components/erp/MasterFormDialog'
import ToggleActiveButton from '@/components/erp/ToggleActiveButton'
import { Badge, Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Territories' }

export default async function TerritoriesPage() {
  await requireCapability('territories.manage')

  const [territories, distributors] = await Promise.all([
    listTerritories(true),
    listActiveDistributorsForDropdown(),
  ])

  const distributorOptions = distributors.map(d => ({ value: d.id, label: d.distributor_name }))

  const TERRITORY_FIELDS: FieldSpec[] = [
    { name: 'name', label: 'Territory name', required: true, span: 2, placeholder: 'e.g. West Muzaffarnagar' },
    {
      name: 'distributor_id', label: 'Distributor', type: 'select', span: 2,
      options: [{ value: '', label: '— Not assigned —' }, ...distributorOptions],
      hint: 'One distributor per territory — the same distributor can cover several territories.',
    },
  ]

  return (
    <>
      <PageHeader
        title="Territories"
        description="Group areas under a territory and assign the distributor who covers it. MRs are assigned per-area, not per-territory — see Areas."
        action={
          <MasterFormDialog
            action={saveTerritory}
            fields={TERRITORY_FIELDS}
            title="Add territory"
            triggerLabel="Add territory"
            submitLabel="Save territory"
          />
        }
      />

      <Card padded={false}>
        {territories.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No territories yet"
            description="Add one to start assigning areas, MRs and a distributor to it."
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[700px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Territory</Th>
                  <Th>Distributor</Th>
                  <Th align="right">Areas</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {territories.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50/60">
                    <Td>
                      <span className="font-medium text-gray-900">{t.name}</span>
                      {!t.active && <Badge className="ml-2 bg-gray-100 text-gray-500 ring-gray-400/20">Inactive</Badge>}
                    </Td>
                    <Td className="text-[12.5px] text-gray-600">{t.distributor_name ?? '—'}</Td>
                    <Td align="right" className="tabular-nums">
                      <Link href={`/erp/masters/areas?territory=${t.id}`} className="text-emerald-700 hover:underline">
                        {t.area_count}
                      </Link>
                    </Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-2">
                        <MasterFormDialog
                          action={saveTerritory}
                          fields={TERRITORY_FIELDS}
                          title={`Edit ${t.name}`}
                          submitLabel="Save changes"
                          initial={t as unknown as Record<string, unknown>}
                          trigger={
                            <button type="button" className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50">
                              Edit
                            </button>
                          }
                        />
                        <ToggleActiveButton
                          id={t.id} active={t.active}
                          action={setTerritoryActive} noun="territory"
                        />
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  )
}
