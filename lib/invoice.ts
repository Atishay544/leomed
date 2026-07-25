// Client-side invoice PDF generation using jsPDF
// Runs entirely in the browser — no server endpoint needed.

export interface InvoiceOrder {
  id: string
  status: string
  created_at: string
  subtotal: number
  tax: number
  shipping: number
  total: number
  tracking_number?: string | null
  coupon_code?: string | null
  discount_amount?: number | null
  shipping_address: {
    name?: string
    full_name?: string
    line1?: string
    line2?: string
    city?: string
    state?: string
    pincode?: string
    zip?: string
    phone?: string
  }
  order_items: Array<{
    id: string
    quantity: number
    unit_price: number
    total: number
    snapshot?: { name?: string; sku?: string } | null
    products?: { name?: string } | null
  }>
  customer?: {
    full_name?: string
    email?: string
    phone?: string
  } | null
}

function fmt(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Brand colours
const BRAND_BLACK  = [15,   15,  15]  as [number,number,number]
const BRAND_ACCENT = [99,  102, 241]  as [number,number,number]  // indigo-500
const GRAY_900     = [17,   24,  39]  as [number,number,number]
const GRAY_600     = [75,   85,  99]  as [number,number,number]
const GRAY_200     = [229, 231, 235]  as [number,number,number]
const GRAY_50      = [249, 250, 251]  as [number,number,number]
const GREEN_600    = [22,  163,  74]  as [number,number,number]
const WHITE        = [255, 255, 255]  as [number,number,number]

export async function downloadInvoicePDF(order: InvoiceOrder) {
  const { default: jsPDF }    = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()   // 210
  const pageH = doc.internal.pageSize.getHeight()  // 297
  const orderId  = order.id.slice(0, 8).toUpperCase()
  const addr     = order.shipping_address ?? {}
  const addrName = addr.name ?? addr.full_name ?? ''

  // ── 1. Top accent bar ────────────────────────────────────────────────────
  doc.setFillColor(...BRAND_ACCENT)
  doc.rect(0, 0, pageW, 3, 'F')

  // ── 2. Header: brand left · INVOICE right ───────────────────────────────
  const HDR_TOP = 10
  // Brand name
  doc.setFillColor(...BRAND_BLACK)
  doc.setTextColor(...WHITE)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  // Draw small brand pill background
  doc.roundedRect(14, HDR_TOP - 5, 52, 10, 2, 2, 'F')
  doc.text('Leomed Pharma', 17, HDR_TOP + 1.5)

  // Sub-text below brand
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY_600)
  doc.text('leomedpharma1@gmail.com', 14, HDR_TOP + 9)
  doc.text('+91 63986 97503', 14, HDR_TOP + 14)

  // INVOICE label (right)
  doc.setFontSize(26)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BRAND_BLACK)
  doc.text('INVOICE', pageW - 14, HDR_TOP + 5, { align: 'right' })

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY_600)
  doc.text('Tax Invoice / Bill of Supply', pageW - 14, HDR_TOP + 9, { align: 'right' })
  doc.text('GSTIN: 09ADRPT8009N4ZG', pageW - 14, HDR_TOP + 13, { align: 'right' })
  doc.text('Drug Licence No: UP1220B001821', pageW - 14, HDR_TOP + 17, { align: 'right' })

  // ── 3. Thin divider ───────────────────────────────────────────────────────
  const DIV1 = HDR_TOP + 20
  doc.setDrawColor(...GRAY_200)
  doc.setLineWidth(0.3)
  doc.line(14, DIV1, pageW - 14, DIV1)

  // ── 4. Two-column meta block ──────────────────────────────────────────────
  const META_Y = DIV1 + 7
  const COL2   = 110  // right column x

  // Left: Invoice details
  const metaRows: [string, string][] = [
    ['Invoice No.',  `#LP-${orderId}`],
    ['Order Date',   new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })],
    ['Status',       order.status.toUpperCase().replace(/_/g, ' ')],
  ]
  if (order.tracking_number) metaRows.push(['Tracking', order.tracking_number])

  doc.setFontSize(7.5)
  metaRows.forEach(([label, value], i) => {
    const y = META_Y + i * 6
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY_600)
    doc.text(label, 14, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...GRAY_900)
    doc.text(value, 55, y)
  })

  // Right column label
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...BRAND_ACCENT)
  doc.text('DELIVER TO', COL2, META_Y - 1)

  // Address lines
  const addrLines = [
    addrName,
    addr.line1,
    addr.line2,
    [addr.city, addr.state].filter(Boolean).join(', '),
    addr.pincode ?? addr.zip,
    addr.phone,
  ].filter(Boolean) as string[]

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...GRAY_900)
  doc.text(addrLines[0] ?? '', COL2, META_Y + 5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY_600)
  addrLines.slice(1).forEach((line, i) => {
    doc.text(line, COL2, META_Y + 11 + i * 5)
  })

  // Customer email
  if (order.customer?.email) {
    const custY = META_Y + 11 + (addrLines.length - 1) * 5 + 4
    doc.setTextColor(...BRAND_ACCENT)
    doc.text(order.customer.email, COL2, custY)
  }

  // ── 5. Items table ─────────────────────────────────────────────────────────
  const tableStartY = META_Y + Math.max(metaRows.length * 6, addrLines.length * 5 + 20) + 4

  autoTable(doc, {
    startY: tableStartY,
    head: [['#', 'Product', 'SKU', 'Qty', 'Unit Price', 'Total']],
    body: order.order_items.map((item, i) => [
      i + 1,
      item.snapshot?.name ?? item.products?.name ?? '—',
      item.snapshot?.sku ?? '—',
      item.quantity,
      fmt(item.unit_price),
      fmt(item.total),
    ]),
    headStyles: {
      fillColor: BRAND_BLACK,
      textColor: WHITE,
      fontSize:  8,
      fontStyle: 'bold',
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
    },
    bodyStyles: {
      fontSize:    8.5,
      textColor:   GRAY_900,
      cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
    },
    columnStyles: {
      0: { cellWidth: 8,  halign: 'center' },
      1: { cellWidth: 72 },
      2: { cellWidth: 26 },
      3: { cellWidth: 11, halign: 'center' },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
    },
    alternateRowStyles: { fillColor: GRAY_50 },
    margin: { left: 14, right: 14 },
    tableLineColor: GRAY_200,
    tableLineWidth: 0.2,
  })

  // ── 6. Totals panel ────────────────────────────────────────────────────────
  const afterTable = (doc as any).lastAutoTable.finalY + 6
  const BOX_W      = 80
  const BOX_X      = pageW - 14 - BOX_W
  let ty           = afterTable

  // Subtotal
  function totLine(label: string, value: string, bold = false, color = GRAY_600 as [number,number,number]) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(bold ? 9.5 : 8.5)
    doc.setTextColor(...color)
    doc.text(label, BOX_X + 4, ty)
    const valueColor: [number, number, number] = bold ? GRAY_900 : color
    doc.setTextColor(...valueColor)
    doc.text(value, pageW - 18, ty, { align: 'right' })
    ty += 6.5
  }

  totLine('Subtotal', fmt(order.subtotal))

  if (order.discount_amount && order.discount_amount > 0) {
    const label = order.coupon_code ? `Coupon (${order.coupon_code})` : 'Discount'
    totLine(label, `- ${fmt(order.discount_amount)}`, false, GREEN_600)
  }

  totLine('Shipping', order.shipping > 0 ? fmt(order.shipping) : 'FREE ✓')
  totLine('Tax (incl.)', fmt(order.tax))

  // Total box
  ty += 1
  const TOTAL_BOX_H = 10
  doc.setFillColor(...BRAND_BLACK)
  doc.roundedRect(BOX_X, ty - 1, BOX_W, TOTAL_BOX_H, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...WHITE)
  doc.text('TOTAL', BOX_X + 4, ty + 5.5)
  doc.text(fmt(order.total), pageW - 18, ty + 5.5, { align: 'right' })

  // ── 7. PAID stamp (for delivered / confirmed orders) ──────────────────────
  const paidStatuses = ['delivered', 'confirmed', 'shipped', 'processing', 'cod_upfront_paid']
  if (paidStatuses.includes(order.status)) {
    doc.setFontSize(22)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(22, 163, 74, 0.18)
    doc.saveGraphicsState?.()
    try {
      // Rotate stamp
      const stampX = 38
      const stampY = ty + 5
      doc.setTextColor(22, 163, 74)
      doc.setDrawColor(22, 163, 74)
      doc.setLineWidth(1.2)
      doc.roundedRect(stampX - 10, stampY - 7, 36, 11, 2, 2, 'S')
      doc.setFontSize(13)
      doc.text('PAID', stampX + 8, stampY + 0.5, { align: 'center' })
    } catch {}
  }

  // ── 8. Footer ─────────────────────────────────────────────────────────────
  const FOOTER_Y = pageH - 18

  // Footer accent line
  doc.setDrawColor(...BRAND_ACCENT)
  doc.setLineWidth(0.5)
  doc.line(14, FOOTER_Y - 5, pageW - 14, FOOTER_Y - 5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...BRAND_BLACK)
  doc.text('Leomed Pharma', 14, FOOTER_Y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...GRAY_600)
  doc.text('Thank you for your order! See our Refund Policy for return eligibility.', 14, FOOTER_Y + 5)
  doc.text('leomedpharma1@gmail.com  |  +91 63986 97503', 14, FOOTER_Y + 10)

  doc.setTextColor(...GRAY_200)
  doc.text(`Generated on ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`, pageW - 14, FOOTER_Y, { align: 'right' })
  doc.text(`Invoice #LP-${orderId}`, pageW - 14, FOOTER_Y + 5, { align: 'right' })

  doc.save(`invoice-HF-${orderId}.pdf`)
}
