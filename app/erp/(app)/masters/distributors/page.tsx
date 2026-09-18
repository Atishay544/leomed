import { Truck } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listDistributors, PAGE_SIZE } from '@/lib/erp/data/masters'
import { listAreasForMr } from '@/lib/erp/data/geography'
import { parsePage } from '@/lib/erp/data/query'
import { saveDistributor, setDistributorActive } from '@/lib/erp/actions/masters'
import { can } from '@/lib/erp/permissions'
import { DISTRIBUTOR_FIELDS } from '@/components/erp/master-fields'
import MasterFormDialog from '@/components/erp/MasterFormDialog'
import ToggleActiveButton from '@/components/erp/ToggleActiveButton'
import SearchBar from '@/components/erp/SearchBar'
import Pagination from '@/components/erp/Pagination'
import { money } from '@/lib/erp/format'
import { Badge, Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Distributors' }

interface Props {
  searchParams: Promise<{ q?: string; page?: string; inactive?: string }>
}

export default async function DistributorsPage({ searchParams }: Props) {
  const session = await requireCapability('masters.read')
  const params = await searchParams
  const page = parsePage(params.page)
  const isMr = session.role === 'MR'

  // An MR sees only the distributor(s) effectively covering their own
  // working areas — same "effective" resolution the Areas page shows
  // (own override, else the territory's default), just reduced to ids.
  const myDistributorIds = isMr
    ? [...new Set(
        (await listAreasForMr(session.id))
          .map(a => a.effective_distributor_id)
          .filter((id): id is string => !!id),
      )]
    : undefined

  const { rows, total, pageCount } = await listDistributors({
    q: params.q, page, includeInactive: params.inactive === '1', distributorIds: myDistributorIds,
  })

  const canWrite = can(session.role, 'masters.write')

  return (
    <>
      <PageHeader
        title="Distributors"
        description={
          isMr
            ? 'The distributor(s) covering your own working areas.'
            : 'Leomed sells to these partners. Sales invoices and stock movements are raised against them.'
        }
        action={canWrite && (
          <MasterFormDialog
            action={saveDistributor}
            fields={DISTRIBUTOR_FIELDS}
            title="Add distributor"
            triggerLabel="Add distributor"
            submitLabel="Save distributor"
          />
        )}
      />

      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <SearchBar placeholder="Name, code, city, territory…" />
          <p className="text-[12px] text-gray-500">{total} {total === 1 ? 'distributor' : 'distributors'}</p>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Truck}
            title={params.q ? 'No distributors match that search' : 'No distributors yet'}
            description={
              isMr
                ? "No distributor is set for your working areas yet — ask your admin/HR to assign one."
                : 'Add the partners you invoice, so sales can be recorded against them.'
            }
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[880px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Code</Th>
                  <Th>Distributor</Th>
                  <Th>Contact</Th>
                  <Th>City / Territory</Th>
                  <Th>GST</Th>
                  <Th align="right">Credit limit</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50/60">
                    <Td className="font-mono text-[11.5px] text-gray-500">{d.distributor_code}</Td>
                    <Td>
                      <span className="font-medium text-gray-900">{d.distributor_name}</span>
                      {!d.active && <Badge className="ml-2 bg-gray-100 text-gray-500 ring-gray-400/20">Inactive</Badge>}
                      {d.payment_terms && <p className="mt-0.5 text-[11.5px] text-gray-400">{d.payment_terms}</p>}
                    </Td>
                    <Td>
                      {d.contact_person ?? '—'}
                      {d.phone && <p className="mt-0.5 text-[11.5px] tabular-nums text-gray-400">{d.phone}</p>}
                    </Td>
                    <Td>{[d.city, d.territory].filter(Boolean).join(' · ') || '—'}</Td>
                    <Td className="font-mono text-[11.5px]">{d.gst_number ?? '—'}</Td>
                    <Td align="right" className="tabular-nums">
                      {d.credit_limit != null ? money(d.credit_limit) : '—'}
                    </Td>
                    <Td align="right">
                      {canWrite && (
                        <div className="flex items-center justify-end gap-2">
                          <MasterFormDialog
                            action={saveDistributor}
                            fields={DISTRIBUTOR_FIELDS}
                            title={`Edit ${d.distributor_name}`}
                            submitLabel="Save changes"
                            initial={d as unknown as Record<string, unknown>}
                            trigger={
                              <button type="button" className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50">
                                Edit
                              </button>
                            }
                          />
                          <ToggleActiveButton
                            id={d.id} active={d.active}
                            action={setDistributorActive} noun="distributor"
                          />
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}

        <Pagination
          page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE}
          searchParams={params} basePath="/erp/masters/distributors"
        />
      </Card>
    </>
  )
}
