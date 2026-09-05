import { ScrollText } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { erpDb, PAGE_SIZE, parsePage, rangeFor, toPage } from '@/lib/erp/data/query'
import { formatDateTime } from '@/lib/erp/format'
import { FilterForm, FilterSelect } from '@/components/erp/FilterForm'
import Pagination from '@/components/erp/Pagination'
import { Badge, Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Audit Log' }

interface AuditRow {
  id: string
  action: string
  table_name: string
  record_id: string | null
  created_at: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  erp_users: { name: string; role: string } | null
}

const AUDITED_TABLES = [
  { value: 'erp_inventory_transactions', label: 'Inventory movements' },
  { value: 'erp_sales_invoices',         label: 'Sales invoices' },
  { value: 'erp_purchase_invoices',      label: 'Purchase invoices' },
  { value: 'erp_products',               label: 'Products' },
  { value: 'erp_users',                  label: 'Staff accounts' },
]

const ACTION_STYLES: Record<string, string> = {
  INSERT: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  UPDATE: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  DELETE: 'bg-red-50 text-red-700 ring-red-600/20',
}

/** A short, readable summary of what a row change actually was. The full
 *  before/after JSON is stored; showing it raw would be unreadable. */
function describe(row: AuditRow): string {
  const data = row.new_data ?? row.old_data
  if (!data) return '—'

  const interesting = [
    'invoice_number', 'order_number', 'product_name', 'name', 'email',
    'transaction_type', 'quantity', 'grand_total', 'role', 'active',
  ]
  const parts = interesting
    .filter(key => data[key] !== undefined && data[key] !== null)
    .slice(0, 4)
    .map(key => `${key.replace(/_/g, ' ')}: ${String(data[key])}`)

  return parts.length ? parts.join(' · ') : `record ${String(row.record_id ?? '').slice(0, 8)}`
}

interface Props {
  searchParams: Promise<{ page?: string; table?: string; action?: string }>
}

export default async function AuditPage({ searchParams }: Props) {
  await requireCapability('users.manage')
  const params = await searchParams
  const page = parsePage(params.page)
  const [from, to] = rangeFor(page)

  const db = await erpDb()
  let query = db
    .from('erp_audit_logs')
    .select('*, erp_users!erp_audit_logs_user_id_fkey(name, role)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (params.table)  query = query.eq('table_name', params.table)
  if (params.action) query = query.eq('action', params.action)

  const { data, count } = await query
  const result = toPage<AuditRow>(data as unknown as AuditRow[] | null, count, page)

  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Who changed what, and when. Written by database triggers, so it records every route into the data — not only the screens."
      />

      <Card padded={false}>
        <FilterForm action="/erp/audit" hasFilters={!!(params.table || params.action)}>
          <FilterSelect name="table" label="Area" defaultValue={params.table}
                        options={AUDITED_TABLES} allLabel="Everything" />
          <FilterSelect name="action" label="Change" defaultValue={params.action}
                        options={[
                          { value: 'INSERT', label: 'Created' },
                          { value: 'UPDATE', label: 'Updated' },
                          { value: 'DELETE', label: 'Deleted' },
                        ]} />
        </FilterForm>

        {result.rows.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="Nothing logged yet"
            description="Inventory movements, invoices, product changes and staff changes are recorded here."
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[820px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>When</Th>
                  <Th>Who</Th>
                  <Th>Change</Th>
                  <Th>Area</Th>
                  <Th>Detail</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.rows.map(row => (
                  <tr key={row.id} className="hover:bg-gray-50/60">
                    <Td className="whitespace-nowrap text-[12.5px]">{formatDateTime(row.created_at)}</Td>
                    <Td>
                      {row.erp_users?.name ?? <span className="text-gray-400">System</span>}
                    </Td>
                    <Td>
                      <Badge className={ACTION_STYLES[row.action] ?? 'bg-gray-100 text-gray-600 ring-gray-500/20'}>
                        {row.action}
                      </Badge>
                    </Td>
                    <Td className="text-[12.5px]">
                      {AUDITED_TABLES.find(t => t.value === row.table_name)?.label ?? row.table_name}
                    </Td>
                    <Td className="max-w-md truncate text-[12px] text-gray-600">{describe(row)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}

        <Pagination
          page={page} pageCount={result.pageCount} total={result.total} pageSize={PAGE_SIZE}
          searchParams={params} basePath="/erp/audit"
        />
      </Card>
    </>
  )
}
