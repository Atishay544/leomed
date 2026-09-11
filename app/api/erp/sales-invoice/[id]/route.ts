import { NextRequest, NextResponse } from 'next/server'
import { getErpSession } from '@/lib/erp/auth'
import { can } from '@/lib/erp/permissions'
import { getSalesInvoice } from '@/lib/erp/data/billing'
import { getErpSettings } from '@/lib/erp/data/settings'
import { getSelectedBankAccount } from '@/lib/erp/data/bank-accounts'
import { generateSalesInvoicePdf, type InvoicePdfData } from '@/lib/erp/invoice-pdf'

/** Streams one sales invoice as a printable PDF bill. Gated by
 *  billing.sales.read — sales invoices are a shared accounting document
 *  (ADMIN/ACCOUNTANT/MANAGER), not scoped to "own" the way an MR's visits are. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getErpSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(session.role, 'billing.sales.read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const invoice = await getSalesInvoice(id) as any // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const distributor = invoice.erp_distributors
  const chemist = invoice.erp_chemists
  const doctor = invoice.erp_doctors

  const data: InvoicePdfData = {
    invoiceNumber: invoice.invoice_number,
    invoiceDate: invoice.invoice_date,
    isInterstate: invoice.is_interstate,
    subtotal: Number(invoice.subtotal),
    discount: Number(invoice.discount),
    tax: Number(invoice.tax),
    grandTotal: Number(invoice.grand_total),
    amountPaid: Number(invoice.amount_paid),
    paymentStatus: invoice.payment_status,
    remarks: invoice.remarks,
    expiredSaleOverride: invoice.expired_sale_override,
    expiredSaleReason: invoice.expired_sale_reason,
    party: chemist
      ? {
          label: 'Chemist (direct sale)',
          name: chemist.chemist_name,
          gstNumber: chemist.gst_number,
          drugLicense: chemist.drug_license_number,
          city: chemist.city,
          phone: chemist.phone,
        }
      : doctor
      ? {
          label: 'Doctor (direct sale)',
          name: doctor.doctor_name,
          gstNumber: null,
          drugLicense: null,
          city: doctor.city,
          phone: doctor.phone,
        }
      : {
          label: 'Distributor',
          name: distributor?.distributor_name ?? 'Unknown',
          code: distributor?.distributor_code,
          gstNumber: distributor?.gst_number,
          drugLicense: distributor?.drug_license_number,
          city: distributor?.city,
          state: distributor?.state,
          phone: distributor?.phone,
        },
    items: (invoice.erp_sales_invoice_items ?? []).map((item: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      productName: item.erp_products?.product_name ?? 'Unknown product',
      productCode: item.erp_products?.product_code ?? null,
      strength: item.erp_products?.strength ?? null,
      unit: item.erp_products?.unit ?? '',
      hsnCode: item.erp_products?.hsn_code ?? null,
      batchNumber: item.erp_product_batches?.batch_number ?? null,
      expiryDate: item.erp_product_batches?.expiry_date ?? null,
      mrp: item.erp_product_batches?.mrp != null ? Number(item.erp_product_batches.mrp) : null,
      quantity: Number(item.quantity),
      freeQuantity: Number(item.free_quantity),
      rate: Number(item.sale_rate),
      discountPercent: Number(item.discount_percent),
      gstRate: Number(item.gst_rate),
      lineTotal: Number(item.line_total),
    })),
    bankAccount: null,
  }

  const settings = await getErpSettings()
  const bankAccount = await getSelectedBankAccount(settings.selected_bank_account_id)
  if (bankAccount) {
    data.bankAccount = {
      bankName: bankAccount.bank_name,
      accountHolderName: bankAccount.account_holder_name,
      accountNumber: bankAccount.account_number,
      ifscCode: bankAccount.ifsc_code,
      branch: bankAccount.branch,
      upiId: bankAccount.upi_id,
    }
  }

  const pdf = await generateSalesInvoicePdf(data, {
    name: settings.company_name,
    gstNumber: settings.company_gst_number,
    drugLicense: settings.company_drug_license,
    address: settings.company_address,
    phone: settings.company_phone,
    email: settings.company_email,
    logoUrl: settings.company_logo_url,
  })

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="invoice-${invoice.invoice_number.replace(/\//g, '-')}.pdf"`,
    },
  })
}
