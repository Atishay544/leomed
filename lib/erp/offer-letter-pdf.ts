import 'server-only'
import PDFDocument from 'pdfkit'
import { formatDate, pdfMoney } from './format'

/**
 * Offer-of-employment PDF — printed/emailed to a candidate, admin/HR-only.
 * Same pdfkit approach as the sales invoice and payslip: one structured
 * document, no headless browser. A direct, final offer (not a conditional
 * assessment invitation) — designation, compensation and standard terms,
 * with a physical acceptance block for the candidate to sign and return
 * (acceptance itself is still tracked by hand in the ERP, not online).
 */

export interface OfferLetterPdfComponent {
  name: string
  category: 'EARNING' | 'DEDUCTION'
  monthly: number
  annual: number
}

export interface OfferLetterPdfData {
  offerNumber: string
  offerDate: string
  /** Bumped every time HR edits and re-saves an existing offer — shown on
   *  the letter so a revised offer never reads as identical to the first. */
  revision: number
  candidateName: string
  candidateAddress: string | null
  designation: string
  department: string | null
  territory: string | null
  reportsToName: string | null
  joiningDate: string | null
  /** Free text on incentive/variable-pay eligibility — printed in the
   *  letter's opening paragraphs, deliberately never a row in Annexure I. */
  incentiveTerms: string | null
  remarks: string | null
  components: OfferLetterPdfComponent[]
}

export interface OfferLetterPdfCompany {
  name: string
  address: string | null
  phone: string | null
  email: string | null
  logoUrl: string | null
  signatoryName: string | null
  signatoryTitle: string | null
}

const CATEGORY_LABEL: Record<OfferLetterPdfComponent['category'], string> = {
  EARNING:   'Earning',
  DEDUCTION: 'Deduction',
}

