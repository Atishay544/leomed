import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listSuppliers } from '@/lib/erp/data/masters'
import PurchaseInvoiceForm from '@/components/erp/billing/PurchaseInvoiceForm'
import { ButtonLink, EmptyState, Card } from '@/components/erp/ui'
import { Factory } from 'lucide-react'

export const metadata = { title: 'Record Purchase' }

export default async function NewPurchasePage() {
  await requireCapability('billing.purchase.write')

  // Suppliers come from the server so the picker has no extra round trip;
  // the list is small enough to send whole, unlike products.
  const { rows: suppliers } = await listSuppliers({ page: 1 })

  return (
    <>
      <div className="mb-4">
        <Link
          href="/erp/accounting/purchases"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft size={14} /> Purchases
        </Link>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-gray-900">Record a purchase invoice</h1>
        <p className="mt-1 text-[13px] text-gray-500">
          Stock is added to each batch on this invoice when you save.
        </p>
      </div>

      {suppliers.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={Factory}
            title="Add a supplier first"
            description="A purchase invoice has to be recorded against a supplier."
            action={<ButtonLink href="/erp/masters/suppliers">Go to suppliers</ButtonLink>}
          />
        </Card>
      ) : (
        <PurchaseInvoiceForm
          suppliers={suppliers.map(s => ({
            id: s.id, supplier_name: s.supplier_name, supplier_code: s.supplier_code,
          }))}
        />
      )}
    </>
  )
}
