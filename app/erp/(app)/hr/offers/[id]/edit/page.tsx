import { notFound } from 'next/navigation'
import { requireCapability } from '@/lib/erp/auth'
import { getOfferLetter, listPotentialManagers } from '@/lib/erp/data/offers'
import { listLeaveTypes } from '@/lib/erp/data/leave'
import { PageHeader } from '@/components/erp/ui'
import OfferLetterForm from '@/components/erp/hr/OfferLetterForm'

export const metadata = { title: 'Edit Offer Letter' }

export default async function EditOfferLetterPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability('offers.manage')
  const { id } = await params

  const [offer, managers, leaveTypes] = await Promise.all([
    getOfferLetter(id),
    listPotentialManagers(),
    listLeaveTypes(false),
  ])
  if (!offer) notFound()

  const earnedLeave = leaveTypes.find(t => t.name === 'Earned Leave')
  const elAccrual = earnedLeave?.accrual_days && earnedLeave.accrual_interval_months
    ? { days: earnedLeave.accrual_days, months: earnedLeave.accrual_interval_months }
    : null

  return (
    <>
      <PageHeader title={`Edit Offer — ${offer.candidate_name}`} description={offer.offer_number} />
      <div className="max-w-3xl">
        <OfferLetterForm initial={offer} managers={managers} elAccrual={elAccrual} />
      </div>
    </>
  )
}
