import 'server-only'
import PDFDocument from 'pdfkit'
import { formatDate, money, qty } from './format'
import { gstSplit } from './invoice-math'

/**
 * Sales invoice PDF — the printable bill handed to (or emailed to) a
 * distributor or chemist. Same pdfkit approach as the payslip: one
 * structured page, no headless browser.
 *
 * Deliberately sales-invoice only: doctors are never billed in this ERP —
 * they receive visits and samples, never an invoice (spec's own field-force
 * model). A "sale to a doctor" is not a state this system has.
 */

export interface InvoicePdfCompany {
  name: string
  gstNumber: string | null
  drugLicense: string | null
  address: string | null
}

export interface InvoicePdfParty {
  label: 'Distributor' | 'Chemist (direct sale)'
  name: string
  code?: string | null
  gstNumber: string | null
  drugLicense: string | null
  city: string | null
  state?: string | null
  phone: string | null
}

export interface InvoicePdfItem {
  productName: string
  productCode: string | null
  strength: string | null
  unit: string
  batchNumber: string | null
  expiryDate: string | null
  quantity: number
  freeQuantity: number
  rate: number
  discountPercent: number
  gstRate: number
  lineTotal: number
}

export interface InvoicePdfData {
  invoiceNumber: string
  invoiceDate: string
  isInterstate: boolean
  subtotal: number
  discount: number
  tax: number
  grandTotal: number
  amountPaid: number
  paymentStatus: string
  remarks: string | null
  expiredSaleOverride: boolean
  expiredSaleReason: string | null
  items: InvoicePdfItem[]
  party: InvoicePdfParty
}

