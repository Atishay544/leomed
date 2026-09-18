import Link from 'next/link'
import { ArrowLeft, MapPinned } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import {
  listActiveDistributorsForDropdown, listActiveMRs, listAllMRs, listAreas, listTerritories,
} from '@/lib/erp/data/geography'
import { reassignMr, saveArea, setAreaActive } from '@/lib/erp/actions/masters'
import type { FieldSpec } from '@/components/erp/form/Field'
import MasterFormDialog from '@/components/erp/MasterFormDialog'
import ToggleActiveButton from '@/components/erp/ToggleActiveButton'
import ReassignPanel from '@/components/erp/ReassignPanel'
import { FilterForm, FilterSelect } from '@/components/erp/FilterForm'
import { Badge, Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Areas' }

interface Props {
  searchParams: Promise<{ territory?: string }>
}

export default async function AreasPage({ searchParams }: Props) {
  await requireCapability('territories.manage')
  const params = await searchParams

  const [areas, territories, mrs, allMrs, distributors] = await Promise.all([
    listAreas({ territoryId: params.territory, includeInactive: true }),
    listTerritories(true),
    listActiveMRs(),
    listAllMRs(),
    listActiveDistributorsForDropdown(),
  ])

  const territoryOptions = territories.map(t => ({ value: t.id, label: t.name }))
  const mrOptions = mrs.map(m => ({ value: m.id, label: m.name }))
  const distributorOptions = distributors.map(d => ({ value: d.id, label: d.distributor_name }))
  const currentTerritory = territories.find(t => t.id === params.territory)

  const AREA_FIELDS: FieldSpec[] = [
    { name: 'name', label: 'Area name', required: true, span: 2, placeholder: 'e.g. Civil Lines' },
    { name: 'territory_id', label: 'Territory', type: 'select', required: true, options: territoryOptions },
    {
      name: 'mr_id', label: 'MR (overrides the territory default)', type: 'select',
      options: [{ value: '', label: '— Follow territory default —' }, ...mrOptions],
    },
    {
      name: 'distributor_id', label: 'Distributor (overrides the territory default)', type: 'select', span: 2,
      options: [{ value: '', label: '— Follow territory default —' }, ...distributorOptions],
    },
  ]

  const reassignMrOptions = allMrs.map(m => ({ id: m.id, name: m.active ? m.name : `${m.name} (inactive)` }))

  return (
    <>
      <PageHeader
        title="Areas"
        description="The localities within each territory. Leave MR/Distributor unset to follow the territory's default, or pick one to override it just for this area."
        action={
          <MasterFormDialog
            action={saveArea}
            fields={AREA_FIELDS}
            title="Add area"
            triggerLabel="Add area"
            submitLabel="Save area"
            initial={params.territory ? { territory_id: params.territory } : undefined}
          />
        }
      />

      {allMrs.length >= 2 && (
        <ReassignPanel
          title="Reassign an MR"
          description="Moves every territory and area currently assigned to one MR over to another — e.g. when an MR leaves the company."
          fromLabel="Currently assigned to" toLabel="Reassign to"
          options={reassignMrOptions}
          action={reassignMr}
          fromKey="from_mr_id" toKey="to_mr_id"
          followupOption
        />
      )}

      {currentTerritory && (
        <div className="mb-4">
          <Link href="/erp/masters/areas" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-gray-500 hover:text-gray-800">
            <ArrowLeft size={14} /> All areas
          </Link>
          <p className="mt-1 text-[13px] text-gray-600">Showing areas in <span className="font-semibold">{currentTerritory.name}</span></p>
        </div>
      )}

      <Card padded={false}>
        {!currentTerritory && (
          <FilterForm action="/erp/masters/areas" hasFilters={!!params.territory}>
            <FilterSelect name="territory" label="Territory" defaultValue={params.territory}
                          options={territoryOptions} allLabel="All territories" />
          </FilterForm>
        )}

        {areas.length === 0 ? (
          <EmptyState
            icon={MapPinned}
            title="No areas yet"
            description="Add one and assign an MR to it."
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[820px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Area</Th>
                  <Th>Territory</Th>
                  <Th>MR (in effect)</Th>
                  <Th>Distributor (in effect)</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {areas.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50/60">
                    <Td>
                      <span className="font-medium text-gray-900">{a.name}</span>
                      {!a.active && <Badge className="ml-2 bg-gray-100 text-gray-500 ring-gray-400/20">Inactive</Badge>}
                    </Td>
                    <Td className="text-[12.5px] text-gray-600">{a.territory_name}</Td>
                    <Td className="text-[12.5px] text-gray-600">
                      {a.effective_mr_name ?? '—'}
                      {!a.mr_id && a.effective_mr_name && <span className="ml-1 text-gray-400">(territory default)</span>}
                    </Td>
                    <Td className="text-[12.5px] text-gray-600">
                      {a.effective_distributor_name ?? '—'}
                      {!a.distributor_id && a.effective_distributor_name && <span className="ml-1 text-gray-400">(territory default)</span>}
                    </Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-2">
                        <MasterFormDialog
                          action={saveArea}
                          fields={AREA_FIELDS}
                          title={`Edit ${a.name}`}
                          submitLabel="Save changes"
                          initial={a as unknown as Record<string, unknown>}
                          trigger={
                            <button type="button" className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50">
                              Edit
                            </button>
                          }
                        />
                        <ToggleActiveButton
                          id={a.id} active={a.active}
                          action={setAreaActive} noun="area"
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
