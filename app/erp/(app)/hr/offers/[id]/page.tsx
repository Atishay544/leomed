import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, FileText, Printer, UserPlus } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { getOfferLetter } from '@/lib/erp/data/offers'
import { convertOfferToEmployee } from '@/lib/erp/actions/offers'
import { formatDate, money, OFFER_STATUS_LABELS, OFFER_STATUS_STYLES } from '@/lib/erp/format'
import { ROLE_LABELS } from '@/lib/erp/permissions'
import { ERP_ROLES } from '@/lib/erp/types'
import type { FieldSpec } from '@/components/erp/form/Field'
import MasterFormDialog from '@/components/erp/MasterFormDialog'
import OfferStatusActions from '@/components/erp/hr/OfferStatusActions'
import { Badge, Card, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Offer Letter' }

const ROLE_OPTIONS = ERP_ROLES.map(r => ({ value: r, label: ROLE_LABELS[r] }))

const CATEGORY_LABELS: Record<string, string> = {
  EARNING: 'Earning', DEDUCTION: 'Deduction', VARIABLE: 'Variable / incentive',
}

const CONVERT_FIELDS: FieldSpec[] = [
  { name: 'name',      label: 'Full name', required: true, span: 2 },
  { name: 'email',     label: 'Email (used to sign in)', type: 'email', required: true, span: 2 },
  {
    name: 'password', label: 'Temporary password', type: 'text', required: true, span: 2,
    hint: 'At least 8 characters. Share it securely and ask them to change it.',
  },
  { name: 'role',      label: 'System role', type: 'select', options: ROLE_OPTIONS, required: true },
  { name: 'mr_code',   label: 'MR code', hint: 'Required for medical representatives, e.g. MR001' },
  { name: 'employee_code', label: 'Employee ID' },
  { name: 'phone',     label: 'Phone', type: 'tel' },
  { name: 'territory', label: 'Territory' },
  { name: 'department', label: 'Department' },
]

export default async function OfferLetterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability('offers.manage')
  const { id } = await params

  const offer = await getOfferLetter(id)
  if (!offer) notFound()

  const earning  = offer.components.filter(c => c.category === 'EARNING')
  const deduction = offer.components.filter(c => c.category === 'DEDUCTION')
  const variable  = offer.components.filter(c => c.category === 'VARIABLE')
  const sum = (rows: typeof offer.components, key: 'monthly_amount' | 'annual_amount') =>
    rows.reduce((s, r) => s + Number(r[key]), 0)

  const guaranteedMonthly = sum(earning, 'monthly_amount')
  const guaranteedAnnual  = sum(earning, 'annual_amount')
  const fixedMonthly = guaranteedMonthly + sum(deduction, 'monthly_amount')
  const fixedAnnual  = guaranteedAnnual + sum(deduction, 'annual_amount')
  const targetMonthly = fixedMonthly + sum(variable, 'monthly_amount')
  const targetAnnual  = fixedAnnual + sum(variable, 'annual_amount')

  return (
    <>
      <div className="mb-4">
        <Link href="/erp/hr/offers" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-gray-500 hover:text-gray-800">
          <ArrowLeft size={14} /> Offer Letters
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <FileText size={19} />
                </span>
                <div>
                  <h1 className="font-mono text-lg font-bold text-gray-900">{offer.offer_number}</h1>
                  <p className="mt-0.5 text-[12.5px] text-gray-500">
                    {offer.candidate_name} · {offer.designation} · {formatDate(offer.offer_date)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <a
                    href={`/api/erp/offer-letter/${offer.id}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50"
                  >
                    <Printer size={13} /> Print / Download
                  </a>
                  <Badge className={OFFER_STATUS_STYLES[offer.status]}>{OFFER_STATUS_LABELS[offer.status]}</Badge>
                </div>
                {offer.status !== 'CONVERTED' && (
                  <Link href={`/erp/hr/offers/${offer.id}/edit`}
                        className="text-[12px] font-medium text-emerald-700 hover:underline">
                    Edit offer
                  </Link>
                )}
              </div>
            </div>

            <div className="mt-4">
              <OfferStatusActions id={offer.id} status={offer.status} />
            </div>

            {offer.status === 'CONVERTED' && (
              <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 px-3.5 py-3">
                <p className="text-[12.5px] text-violet-900">
                  Converted to an employee{offer.converted_employee_name ? `: ${offer.converted_employee_name}` : ''}.
                  {' '}<Link href="/erp/users" className="font-medium underline">View staff</Link>
                </p>
              </div>
            )}

            {offer.status === 'ACCEPTED' && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3">
                <p className="mb-2 text-[12.5px] text-emerald-900">
                  Candidate has accepted. Once they&apos;ve actually joined, convert this offer into a staff account.
                </p>
                <MasterFormDialog
                  action={convertOfferToEmployee}
                  fields={CONVERT_FIELDS}
                  title={`Convert ${offer.candidate_name} to an employee`}
                  triggerLabel="Convert to Employee"
                  submitLabel="Create employee account"
                  hiddenFields={{ offer_id: offer.id }}
                  initial={{
                    name: offer.candidate_name,
                    email: offer.candidate_email ?? '',
                    phone: offer.candidate_phone ?? '',
                    role: offer.role,
                    territory: offer.territory ?? '',
                    department: offer.department ?? '',
                  }}
                  trigger={
                    <button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-emerald-800">
                      <UserPlus size={15} /> Convert to Employee
                    </button>
                  }
                />
              </div>
            )}
          </Card>

          <Card padded={false}>
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 className="text-[13px] font-semibold text-gray-800">Compensation Breakup (Annexure I)</h2>
            </div>
            <TableWrap>
              <table className="w-full min-w-[560px]">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>Component</Th>
                    <Th>Type</Th>
                    <Th align="right">Per month</Th>
                    <Th align="right">Per annum</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {offer.components.map(c => (
                    <tr key={c.id}>
                      <Td className="font-medium text-gray-900">{c.component_name}</Td>
                      <Td className="text-gray-500">{CATEGORY_LABELS[c.category]}</Td>
                      <Td align="right" className="tabular-nums">{money(c.monthly_amount)}</Td>
                      <Td align="right" className="tabular-nums">{money(c.annual_amount)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <div className="space-y-1.5 border-t border-gray-100 px-4 py-3 text-[12.5px]">
              <div className="flex justify-between">
                <span className="text-gray-500">Total Guaranteed Compensation</span>
                <span className="font-medium text-gray-900">{money(guaranteedMonthly)}/mo · {money(guaranteedAnnual)}/yr</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total Fixed Compensation</span>
                <span className="font-medium text-gray-900">{money(fixedMonthly)}/mo · {money(fixedAnnual)}/yr</span>
              </div>
              {targetAnnual !== fixedAnnual && (
                <div className="flex justify-between">
                  <span className="font-semibold text-gray-700">Target Total Compensation</span>
                  <span className="text-[13px] font-bold text-gray-900">{money(targetMonthly)}/mo · {money(targetAnnual)}/yr</span>
                </div>
              )}
            </div>
          </Card>

          {offer.remarks && (
            <Card>
              <h2 className="mb-2 text-[13px] font-semibold text-gray-800">Additional Terms</h2>
              <p className="text-[12.5px] leading-relaxed text-gray-700">{offer.remarks}</p>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 text-[13px] font-semibold text-gray-800">Candidate</h2>
            <p className="text-[14px] font-semibold text-gray-900">{offer.candidate_name}</p>
            {offer.candidate_email && <p className="mt-1 text-[12.5px] text-gray-600">{offer.candidate_email}</p>}
            {offer.candidate_phone && <p className="mt-0.5 text-[12.5px] text-gray-600">{offer.candidate_phone}</p>}
            {offer.candidate_address && <p className="mt-2 text-[12.5px] text-gray-500">{offer.candidate_address}</p>}
          </Card>

          <Card>
            <h2 className="mb-3 text-[13px] font-semibold text-gray-800">Role &amp; Placement</h2>
            <dl className="space-y-2 text-[12.5px]">
              <div className="flex justify-between"><dt className="text-gray-500">Designation</dt><dd className="text-gray-900">{offer.designation}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">System role</dt><dd className="text-gray-900">{ROLE_LABELS[offer.role]}</dd></div>
              {offer.department && <div className="flex justify-between"><dt className="text-gray-500">Department</dt><dd className="text-gray-900">{offer.department}</dd></div>}
              {offer.territory && <div className="flex justify-between"><dt className="text-gray-500">Territory / HQ</dt><dd className="text-gray-900">{offer.territory}</dd></div>}
              {offer.reports_to_name && <div className="flex justify-between"><dt className="text-gray-500">Reports to</dt><dd className="text-gray-900">{offer.reports_to_name}</dd></div>}
              <div className="flex justify-between"><dt className="text-gray-500">Offer date</dt><dd className="text-gray-900">{formatDate(offer.offer_date)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Joining date</dt><dd className="text-gray-900">{offer.joining_date ? formatDate(offer.joining_date) : '—'}</dd></div>
            </dl>
          </Card>
        </div>
      </div>
    </>
  )
}
