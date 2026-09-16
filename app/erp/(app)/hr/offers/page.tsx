import Link from 'next/link'
import { FileText, Plus } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listOfferLetters, PAGE_SIZE } from '@/lib/erp/data/offers'
import { parsePage } from '@/lib/erp/data/query'
import { formatDate } from '@/lib/erp/format'
import { OFFER_STATUS_LABELS, OFFER_STATUS_STYLES } from '@/lib/erp/format'
import { OFFER_STATUSES } from '@/lib/erp/types'
import { ROLE_LABELS } from '@/lib/erp/permissions'
import SearchBar from '@/components/erp/SearchBar'
import Pagination from '@/components/erp/Pagination'
import { FilterForm, FilterSelect } from '@/components/erp/FilterForm'
import { Badge, Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Offer Letters' }

const STATUS_OPTIONS = OFFER_STATUSES.map(s => ({ value: s, label: OFFER_STATUS_LABELS[s] }))

interface Props {
  searchParams: Promise<{ q?: string; page?: string; status?: string }>
}

export default async function OfferLettersPage({ searchParams }: Props) {
  await requireCapability('offers.manage')
  const params = await searchParams
  const page = parsePage(params.page)

  const { rows, total, pageCount } = await listOfferLetters({
    q: params.q, page, status: params.status,
  })

  return (
    <>
      <PageHeader
        title="Offer Letters"
        description="Generate and track offer letters for candidates. Once someone joins, convert their offer straight into a staff account."
        action={
          <Link
            href="/erp/hr/offers/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-emerald-800"
          >
            <Plus size={15} /> New offer letter
          </Link>
        }
      />

      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <SearchBar placeholder="Candidate, offer no, designation…" />
          <p className="text-[12px] text-gray-500">{total} {total === 1 ? 'offer' : 'offers'}</p>
        </div>
        <FilterForm action="/erp/hr/offers" hasFilters={!!params.status}>
          <FilterSelect name="status" label="Status" defaultValue={params.status}
                        options={STATUS_OPTIONS} allLabel="All statuses" />
        </FilterForm>

        {rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={params.q ? 'No offers match that search' : 'No offer letters yet'}
            description="Create one for a candidate you're extending an offer to."
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Offer No</Th>
                  <Th>Candidate</Th>
                  <Th>Designation</Th>
                  <Th>Reports To</Th>
                  <Th>Offer Date</Th>
                  <Th>Joining Date</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(o => (
                  <tr key={o.id} className="hover:bg-gray-50/60">
                    <Td>
                      <Link href={`/erp/hr/offers/${o.id}`} className="font-mono text-[12px] font-medium text-emerald-700 hover:underline">
                        {o.offer_number}
                      </Link>
                    </Td>
                    <Td>
                      <span className="font-medium text-gray-900">{o.candidate_name}</span>
                      {o.candidate_email && <p className="mt-0.5 text-[11.5px] text-gray-400">{o.candidate_email}</p>}
                    </Td>
                    <Td>
                      {o.designation}
                      <p className="mt-0.5 text-[11.5px] text-gray-400">{ROLE_LABELS[o.role]}</p>
                    </Td>
                    <Td className="text-[12.5px] text-gray-600">{o.reports_to_name ?? '—'}</Td>
                    <Td className="text-[12px] text-gray-500">{formatDate(o.offer_date)}</Td>
                    <Td className="text-[12px] text-gray-500">{o.joining_date ? formatDate(o.joining_date) : '—'}</Td>
                    <Td>
                      <Badge className={OFFER_STATUS_STYLES[o.status]}>{OFFER_STATUS_LABELS[o.status]}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}

        <Pagination
          page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE}
          searchParams={params} basePath="/erp/hr/offers"
        />
      </Card>
    </>
  )
}
