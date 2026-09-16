import { requireCapability } from '@/lib/erp/auth'
import { listPotentialManagers } from '@/lib/erp/data/offers'
import { PageHeader } from '@/components/erp/ui'
import OfferLetterForm from '@/components/erp/hr/OfferLetterForm'

export const metadata = { title: 'New Offer Letter' }

export default async function NewOfferLetterPage() {
  await requireCapability('offers.manage')
  const managers = await listPotentialManagers()

  return (
    <>
      <PageHeader title="New Offer Letter" description="Fill in the candidate's details and compensation to generate an offer letter." />
      <div className="max-w-3xl">
        <OfferLetterForm managers={managers} />
      </div>
    </>
  )
}
