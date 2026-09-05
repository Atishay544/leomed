import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import DoctorVisitForm from '@/components/erp/visits/DoctorVisitForm'

export const metadata = { title: 'New Doctor Visit' }

export default async function NewDoctorVisitPage() {
  await requireCapability('visits.create')

  return (
    <>
      <div className="mb-4">
        <Link
          href="/erp/mr/doctor-visits"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft size={14} /> Doctor visits
        </Link>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-gray-900">Record a doctor visit</h1>
      </div>

      <div className="mx-auto max-w-3xl">
        <DoctorVisitForm />
      </div>
    </>
  )
}
