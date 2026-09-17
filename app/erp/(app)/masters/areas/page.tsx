import Link from 'next/link'
import { ArrowLeft, MapPinned } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listActiveMRs, listAreas, listTerritories } from '@/lib/erp/data/geography'
import { saveArea, setAreaActive } from '@/lib/erp/actions/masters'
import type { FieldSpec } from '@/components/erp/form/Field'
import MasterFormDialog from '@/components/erp/MasterFormDialog'
import ToggleActiveButton from '@/components/erp/ToggleActiveButton'
import { FilterForm, FilterSelect } from '@/components/erp/FilterForm'
import { Badge, Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Areas' }

interface Props {
  searchParams: Promise<{ territory?: string }>
}

export default async function AreasPage({ searchParams }: Props) {
  await requireCapability('territories.manage')
  const params = await searchParams

  const [areas, territories, mrs] = await Promise.all([
    listAreas({ territoryId: params.territory, includeInactive: true }),
    listTerritories(true),
    listActiveMRs(),
  ])

  const territoryOptions = territories.map(t => ({ value: t.id, label: t.name }))
  const mrOptions = mrs.map(m => ({ value: m.id, label: m.name }))
  const currentTerritory = territories.find(t => t.id === params.territory)

  const AREA_FIELDS: FieldSpec[] = [
    { name: 'name', label: 'Area name', required: true, span: 2, placeholder: 'e.g. Civil Lines' },
    { name: 'territory_id', label: 'Territory', type: 'select', required: true, options: territoryOptions },
    {
      name: 'mr_id', label: 'Assigned MR', type: 'select',
      options: [{ value: '', label: '— Not assigned —' }, ...mrOptions],
    },
  ]

  return (
    <>
      <PageHeader
        title="Areas"
        description="The localities within each territory — each is assigned to one MR. Split a territory across MRs by pointing different areas to different MRs."
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
            <table className="w-full min-w-[700px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Area</Th>
                  <Th>Territory</Th>
                  <Th>Assigned MR</Th>
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
                    <Td className="text-[12.5px] text-gray-600">{a.mr_name ?? '—'}</Td>
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
