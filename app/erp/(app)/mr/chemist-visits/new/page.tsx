import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import ChemistVisitForm from '@/components/erp/visits/ChemistVisitForm'

export const metadata = { title: 'New Chemist Visit' }

export default async function NewChemistVisitPage() {
  await requireCapability('visits.create')

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
        <ChemistVisitForm />
      </div>
    </>
  )
}
