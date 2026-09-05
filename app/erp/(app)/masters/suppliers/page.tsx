import { Factory } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listSuppliers, PAGE_SIZE } from '@/lib/erp/data/masters'
import { parsePage } from '@/lib/erp/data/query'
import { saveSupplier, setSupplierActive } from '@/lib/erp/actions/masters'
import { can } from '@/lib/erp/permissions'
import { SUPPLIER_FIELDS } from '@/components/erp/master-fields'
import MasterFormDialog from '@/components/erp/MasterFormDialog'
import ToggleActiveButton from '@/components/erp/ToggleActiveButton'
import SearchBar from '@/components/erp/SearchBar'
import Pagination from '@/components/erp/Pagination'
import { Badge, Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Suppliers' }

interface Props {
  searchParams: Promise<{ q?: string; page?: string; inactive?: string }>
}

export default async function SuppliersPage({ searchParams }: Props) {
  // Purchasing information; the field force has no reason to see it.
  const session = await requireCapability('billing.purchase.read')
  const params = await searchParams
  const page = parsePage(params.page)

  const { rows, total, pageCount } = await listSuppliers({
    q: params.q, page, includeInactive: params.inactive === '1',
  })

  const canWrite = can(session.role, 'billing.purchase.write')

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Manufacturers and stockists Leomed buys from. Purchase invoices are recorded against them."
        action={canWrite && (
          <MasterFormDialog
            action={saveSupplier}
            fields={SUPPLIER_FIELDS}
            title="Add supplier"
            triggerLabel="Add supplier"
            submitLabel="Save supplier"
          />
        )}
      />

      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <SearchBar placeholder="Name, code, city, contact…" />
          <p className="text-[12px] text-gray-500">{total} {total === 1 ? 'supplier' : 'suppliers'}</p>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Factory}
            title={params.q ? 'No suppliers match that search' : 'No suppliers yet'}
            description="Add a supplier before recording your first purchase invoice."
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[820px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Code</Th>
                  <Th>Supplier</Th>
                  <Th>Contact</Th>
                  <Th>City / State</Th>
                  <Th>GST</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50/60">
                    <Td className="font-mono text-[11.5px] text-gray-500">{s.supplier_code}</Td>
                    <Td>
                      <span className="font-medium text-gray-900">{s.supplier_name}</span>
                      {!s.active && <Badge className="ml-2 bg-gray-100 text-gray-500 ring-gray-400/20">Inactive</Badge>}
                      {s.payment_terms && <p className="mt-0.5 text-[11.5px] text-gray-400">{s.payment_terms}</p>}
                    </Td>
                    <Td>
                      {s.contact_person ?? '—'}
                      {s.phone && <p className="mt-0.5 text-[11.5px] tabular-nums text-gray-400">{s.phone}</p>}
                    </Td>
                    <Td>{[s.city, s.state].filter(Boolean).join(', ') || '—'}</Td>
                    <Td className="font-mono text-[11.5px]">{s.gst_number ?? '—'}</Td>
                    <Td align="right">
                      {canWrite && (
                        <div className="flex items-center justify-end gap-2">
                          <MasterFormDialog
                            action={saveSupplier}
                            fields={SUPPLIER_FIELDS}
                            title={`Edit ${s.supplier_name}`}
                            submitLabel="Save changes"
                            initial={s as unknown as Record<string, unknown>}
                            trigger={
                              <button type="button" className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50">
                                Edit
                              </button>
                            }
                          />
                          <ToggleActiveButton
                            id={s.id} active={s.active}
                            action={setSupplierActive} noun="supplier"
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
          searchParams={params} basePath="/erp/masters/suppliers"
        />
      </Card>
    </>
  )
}
