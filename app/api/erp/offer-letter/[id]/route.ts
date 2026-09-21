import { NextRequest, NextResponse } from 'next/server'
import { getErpSession } from '@/lib/erp/auth'
import { can } from '@/lib/erp/permissions'
import { getOfferLetter } from '@/lib/erp/data/offers'
import { listLeaveTypes } from '@/lib/erp/data/leave'
import { getErpSettings } from '@/lib/erp/data/settings'
import { generateOfferLetterPdf, type OfferLetterPdfData } from '@/lib/erp/offer-letter-pdf'

/** Streams one offer letter as a printable PDF. Gated by offers.manage —
 *  admin/HR only, same as the screen that generates and tracks it. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getErpSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(session.role, 'offers.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const offer = await getOfferLetter(id)
  if (!offer) return NextResponse.json({ error: 'Offer letter not found' }, { status: 404 })

  // Earned Leave's accrual configuration (if any), so the letter can
  // describe it as an ongoing rate instead of a fixed annual number — see
  // the note on OfferLetterPdfData.elAccrualDays.
  const leaveTypes = await listLeaveTypes(false)
  const earnedLeave = leaveTypes.find(t => t.name === 'Earned Leave')
  const elAccrualDays = earnedLeave?.accrual_days && earnedLeave.accrual_interval_months ? earnedLeave.accrual_days : null
  const elAccrualIntervalMonths = earnedLeave?.accrual_days && earnedLeave.accrual_interval_months ? earnedLeave.accrual_interval_months : null

  const data: OfferLetterPdfData = {
    offerNumber: offer.offer_number,
    offerDate: offer.offer_date,
    revision: offer.revision,
    candidateName: offer.candidate_name,
    candidateAddress: offer.candidate_address,
    designation: offer.designation,
    department: offer.department,
    territory: offer.territory,
    reportsToName: offer.reports_to_name,
    joiningDate: offer.joining_date,
    incentiveTerms: offer.incentive_terms,
    annualElDays: Number(offer.annual_el_days),
    annualSlDays: Number(offer.annual_sl_days),
    annualClDays: Number(offer.annual_cl_days),
    elAccrualDays,
    elAccrualIntervalMonths,
    remarks: offer.remarks,
    components: offer.components.map(c => ({
      name: c.component_name,
      category: c.category,
      monthly: Number(c.monthly_amount),
      annual: Number(c.annual_amount),
    })),
  }

  const settings = await getErpSettings()
  const pdf = await generateOfferLetterPdf(data, {
    name: settings.company_name,
    address: settings.company_address,
    phone: settings.company_phone,
    email: settings.company_email,
    logoUrl: settings.company_logo_url,
    signatoryName: settings.hr_signatory_name,
    signatoryTitle: settings.hr_signatory_title,
  })

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="offer-${offer.offer_number.replace(/\//g, '-')}.pdf"`,
    },
  })
}
