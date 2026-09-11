import 'server-only'
import PDFDocument from 'pdfkit'
import { amountInWords, formatDate, pdfMoney, qty } from './format'
import { gstSplit } from './invoice-math'

/**
 * Sales invoice PDF — the printable bill handed to (or emailed to) a
 * distributor, chemist or doctor (direct sale). Same pdfkit approach as the
 * payslip: one structured page, no headless browser.
 */

export interface InvoicePdfCompany {
  name: string
  gstNumber: string | null
  drugLicense: string | null
  address: string | null
  phone: string | null
  email: string | null
  logoUrl: string | null
}

export interface InvoicePdfBankAccount {
  bankName: string
  accountHolderName: string
  accountNumber: string
  ifscCode: string
  branch: string | null
  upiId: string | null
}

export interface InvoicePdfParty {
  label: 'Distributor' | 'Chemist (direct sale)' | 'Doctor (direct sale)'
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
  hsnCode: string | null
  batchNumber: string | null
  expiryDate: string | null
  mrp: number | null
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
  bankAccount: InvoicePdfBankAccount | null
}

export async function generateSalesInvoicePdf(data: InvoicePdfData, company: InvoicePdfCompany): Promise<Buffer> {
  // Fetched up front, outside the pdfkit stream — a slow or failed fetch
  // must never leave a half-written PDF, and doc.image() needs bytes, not
  // a URL. If this fails for any reason the invoice still generates, just
  // without a logo.
  let logoBuffer: Buffer | null = null
  if (company.logoUrl) {
    try {
      const res = await fetch(company.logoUrl)
      if (res.ok) logoBuffer = Buffer.from(await res.arrayBuffer())
    } catch {
      logoBuffer = null
    }
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // ─── Header ───────────────────────────────────────────────────────────
    const headerTop = doc.y
    let logoDrawn = false
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, 40, headerTop, { fit: [64, 64] })
        logoDrawn = true
      } catch {
        logoDrawn = false // corrupt/unsupported image bytes — skip, never fail the invoice over it
      }
    }
    const textX = logoDrawn ? 116 : 40

    doc.fontSize(17).font('Helvetica-Bold').fillColor('#0f5132').text(company.name.toUpperCase(), textX, headerTop)
    doc.fontSize(8.5).font('Helvetica').fillColor('#555')
    if (company.address) doc.text(company.address, textX, doc.y)
    const regLine = [
      company.gstNumber && `GSTIN: ${company.gstNumber}`,
      company.drugLicense && `Drug Licence: ${company.drugLicense}`,
    ].filter(Boolean).join('   ·   ')
    if (regLine) doc.text(regLine, textX, doc.y)
    const contactLine = [
      company.phone && `Phone: ${company.phone}`,
      company.email && `Email: ${company.email}`,
    ].filter(Boolean).join('   ·   ')
    if (contactLine) doc.text(contactLine, textX, doc.y)

    // Clear the logo box too, whichever block (logo or text) runs taller.
    if (logoDrawn) doc.y = Math.max(doc.y, headerTop + 68)

    doc.moveDown(0.5)
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#111').text('TAX INVOICE', { align: 'right' })
    doc.fontSize(9).font('Helvetica').fillColor('#333')
    doc.text(`Invoice No: ${data.invoiceNumber}`, { align: 'right' })
    doc.text(`Date: ${formatDate(data.invoiceDate)}`, { align: 'right' })
    const placeOfSupply = data.party.state ?? data.party.city
    if (placeOfSupply) {
      doc.text(`Place of Supply: ${placeOfSupply} (${data.isInterstate ? 'Inter-State' : 'Intra-State'})`, { align: 'right' })
    }
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
    // Columns sum to exactly 515pt (40 -> 555), matching the page's usable
    // width — HSN and MRP are standard on a pharma GST tax invoice.
    const colX = { product: 40, hsn: 158, batch: 192, qty: 260, mrp: 298, rate: 346, disc: 394, gst: 426, total: 458 }
    const colW = { product: 118, hsn: 34, batch: 68, qty: 38, mrp: 48, rate: 48, disc: 32, gst: 32, total: 97 }
    const tableTop = doc.y

    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#fff')
    doc.rect(40, tableTop, 515, 16).fill('#0f5132')
    doc.fillColor('#fff')
    doc.text('Product', colX.product + 3, tableTop + 4, { width: colW.product - 3 })
    doc.text('HSN', colX.hsn + 3, tableTop + 4, { width: colW.hsn - 3 })
    doc.text('Batch/Exp', colX.batch + 3, tableTop + 4, { width: colW.batch - 3 })
    doc.text('Qty', colX.qty + 3, tableTop + 4, { width: colW.qty - 3, align: 'right' })
    doc.text('MRP', colX.mrp + 3, tableTop + 4, { width: colW.mrp - 3, align: 'right' })
    doc.text('Rate', colX.rate + 3, tableTop + 4, { width: colW.rate - 3, align: 'right' })
    doc.text('Disc%', colX.disc + 3, tableTop + 4, { width: colW.disc - 3, align: 'right' })
    doc.text('GST%', colX.gst + 3, tableTop + 4, { width: colW.gst - 3, align: 'right' })
    doc.text('Amount', colX.total + 3, tableTop + 4, { width: colW.total - 3, align: 'right' })

    let y = tableTop + 16
    doc.font('Helvetica').fontSize(7.5)
    for (const item of data.items) {
      const rowHeight = 24
      if (y + rowHeight > 780) { doc.addPage(); y = 40 }

      doc.fillColor('#111')
      const productLabel = `${item.productName}${item.strength ? ' ' + item.strength : ''}`
      doc.text(productLabel, colX.product + 3, y, { width: colW.product - 3 })
      doc.fillColor('#888').fontSize(6.5).text(item.productCode ?? '', colX.product + 3, y + 10, { width: colW.product - 3 })

      doc.fontSize(7.5).fillColor('#333')
      doc.text(item.hsnCode ?? '—', colX.hsn + 3, y, { width: colW.hsn - 3 })

      doc.text(item.batchNumber ?? '—', colX.batch + 3, y, { width: colW.batch - 3 })
      if (item.expiryDate) doc.fontSize(6.5).fillColor('#888').text(`Exp ${formatDate(item.expiryDate)}`, colX.batch + 3, y + 10, { width: colW.batch - 3 })

      doc.fontSize(7.5).fillColor('#111')
      doc.text(`${qty(item.quantity)} ${item.unit}`, colX.qty + 3, y, { width: colW.qty - 3, align: 'right' })
      if (item.freeQuantity > 0) doc.fontSize(6.5).fillColor('#0f5132').text(`+${qty(item.freeQuantity)} free`, colX.qty + 3, y + 10, { width: colW.qty - 3, align: 'right' })

      doc.fontSize(7.5).fillColor('#111')
      doc.text(item.mrp != null && item.mrp > 0 ? pdfMoney(item.mrp) : '—', colX.mrp + 3, y, { width: colW.mrp - 3, align: 'right' })
      doc.text(pdfMoney(item.rate), colX.rate + 3, y, { width: colW.rate - 3, align: 'right' })
      doc.text(item.discountPercent > 0 ? `${item.discountPercent}%` : '—', colX.disc + 3, y, { width: colW.disc - 3, align: 'right' })
      doc.text(`${item.gstRate}%`, colX.gst + 3, y, { width: colW.gst - 3, align: 'right' })
      doc.font('Helvetica-Bold').text(pdfMoney(item.lineTotal), colX.total + 3, y, { width: colW.total - 3, align: 'right' })
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

    totalRow('Subtotal', pdfMoney(data.subtotal))
    if (data.discount > 0) totalRow('Discount', `- ${pdfMoney(data.discount)}`)
    if (data.isInterstate) {
      totalRow('IGST', pdfMoney(tax.igst))
    } else {
      totalRow('CGST', pdfMoney(tax.cgst))
      totalRow('SGST', pdfMoney(tax.sgst))
    }
    doc.strokeColor('#ddd').moveTo(totalsX, doc.y).lineTo(555, doc.y).stroke()
    doc.moveDown(0.3)
    totalRow('Grand Total', pdfMoney(data.grandTotal), true)
    totalRow('Received', pdfMoney(data.amountPaid))
    const due = data.grandTotal - data.amountPaid
    if (due > 0) totalRow('Outstanding', pdfMoney(due))

    // ─── Amount in words ─────────────────────────────────────────────────
    doc.moveDown(0.5)
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#111')
    doc.text('Amount in Words: ', 40, doc.y, { continued: true, width: 515 })
    doc.font('Helvetica').fillColor('#333').text(amountInWords(data.grandTotal))

    doc.moveDown(0.8)
    doc.fontSize(9).font('Helvetica-Bold').fillColor(due > 0 ? '#b91c1c' : '#0f5132')
    doc.text(`Payment status: ${data.paymentStatus}`, 40)

    if (data.remarks) {
      doc.moveDown(0.5)
      doc.fontSize(8.5).font('Helvetica').fillColor('#555').text(`Remarks: ${data.remarks}`, 40, doc.y, { width: 515 })
    }

    // ─── Bank details for payment ───────────────────────────────────────
    if (data.bankAccount) {
      doc.moveDown(0.8)
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0f5132').text('Bank Details for Payment', 40, doc.y)
      doc.font('Helvetica').fontSize(8).fillColor('#333')
      doc.text(`${data.bankAccount.bankName}${data.bankAccount.branch ? ' — ' + data.bankAccount.branch : ''}`, 40, doc.y)
      doc.text(`A/c Name: ${data.bankAccount.accountHolderName}`, 40, doc.y)
      doc.text(`A/c No: ${data.bankAccount.accountNumber}   IFSC: ${data.bankAccount.ifscCode}`, 40, doc.y)
      if (data.bankAccount.upiId) doc.text(`UPI: ${data.bankAccount.upiId}`, 40, doc.y)
    }

    // ─── Declaration & signatory ────────────────────────────────────────
    // Standard elements of a professional pharma-company tax invoice.
    // Kept together on one page — if there's not enough room left, start a
    // fresh page for it rather than letting it get cut off at the bottom.
    let blockY = doc.y + 20
    if (blockY > 700) { doc.addPage(); blockY = 40 }

    doc.fontSize(7.5).font('Helvetica').fillColor('#555')
    doc.text(
      'Declaration: We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
      40, blockY, { width: 320 },
    )
    doc.text(
      'E. & O.E. Goods once sold are not returnable except for damaged, expired, or wrongly supplied stock, as per company policy.',
      40, blockY + 26, { width: 320 },
    )

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111')
    doc.text(`For ${company.name}`, 400, blockY, { width: 155, align: 'right' })
    doc.font('Helvetica').fontSize(8).fillColor('#333')
    doc.text('Authorised Signatory', 400, blockY + 45, { width: 155, align: 'right' })

    doc.y = blockY + 65
    doc.fontSize(7.5).fillColor('#999').text(
      'This is a computer-generated invoice.',
      40, doc.y,
    )

    doc.end()
  })
}