export function generateSalesInvoicePdf(data: InvoicePdfData, company: InvoicePdfCompany): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // ─── Header ───────────────────────────────────────────────────────────
    doc.fontSize(17).font('Helvetica-Bold').fillColor('#0f5132').text(company.name.toUpperCase())
    doc.fontSize(8.5).font('Helvetica').fillColor('#555')
    if (company.address) doc.text(company.address)
    const regLine = [
      company.gstNumber && `GSTIN: ${company.gstNumber}`,
      company.drugLicense && `Drug Licence: ${company.drugLicense}`,
    ].filter(Boolean).join('   ·   ')
    if (regLine) doc.text(regLine)

    doc.moveDown(0.5)
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#111').text('TAX INVOICE', { align: 'right' })
    doc.fontSize(9).font('Helvetica').fillColor('#333')
    doc.text(`Invoice No: ${data.invoiceNumber}`, { align: 'right' })
    doc.text(`Date: ${formatDate(data.invoiceDate)}`, { align: 'right' })
    doc.moveDown(0.5)
    doc.strokeColor('#ddd').moveTo(40, doc.y).lineTo(555, doc.y).stroke()
    doc.moveDown(0.5)

    // ─── Bill-to ──────────────────────────────────────────────────────────
    doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#0f5132').text(`Bill To — ${data.party.label}`)
    doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#111').text(data.party.name)
    doc.font('Helvetica').fontSize(8.5).fillColor('#444')
    if (data.party.gstNumber) doc.text(`GSTIN: ${data.party.gstNumber}`)
    if (data.party.drugLicense) doc.text(`Drug Licence: ${data.party.drugLicense}`)
    const place = [data.party.city, data.party.state].filter(Boolean).join(', ')
    if (place) doc.text(place)
    if (data.party.phone) doc.text(`Phone: ${data.party.phone}`)
    doc.moveDown(0.6)

    if (data.expiredSaleOverride) {
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#b91c1c')
        .text('This invoice includes stock sold past its expiry date under written authorisation.')
      if (data.expiredSaleReason) {
        doc.font('Helvetica').fillColor('#7f1d1d').text(data.expiredSaleReason)
      }
      doc.moveDown(0.5)
    }

    // ─── Line items ───────────────────────────────────────────────────────
    const colX = { product: 40, batch: 210, qty: 300, rate: 345, disc: 395, gst: 435, total: 475 }
    const tableTop = doc.y

    doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff')
    doc.rect(40, tableTop, 515, 16).fill('#0f5132')
    doc.fillColor('#fff')
    doc.text('Product', colX.product + 3, tableTop + 4, { width: 165 })
    doc.text('Batch / Exp', colX.batch + 3, tableTop + 4, { width: 85 })
    doc.text('Qty', colX.qty + 3, tableTop + 4, { width: 40, align: 'right' })
    doc.text('Rate', colX.rate + 3, tableTop + 4, { width: 45, align: 'right' })
    doc.text('Disc%', colX.disc + 3, tableTop + 4, { width: 35, align: 'right' })
    doc.text('GST%', colX.gst + 3, tableTop + 4, { width: 35, align: 'right' })
    doc.text('Amount', colX.total + 3, tableTop + 4, { width: 78, align: 'right' })

    let y = tableTop + 16
    doc.font('Helvetica').fontSize(8)
    for (const item of data.items) {
      const rowHeight = 24
      if (y + rowHeight > 780) { doc.addPage(); y = 40 }

      doc.fillColor('#111')
      const productLabel = `${item.productName}${item.strength ? ' ' + item.strength : ''}`
      doc.text(productLabel, colX.product + 3, y, { width: 165 })
      doc.fillColor('#888').fontSize(7).text(item.productCode ?? '', colX.product + 3, y + 10, { width: 165 })

      doc.fillColor('#333').fontSize(8)
      doc.text(item.batchNumber ?? '—', colX.batch + 3, y, { width: 85 })
      if (item.expiryDate) doc.fontSize(7).fillColor('#888').text(`Exp ${formatDate(item.expiryDate)}`, colX.batch + 3, y + 10, { width: 85 })

      doc.fontSize(8).fillColor('#111')
      doc.text(`${qty(item.quantity)} ${item.unit}`, colX.qty + 3, y, { width: 40, align: 'right' })
      if (item.freeQuantity > 0) doc.fontSize(7).fillColor('#0f5132').text(`+${qty(item.freeQuantity)} free`, colX.qty + 3, y + 10, { width: 40, align: 'right' })

      doc.fontSize(8).fillColor('#111')
      doc.text(money(item.rate), colX.rate + 3, y, { width: 45, align: 'right' })
      doc.text(item.discountPercent > 0 ? `${item.discountPercent}%` : '—', colX.disc + 3, y, { width: 35, align: 'right' })
      doc.text(`${item.gstRate}%`, colX.gst + 3, y, { width: 35, align: 'right' })
      doc.font('Helvetica-Bold').text(money(item.lineTotal), colX.total + 3, y, { width: 78, align: 'right' })
      doc.font('Helvetica')

      y += rowHeight
      doc.strokeColor('#eee').moveTo(40, y - 2).lineTo(555, y - 2).stroke()
    }

    doc.y = y + 8

    // ─── Totals ───────────────────────────────────────────────────────────
    const tax = gstSplit(data.tax, data.isInterstate)
    const totalsX = 380
    doc.fontSize(9).font('Helvetica')

    const totalRow = (label: string, value: string, bold = false) => {
      const rowY = doc.y
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10.5 : 9).fillColor('#111')
      doc.text(label, totalsX, rowY, { width: 90 })
      doc.text(value, totalsX + 90, rowY, { width: 85, align: 'right' })
      doc.moveDown(0.35)
    }

    totalRow('Subtotal', money(data.subtotal))
    if (data.discount > 0) totalRow('Discount', `− ${money(data.discount)}`)
    if (data.isInterstate) {
      totalRow('IGST', money(tax.igst))
    } else {
      totalRow('CGST', money(tax.cgst))
      totalRow('SGST', money(tax.sgst))
    }
    doc.strokeColor('#ddd').moveTo(totalsX, doc.y).lineTo(555, doc.y).stroke()
    doc.moveDown(0.3)
    totalRow('Grand Total', money(data.grandTotal), true)
    totalRow('Received', money(data.amountPaid))
    const due = data.grandTotal - data.amountPaid
    if (due > 0) totalRow('Outstanding', money(due))

    doc.moveDown(1)
    doc.fontSize(9).font('Helvetica-Bold').fillColor(due > 0 ? '#b91c1c' : '#0f5132')
    doc.text(`Payment status: ${data.paymentStatus}`, 40)

    if (data.remarks) {
      doc.moveDown(0.5)
      doc.fontSize(8.5).font('Helvetica').fillColor('#555').text(`Remarks: ${data.remarks}`, 40, doc.y, { width: 515 })
    }

    doc.moveDown(1)
    doc.fontSize(7.5).fillColor('#999').text(
      'This is a computer-generated invoice.',
      40, doc.y,
    )

    doc.end()
  })
}
