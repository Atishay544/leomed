import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listAreasForMr } from '@/lib/erp/data/geography'
import ChemistVisitForm from '@/components/erp/visits/ChemistVisitForm'

export const metadata = { title: 'New Chemist Visit' }

export default async function NewChemistVisitPage() {
  const session = await requireCapability('visits.create')
  // Scoped to areas this MR is actually assigned to — see the note on
  // listAreasForMr(). A newly-created chemist can only be placed somewhere
  // they cover; existing chemists remain visitable regardless of area.
  const areas = await listAreasForMr(session.id)

  return (
    <>
      <div className="mb-4">
        <Link
          href="/erp/mr/chemist-visits"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft size={14} /> Chemist visits
        </Link>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-gray-900">Record a chemist visit</h1>
      </div>

      <div className="mx-auto max-w-3xl">
        <ChemistVisitForm areas={areas} />
      </div>
    </>
  )
}
