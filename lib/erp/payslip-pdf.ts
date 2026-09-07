import 'server-only'
import PDFDocument from 'pdfkit'
import { money } from './format'
import type { ErpPayrollItem, ErpPayrollRecord } from './types'

/**
 * Payslip PDF generation — the one place this document is laid out, used by
 * both the download route and the email-delivery action so the two can never
 * drift apart.
 *
 * pdfkit was chosen deliberately over a headless-browser approach
 * (Puppeteer, etc.): a payslip is one page of structured text and numbers,
 * and pdfkit draws it directly with no browser process to manage. This is
 * the first PDF anywhere in the app, so it is also the only new dependency
 * this feature required.
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export interface PayslipEmployee {
  name: string
  employeeCode: string | null
  mrCode: string | null
  designation: string | null
  department: string | null
}

export interface PayslipCompany {
  name: string
  address: string | null
}

export function generatePayslipPdf(
  record: ErpPayrollRecord,
  period: { period_year: number; period_month: number; status: string },
  items: ErpPayrollItem[],
  employee: PayslipEmployee,
  company: PayslipCompany,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const monthLabel = `${MONTH_NAMES[period.period_month - 1]} ${period.period_year}`

    // ─── Header ───────────────────────────────────────────────────────────
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#0f5132').text(company.name.toUpperCase())
    if (company.address) {
      doc.fontSize(9).font('Helvetica').fillColor('#555').text(company.address)
    }
    doc.moveDown(0.3)
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#111').text(`Payslip — ${monthLabel}`)
    doc.moveDown(0.8)
    doc.strokeColor('#ddd').moveTo(50, doc.y).lineTo(545, doc.y).stroke()
    doc.moveDown(0.6)

    // ─── Employee details ─────────────────────────────────────────────────
    const detailY = doc.y
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#111')
    doc.text('Employee', 50, detailY)
    doc.font('Helvetica').text(employee.name, 150, detailY)

    doc.font('Helvetica-Bold').text('Employee ID', 320, detailY)
    doc.font('Helvetica').text(employee.employeeCode ?? employee.mrCode ?? '—', 420, detailY)

    const row2 = detailY + 18
    doc.font('Helvetica-Bold').text('Designation', 50, row2)
    doc.font('Helvetica').text(employee.designation ?? '—', 150, row2)
    doc.font('Helvetica-Bold').text('Department', 320, row2)
    doc.font('Helvetica').text(employee.department ?? '—', 420, row2)

    doc.y = row2 + 30

    // ─── Attendance summary ───────────────────────────────────────────────
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f5132').text('Attendance Summary')
    doc.moveDown(0.4)

    const attendanceRows: [string, string][] = [
      ['Working days', String(record.working_days)],
      ['Present days', String(record.present_days)],
      ['Half days', String(record.half_days)],
      ['Paid leave', String(record.paid_leave_days)],
      ['Unpaid leave', String(record.unpaid_leave_days)],
      ['Absent', String(record.absent_days)],
      ['Holidays', String(record.holiday_days)],
      ['Week offs', String(record.week_off_days)],
      ['Payable days', String(record.payable_days)],
    ]
    drawTwoColumnTable(doc, attendanceRows)
    doc.moveDown(0.8)

    // ─── Salary breakdown ─────────────────────────────────────────────────
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f5132').text('Salary Breakdown')
    doc.moveDown(0.4)

    const earnings = items.filter(i => i.item_type === 'INCENTIVE' || i.item_type === 'BONUS' || i.item_type === 'OTHER_EARNING')
    const deductionItems = items.filter(i => i.item_type === 'DEDUCTION')

    const earningRows: [string, string][] = [
      ['Fixed salary (prorated)', money(record.fixed_salary * record.payable_days / (record.working_days || 1))],
      ['Basic salary (reference)', money(record.basic_salary)],
      ['Allowances (reference)', money(record.allowances)],
      ...earnings.map((i): [string, string] => [i.label, money(i.amount)]),
    ]
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#111').text('Earnings')
    drawTwoColumnTable(doc, earningRows)
    doc.moveDown(0.5)

    const deductionRows: [string, string][] = [
      ['Standard deductions', money(record.standard_deductions)],
      ...deductionItems.map((i): [string, string] => [i.label, money(i.amount)]),
    ]
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#111').text('Deductions')
    drawTwoColumnTable(doc, deductionRows)
    doc.moveDown(0.8)

    doc.strokeColor('#ddd').moveTo(50, doc.y).lineTo(545, doc.y).stroke()
    doc.moveDown(0.5)

    doc.fontSize(13).font('Helvetica-Bold').fillColor('#0f5132')
    doc.text('Net Payable Salary', 50, doc.y, { continued: true })
    doc.text(money(record.net_salary), { align: 'right' })
    doc.moveDown(1)

    doc.fontSize(9).font('Helvetica').fillColor('#555')
    doc.text(`Payment status: ${period.status}`)
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`)
    doc.moveDown(0.6)
    doc.fontSize(8).fillColor('#999').text(
      'This is a computer-generated payslip and does not require a signature.',
    )

    doc.end()
  })
}

function drawTwoColumnTable(doc: PDFKit.PDFDocument, rows: [string, string][]) {
  doc.fontSize(9.5).font('Helvetica')
  for (const [label, value] of rows) {
    const y = doc.y
    doc.fillColor('#444').text(label, 50, y)
    doc.fillColor('#111').text(value, 400, y, { width: 145, align: 'right' })
    doc.moveDown(0.35)
  }
}
