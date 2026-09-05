import Link from 'next/link'
import { ArrowLeft, Truck } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listDistributors } from '@/lib/erp/data/masters'
import { getErpSettings } from '@/lib/erp/data/settings'
import SalesInvoiceForm from '@/components/erp/billing/SalesInvoiceForm'
import { ButtonLink, Card, EmptyState, ErrorState } from '@/components/erp/ui'

export const metadata = { title: 'New Sales Invoice' }

export default async function NewSalesInvoicePage() {
  const session = await requireCapability('billing.sales.write')

  const [{ rows: distributors }, settings] = await Promise.all([
    listDistributors({ page: 1 }),
    getErpSettings(),
  ])

  return (
    <>
      <div className="mb-4">
        <Link
          href="/erp/accounting/sales"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft size={14} /> Sales
        </Link>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-gray-900">Raise a sales invoice</h1>
        <p className="mt-1 text-[13px] text-gray-500">
          Stock is deducted from each batch sold when you save.
        </p>
      </div>

      {settings.allow_expired_sale && (
        <div className="mb-4">
          <ErrorState
            title="Expired stock may be sold with authorisation"
            description="The business-level block has been lifted in Settings. Selling an expired batch still
                         needs an administrator, a written reason, and is recorded against the invoice and
                         in the audit log."
          />
        </div>
      )}

      {distributors.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={Truck}
            title="Add a distributor first"
            description="A sales invoice has to be raised against a distributor."
            action={<ButtonLink href="/erp/masters/distributors">Go to distributors</ButtonLink>}
          />
        </Card>
      ) : (
        <SalesInvoiceForm
          distributors={distributors.map(d => ({
            id: d.id, distributor_name: d.distributor_name, distributor_code: d.distributor_code,
          }))}
          isAdmin={session.role === 'ADMIN'}
          allowExpiredSale={settings.allow_expired_sale}
        />
      )}
    </>
  )
}
