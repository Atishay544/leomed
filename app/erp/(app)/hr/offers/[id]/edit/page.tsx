import { notFound } from 'next/navigation'
import { requireCapability } from '@/lib/erp/auth'
import { getOfferLetter, listPotentialManagers } from '@/lib/erp/data/offers'
import { PageHeader } from '@/components/erp/ui'
import OfferLetterForm from '@/components/erp/hr/OfferLetterForm'

export const metadata = { title: 'Edit Offer Letter' }

export default async function EditOfferLetterPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability('offers.manage')
  const { id } = await params

  const [offer, managers] = await Promise.all([
    getOfferLetter(id),
    listPotentialManagers(),
  ])
  if (!offer) notFound()

  return (
    <>
      <PageHeader title={`Edit Offer — ${offer.candidate_name}`} description={offer.offer_number} />
      <div className="max-w-3xl">
        <OfferLetterForm initial={offer} managers={managers} />
      </div>
    </>
  )
}
