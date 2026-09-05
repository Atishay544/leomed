import { Store } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listChemists, PAGE_SIZE } from '@/lib/erp/data/masters'
import { getErpSettings, withinEditWindow } from '@/lib/erp/data/settings'
import { parsePage } from '@/lib/erp/data/query'
import { saveChemist, setChemistActive } from '@/lib/erp/actions/masters'
import { CHEMIST_FIELDS } from '@/components/erp/master-fields'
import MasterFormDialog from '@/components/erp/MasterFormDialog'
import ToggleActiveButton from '@/components/erp/ToggleActiveButton'
import SearchBar from '@/components/erp/SearchBar'
import Pagination from '@/components/erp/Pagination'
import { Badge, Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Chemists' }

interface Props {
  searchParams: Promise<{ q?: string; page?: string; inactive?: string }>
}

export default async function ChemistsPage({ searchParams }: Props) {
  const session = await requireCapability('masters.read')
  const params = await searchParams
  const page = parsePage(params.page)

  const [{ rows, total, pageCount }, settings] = await Promise.all([
    listChemists({ q: params.q, page, includeInactive: params.inactive === '1' }),
    getErpSettings(),
  ])

  const isAdmin = session.role === 'ADMIN'
  const canAdd = session.role === 'ADMIN' || session.role === 'MR'

  return (
    <>
      <PageHeader
        title="Chemists"
        description="Medical stores and pharmacies. Shared master — multiple MRs may visit the same store."
        action={canAdd && (
          <MasterFormDialog
            action={saveChemist}
            fields={CHEMIST_FIELDS}
            title="Add chemist"
            triggerLabel="Add chemist"
            submitLabel="Save chemist"
          />
        )}
      />

      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <SearchBar placeholder="Store name, owner, phone, area…" />
          <p className="text-[12px] text-gray-500">{total} {total === 1 ? 'chemist' : 'chemists'}</p>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Store}
            title={params.q ? 'No chemists match that search' : 'No chemists yet'}
            description={
              params.q
                ? 'Try part of the store name, the owner’s name, or a phone number.'
                : 'Chemists are added here, or automatically when an MR records a visit to a new store.'
            }
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[880px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Code</Th>
                  <Th>Store</Th>
                  <Th>Owner</Th>
                  <Th>Area / City</Th>
                  <Th>Phone</Th>
                  <Th>GST</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(chemist => {
                  const canEdit = isAdmin || (
                    chemist.created_by === session.id &&
                    withinEditWindow(chemist.created_at, settings.mr_edit_window_hours)
                  )
                  return (
                    <tr key={chemist.id} className="hover:bg-gray-50/60">
                      <Td className="font-mono text-[11.5px] text-gray-500">{chemist.chemist_code}</Td>
                      <Td>
                        <span className="font-medium text-gray-900">{chemist.chemist_name}</span>
                        {!chemist.active && <Badge className="ml-2 bg-gray-100 text-gray-500 ring-gray-400/20">Inactive</Badge>}
                        {chemist.created_from_visit_id && (
                          <Badge className="ml-2 bg-blue-50 text-blue-700 ring-blue-600/20">From visit</Badge>
                        )}
                      </Td>
                      <Td>{chemist.owner_name ?? '—'}</Td>
                      <Td>
                        {[chemist.area, chemist.city].filter(Boolean).join(', ') || '—'}
                        {chemist.territory && (
                          <p className="mt-0.5 text-[11.5px] text-gray-400">{chemist.territory}</p>
                        )}
                      </Td>
                      <Td className="tabular-nums">{chemist.phone ?? '—'}</Td>
                      <Td className="font-mono text-[11.5px]">{chemist.gst_number ?? '—'}</Td>
                      <Td align="right">
                        <div className="flex items-center justify-end gap-2">
                          {canEdit && (
                            <MasterFormDialog
                              action={saveChemist}
                              fields={CHEMIST_FIELDS}
                              title={`Edit ${chemist.chemist_name}`}
                              submitLabel="Save changes"
                              initial={chemist as unknown as Record<string, unknown>}
                              trigger={
                                <button type="button" className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50">
                                  Edit
                                </button>
                              }
                            />
                          )}
                          {isAdmin && (
                            <ToggleActiveButton
                              id={chemist.id}
                              active={chemist.active}
                              action={setChemistActive}
                              noun="chemist"
                            />
                          )}
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableWrap>
        )}

        <Pagination
          page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE}
          searchParams={params} basePath="/erp/masters/chemists"
        />
      </Card>
    </>
  )
}
