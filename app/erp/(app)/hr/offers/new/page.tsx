import { requireCapability } from '@/lib/erp/auth'
import { listPotentialManagers } from '@/lib/erp/data/offers'
import { listLeaveTypes } from '@/lib/erp/data/leave'
import { PageHeader } from '@/components/erp/ui'
import OfferLetterForm from '@/components/erp/hr/OfferLetterForm'

export const metadata = { title: 'New Offer Letter' }

export default async function NewOfferLetterPage() {
  await requireCapability('offers.manage')
  const [managers, leaveTypes] = await Promise.all([
    listPotentialManagers(),
    listLeaveTypes(false),
  ])
  const earnedLeave = leaveTypes.find(t => t.name === 'Earned Leave')
  const elAccrual = earnedLeave?.accrual_days && earnedLeave.accrual_interval_months
    ? { days: earnedLeave.accrual_days, months: earnedLeave.accrual_interval_months }
    : null

  return (
    <>
      <PageHeader title="New Offer Letter" description="Fill in the candidate's details and compensation to generate an offer letter." />
      <div className="max-w-3xl">
        <OfferLetterForm managers={managers} elAccrual={elAccrual} />
      </div>
    </>
  )
}