export async function generateOfferLetterPdf(data: OfferLetterPdfData, company: OfferLetterPdfCompany): Promise<Buffer> {
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
        logoDrawn = false
      }
    }
    const textX = logoDrawn ? 116 : 40

    doc.fontSize(17).font('Helvetica-Bold').fillColor('#0f5132').text(company.name.toUpperCase(), textX, headerTop)
    doc.fontSize(8.5).font('Helvetica').fillColor('#555')
    if (company.address) doc.text(company.address, textX, doc.y)
    const contactLine = [
      company.phone && `Phone: ${company.phone}`,
      company.email && `Email: ${company.email}`,
    ].filter(Boolean).join('   ·   ')
    if (contactLine) doc.text(contactLine, textX, doc.y)
    // Reset x back to the true left margin — everything below assumes it
    // starts there (most pass a fixed width without repeating x), and the
    // header's textX offset otherwise leaks into it, overflowing past the
    // page edge instead of wrapping (this is what clipped "Muzaffarnagar"
    // mid-word the first time a logo was tested).
    if (logoDrawn) doc.y = Math.max(doc.y, headerTop + 68)
    doc.x = 40

    doc.moveDown(0.5)
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#111').text('OFFER OF EMPLOYMENT', { align: 'right' })
    doc.fontSize(9).font('Helvetica').fillColor('#333')
    doc.text(`Ref: ${data.offerNumber}${data.revision > 1 ? ` (Revision ${data.revision})` : ''}`, { align: 'right' })
    doc.text(`Date: ${formatDate(data.offerDate)}`, { align: 'right' })
    doc.moveDown(0.5)
    doc.strokeColor('#ddd').moveTo(40, doc.y).lineTo(555, doc.y).stroke()
    doc.moveDown(0.6)

    // ─── Candidate ────────────────────────────────────────────────────────
    doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#111').text('To,')
    doc.text(data.candidateName)
    doc.font('Helvetica').fontSize(8.5).fillColor('#444')
    if (data.candidateAddress) doc.text(data.candidateAddress, { width: 350 })
    doc.moveDown(0.8)

    // ─── Body ─────────────────────────────────────────────────────────────
    doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#111').text(`Dear ${data.candidateName},`)
    doc.moveDown(0.4)

    const placeBit = data.territory ? ` at ${data.territory}` : ''
    const reportsBit = data.reportsToName ? `, reporting to ${data.reportsToName}` : ''
    const joiningBit = data.joiningDate
      ? `Your date of joining will be ${formatDate(data.joiningDate)}.`
      : 'Your date of joining will be confirmed separately.'

    doc.font('Helvetica').fontSize(9.5).fillColor('#333').text(
      `We are pleased to offer you employment with ${company.name} in the position of ` +
      `${data.designation}${placeBit}${reportsBit}. ${joiningBit}`,
      { width: 515, align: 'justify' },
    )
    doc.moveDown(0.6)

    if (data.revision > 1) {
      doc.font('Helvetica-Oblique').fillColor('#555').text(
        'This revised offer letter supersedes any previous offer letter issued to you for this position.',
        { width: 515, align: 'justify' },
      )
      doc.moveDown(0.6)
      doc.font('Helvetica').fillColor('#333')
    }

    doc.text('Your fixed compensation is detailed in Annexure I to this letter.', { width: 515, align: 'justify' })
    doc.moveDown(0.6)

    // Incentive/variable pay is HR's own free text, kept in these opening
    // paragraphs — deliberately never a row in Annexure I's fixed-pay table.
    if (data.incentiveTerms) {
      doc.font('Helvetica-Bold').fillColor('#111').text('Incentive: ', 40, doc.y, { continued: true, width: 515 })
      doc.font('Helvetica').fillColor('#333').text(data.incentiveTerms)
      doc.moveDown(0.6)
    }

    // ─── Terms & Conditions ───────────────────────────────────────────────
    doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#0f5132').text('Terms and Conditions')
    doc.moveDown(0.3)
    doc.font('Helvetica').fontSize(8.5).fillColor('#333')
    const terms = [
      'This offer is subject to verification of the original documents, certificates and references you provide.',
      "Your employment will be governed by the Company's HR policies, as amended from time to time.",
      "Either party may terminate this employment by giving notice as specified in the Company's HR policy.",
      "This offer is confidential and must not be discussed with anyone other than the Company's authorised HR representative.",
      'You are not entitled to any compensation, allowance or benefit not expressly stated in this letter or its Annexure.',
    ]
    terms.forEach((t, i) => {
      doc.text(`${i + 1}. ${t}`, { width: 515, align: 'justify' })
      doc.moveDown(0.25)
    })

    if (data.remarks) {
      doc.moveDown(0.3)
      doc.font('Helvetica-Bold').fillColor('#111').text('Additional Terms:', { continued: true })
      doc.font('Helvetica').fillColor('#333').text(` ${data.remarks}`, { width: 515 })
    }

    doc.moveDown(1)
    doc.font('Helvetica').fontSize(9.5).fillColor('#333').text('We look forward to a long and mutually beneficial association.')
    doc.moveDown(1)
    doc.text('Yours Sincerely,')
    doc.font('Helvetica-Bold').fillColor('#111').text(`For ${company.name}`)
    doc.moveDown(2)
    if (company.signatoryName) {
      doc.font('Helvetica-Bold').text(company.signatoryName)
      if (company.signatoryTitle) doc.font('Helvetica').fillColor('#555').text(company.signatoryTitle)
    } else {
      doc.font('Helvetica').fillColor('#555').text('Authorised Signatory')
    }

    // ─── Acceptance block ─────────────────────────────────────────────────
    if (doc.y > 680) doc.addPage()
    doc.moveDown(1.2)
    doc.strokeColor('#ddd').moveTo(40, doc.y).lineTo(555, doc.y).stroke()
    doc.moveDown(0.5)
    doc.fontSize(8.5).font('Helvetica').fillColor('#333').text(
      'I have read and understood the terms and conditions mentioned above and hereby accept this offer of employment.',
      { width: 515 },
    )
    doc.moveDown(1)
    const acceptY = doc.y
    doc.text('Name:', 40, acceptY, { continued: true })
    doc.text(` ${data.candidateName}`, { width: 250 })
    doc.text('Date:', 300, acceptY, { continued: true })
    doc.text(' _________________', { width: 200 })
    doc.moveDown(1.2)
    doc.text('Signature: _________________', 40, doc.y)

    // ─── Annexure I — compensation breakup ────────────────────────────────
    doc.addPage()
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f5132').text('Annexure I — Compensation Details', { align: 'center' })
    doc.moveDown(0.3)
    doc.fontSize(9).font('Helvetica').fillColor('#333')
    doc.text(`Name: ${data.candidateName}`)
    doc.text(`Designation: ${data.designation}`)
    if (data.territory) doc.text(`HQ / Location: ${data.territory}`)
    doc.moveDown(0.6)

    const colX = { name: 40, category: 260, monthly: 380, annual: 460 }
    const colW = { name: 220, category: 120, monthly: 80, annual: 95 }
    const tableTop = doc.y

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff')
    doc.rect(40, tableTop, 515, 18).fill('#0f5132')
    doc.fillColor('#fff')
    doc.text('Component', colX.name + 4, tableTop + 5, { width: colW.name - 4 })
    doc.text('Type', colX.category + 4, tableTop + 5, { width: colW.category - 4 })
    doc.text('Per Month (Rs.)', colX.monthly + 4, tableTop + 5, { width: colW.monthly - 4, align: 'right' })
    doc.text('Per Annum (Rs.)', colX.annual + 4, tableTop + 5, { width: colW.annual - 4, align: 'right' })

    let y = tableTop + 18
    doc.font('Helvetica').fontSize(9)
    for (const c of data.components) {
      doc.fillColor('#111')
      doc.text(c.name, colX.name + 4, y + 4, { width: colW.name - 4 })
      doc.fillColor('#666').text(CATEGORY_LABEL[c.category], colX.category + 4, y + 4, { width: colW.category - 4 })
      doc.fillColor('#111')
      doc.text(pdfMoney(c.monthly), colX.monthly + 4, y + 4, { width: colW.monthly - 4, align: 'right' })
      doc.text(pdfMoney(c.annual), colX.annual + 4, y + 4, { width: colW.annual - 4, align: 'right' })
      y += 20
      doc.strokeColor('#eee').moveTo(40, y - 2).lineTo(555, y - 2).stroke()
    }

    const earning  = data.components.filter(c => c.category === 'EARNING')
    const deduction = data.components.filter(c => c.category === 'DEDUCTION')
    const sum = (rows: OfferLetterPdfComponent[], key: 'monthly' | 'annual') =>
      rows.reduce((s, r) => s + r[key], 0)

    const guaranteedMonthly = sum(earning, 'monthly')
    const guaranteedAnnual  = sum(earning, 'annual')
    const fixedMonthly = guaranteedMonthly + sum(deduction, 'monthly')
    const fixedAnnual  = guaranteedAnnual + sum(deduction, 'annual')

    doc.y = y + 6
    const summaryRow = (label: string, monthly: number, annual: number, bold = false) => {
      const rowY = doc.y
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 9).fillColor('#111')
      doc.text(label, colX.name + 4, rowY, { width: colX.monthly - colX.name })
      doc.text(pdfMoney(monthly), colX.monthly + 4, rowY, { width: colW.monthly - 4, align: 'right' })
      doc.text(pdfMoney(annual), colX.annual + 4, rowY, { width: colW.annual - 4, align: 'right' })
      doc.moveDown(0.5)
    }

    doc.strokeColor('#ddd').moveTo(40, doc.y).lineTo(555, doc.y).stroke()
    doc.moveDown(0.3)
    summaryRow('Total Guaranteed Compensation', guaranteedMonthly, guaranteedAnnual, true)
    if (deduction.length > 0) summaryRow('Total Fixed Compensation', fixedMonthly, fixedAnnual, true)

    doc.moveDown(1)
    doc.fontSize(7.5).font('Helvetica').fillColor('#999').text(
      'This is a computer-generated offer letter.',
      40, doc.y,
    )

    doc.end()
  })
}
