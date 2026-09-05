import { ShieldAlert } from 'lucide-react'
import { requireErpUser } from '@/lib/erp/auth'
import { homeRouteFor, ROLE_LABELS } from '@/lib/erp/permissions'
import { ButtonLink, Card } from '@/components/erp/ui'

export const metadata = { title: 'Access denied' }

export default async function DeniedPage() {
  const session = await requireErpUser()

  return (
    <div className="mx-auto max-w-md py-10">
      <Card className="text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <ShieldAlert size={22} />
        </span>
        <h1 className="text-lg font-bold text-gray-900">You don&apos;t have access to that page</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-gray-600">
          Your account is signed in as <strong>{ROLE_LABELS[session.role]}</strong>, which
          doesn&apos;t include this area. If you need it, ask an administrator to update your role.
        </p>
        <div className="mt-5">
          <ButtonLink href={homeRouteFor(session.role)}>Back to my dashboard</ButtonLink>
        </div>
      </Card>
    </div>
  )
}
