import { Resend } from 'resend'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

const FROM = 'Leomed Pharma <orders@leomedpharma.in>'

// ─── Shared helpers ─────────────────────────────────────────────────────────

function formatINR(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function orderItemsHtml(items: { name: string; quantity: number; unit_price: number }[]) {
  return items.map(i => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">${i.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center">${i.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right">${formatINR(i.unit_price * i.quantity)}</td>
    </tr>`
  ).join('')
}

function addressText(addr: Record<string, string>) {
  return [addr.name, addr.line1, addr.line2, `${addr.city}, ${addr.state} ${addr.pincode}`, addr.phone]
    .filter(Boolean).join('<br>')
}

function baseLayout(body: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06)">
  <tr><td style="background:#000;padding:24px 32px">
    <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px">Leomed Pharma</span>
  </td></tr>
  <tr><td style="padding:32px">${body}</td></tr>
  <tr><td style="background:#f9f9f9;padding:20px 32px;border-top:1px solid #eee;text-align:center">
    <p style="margin:0;color:#999;font-size:12px">Leomed Pharma · Questions? Reply to this email.</p>
  </td></tr>
</table></td></tr></table>
</body></html>`
}

// ─── Auth: OTP Login Code ────────────────────────────────────────────────────

export async function sendOtpEmail({ to, otp }: { to: string; otp: string }) {
  const html = baseLayout(`
    <h2 style="margin:0 0 4px;font-size:22px;color:#111">Your Login Code</h2>
    <p style="margin:0 0 28px;color:#666;font-size:14px">Use this 6-digit code to sign in to Leomed Pharma. It expires in <strong>10 minutes</strong>.</p>
    <div style="text-align:center;margin:8px 0 32px">
      <div style="display:inline-block;background:#f5f3ff;border:2px solid #ddd6fe;border-radius:16px;padding:20px 48px">
        <span style="font-size:42px;font-weight:800;letter-spacing:14px;color:#5b21b6;font-family:monospace">${otp}</span>
      </div>
    </div>
    <p style="text-align:center;color:#9ca3af;font-size:12px;margin:0">If you didn't request this, you can safely ignore this email.</p>
  `)

  const { error } = await getResend().emails.send({
    from:    FROM,
    to,
    subject: `${otp} — your Leomed Pharma login code`,
    html,
  })
  if (error) throw new Error(error.message)
}

// ─── Auth: Sign-up OTP ───────────────────────────────────────────────────────

export async function sendSignupOtpEmail({ to, name, otp }: { to: string; name?: string; otp: string }) {
  const greeting = name ? `Hi ${name},` : 'Hi there,'
  const html = baseLayout(`
    <h2 style="margin:0 0 4px;font-size:22px;color:#111">Verify your account</h2>
    <p style="margin:0 0 28px;color:#666;font-size:14px">${greeting} use this 6-digit code to verify your Leomed Pharma account. It expires in <strong>10 minutes</strong>.</p>
    <div style="text-align:center;margin:8px 0 32px">
      <div style="display:inline-block;background:#f0fdf4;border:2px solid #bbf7d0;border-radius:16px;padding:20px 48px">
        <span style="font-size:42px;font-weight:800;letter-spacing:14px;color:#166534;font-family:monospace">${otp}</span>
      </div>
    </div>
    <p style="text-align:center;color:#9ca3af;font-size:12px;margin:0">If you didn't create a Leomed Pharma account, you can safely ignore this email.</p>
  `)
  const { error } = await getResend().emails.send({
    from:    FROM,
    to,
    subject: `${otp} — verify your Leomed Pharma account`,
    html,
  })
  if (error) throw new Error(error.message)
}

// ─── Auth: Sign-up Confirmation (link-based — kept for reference) ─────────────

export async function sendSignupConfirmation({ to, name, confirmLink }: { to: string; name?: string; confirmLink: string }) {
  const greeting = name ? `Hi ${name},` : 'Hi there,'

  const html = baseLayout(`
    <h2 style="margin:0 0 4px;font-size:22px;color:#111">Confirm your email</h2>
    <p style="margin:0 0 24px;color:#666;font-size:14px">${greeting} thanks for creating an account at Leomed Pharma!</p>
    <p style="color:#444;font-size:14px;margin:0 0 24px;line-height:1.6">
      Click the button below to verify your email address and activate your account.
    </p>
    <div style="text-align:center;margin:32px 0">
      <a href="${confirmLink}"
         style="display:inline-block;background:#000;color:#fff;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px;font-weight:700;letter-spacing:-0.2px">
        Confirm Email Address
      </a>
    </div>
    <p style="text-align:center;color:#9ca3af;font-size:12px;margin:0">
      This link expires in 24 hours. If you didn't create an account, ignore this email.
    </p>
  `)

  const { error } = await getResend().emails.send({
    from:    FROM,
    to,
    subject: 'Confirm your Leomed Pharma account',
    html,
  })
  if (error) throw new Error(error.message)
}

// ─── Customer: Order Confirmation ────────────────────────────────────────────

type PaymentMethod = 'online' | 'cod' | 'cod_upfront' | 'upi' | 'partial_cod'

interface OrderConfirmParams {
  to:              string
  orderId:         string
  items:           { name: string; quantity: number; unit_price: number }[]
  subtotal:        number
  discount:        number
  total:           number
  paymentMethod:   PaymentMethod
  amountCharged?:  number
  amountOnDelivery?: number
  utrNumber?:      string
  shippingAddress: Record<string, string>
}

export async function sendOrderConfirmation(p: OrderConfirmParams) {
  const pmLabel =
    p.paymentMethod === 'cod'         ? 'Cash on Delivery' :
    p.paymentMethod === 'cod_upfront' ? 'COD Upfront Offer' :
    p.paymentMethod === 'upi'         ? 'UPI Transfer' :
    p.paymentMethod === 'partial_cod' ? 'Partial Payment (UPI + COD)' :
                                        'Paid Online'

  let paymentDetail: string
  if (p.paymentMethod === 'cod') {
    paymentDetail = `
      <p style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 16px;color:#9a3412;margin:16px 0">
        <strong>Cash on Delivery</strong> — please keep <strong>${formatINR(p.total)}</strong> ready at the time of delivery.
      </p>`
  } else if (p.paymentMethod === 'cod_upfront' && p.amountCharged !== undefined) {
    paymentDetail = `
      <p style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;color:#166534;margin:16px 0">
        Paid upfront: <strong>${formatINR(p.amountCharged)}</strong> &nbsp;|&nbsp;
        Due on delivery: <strong>${formatINR(p.amountOnDelivery ?? 0)}</strong>
      </p>`
  } else if (p.paymentMethod === 'upi') {
    paymentDetail = `
      <p style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:12px 16px;color:#5b21b6;margin:16px 0">
        <strong>UPI Transfer received.</strong> We are verifying your payment.<br>
        ${p.utrNumber ? `<span style="font-size:12px;opacity:0.8">UTR / Transaction ID: <strong>${p.utrNumber}</strong></span>` : ''}
        <br><span style="font-size:12px;opacity:0.8">Your order will be confirmed once payment is verified (usually within a few hours).</span>
      </p>`
  } else if (p.paymentMethod === 'partial_cod') {
    paymentDetail = `
      <p style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;color:#92400e;margin:16px 0">
        <strong>Partial Payment:</strong> UPI advance of <strong>${formatINR(p.amountCharged ?? 0)}</strong> received.<br>
        ${p.utrNumber ? `<span style="font-size:12px;opacity:0.8">UTR / Transaction ID: <strong>${p.utrNumber}</strong></span><br>` : ''}
        <span style="font-size:12px;opacity:0.8">Remaining <strong>${formatINR(p.amountOnDelivery ?? 0)}</strong> is due at delivery.</span>
      </p>`
  } else {
    paymentDetail = `
      <p style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;color:#1e40af;margin:16px 0">
        Payment received online. Thank you!
      </p>`
  }

  const html = baseLayout(`
    <h2 style="margin:0 0 4px;font-size:22px;color:#111">Order Confirmed!</h2>
    <p style="margin:0 0 24px;color:#666;font-size:14px">Order #${p.orderId.slice(0,8).toUpperCase()} &nbsp;·&nbsp; ${pmLabel}</p>
    ${paymentDetail}
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin:20px 0">
      <thead><tr style="background:#f9f9f9">
        <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666;font-weight:600">ITEM</th>
        <th style="padding:10px 12px;text-align:center;font-size:12px;color:#666;font-weight:600">QTY</th>
        <th style="padding:10px 12px;text-align:right;font-size:12px;color:#666;font-weight:600">TOTAL</th>
      </tr></thead>
      <tbody>${orderItemsHtml(p.items)}</tbody>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
      ${p.discount > 0 ? `<tr><td style="padding:4px 0;color:#666;font-size:14px">Discount</td><td style="padding:4px 0;text-align:right;color:#16a34a;font-size:14px">-${formatINR(p.discount)}</td></tr>` : ''}
      <tr><td style="padding:8px 0 0;font-weight:700;font-size:16px;border-top:1px solid #eee">Total</td>
          <td style="padding:8px 0 0;text-align:right;font-weight:700;font-size:16px;border-top:1px solid #eee">${formatINR(p.total)}</td></tr>
    </table>
    <div style="background:#f9f9f9;border-radius:8px;padding:16px;font-size:13px;color:#555;line-height:1.6">
      <strong style="display:block;margin-bottom:4px;color:#333">Deliver to</strong>
      ${addressText(p.shippingAddress)}
    </div>
    <p style="margin:24px 0 0;font-size:13px;color:#888">We'll notify you once your order is shipped. If you have questions, reply to this email.</p>
  `)

  const { error } = await getResend().emails.send({
    from:    FROM,
    to:      p.to,
    subject: `Order Confirmed — #${p.orderId.slice(0,8).toUpperCase()} | Leomed Pharma`,
    html,
  })
  if (error) throw new Error(error.message)
}

// ─── Merchant: New Order Alert ───────────────────────────────────────────────

interface NewOrderAlertParams {
  orderId:       string
  customerEmail: string
  items:         { name: string; quantity: number; unit_price: number }[]
  total:         number
  paymentMethod: string
  shippingAddress: Record<string, string>
}

export async function sendNewOrderAlert(p: NewOrderAlertParams) {
  const html = baseLayout(`
    <h2 style="margin:0 0 4px;font-size:20px;color:#111">New Order Received</h2>
    <p style="margin:0 0 20px;color:#666;font-size:14px">Order #${p.orderId.slice(0,8).toUpperCase()} from ${p.customerEmail}</p>
    <p style="margin:0 0 8px;font-size:13px;color:#555"><strong>Payment:</strong> ${p.paymentMethod} &nbsp;·&nbsp; <strong>Total:</strong> ${formatINR(p.total)}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin:16px 0">
      <thead><tr style="background:#f9f9f9">
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#666">ITEM</th>
        <th style="padding:8px 12px;text-align:center;font-size:12px;color:#666">QTY</th>
        <th style="padding:8px 12px;text-align:right;font-size:12px;color:#666">TOTAL</th>
      </tr></thead>
      <tbody>${orderItemsHtml(p.items)}</tbody>
    </table>
    <div style="background:#f9f9f9;border-radius:8px;padding:14px;font-size:13px;color:#555;line-height:1.6;margin-bottom:20px">
      <strong style="display:block;margin-bottom:4px;color:#333">Ship to</strong>
      ${addressText(p.shippingAddress)}
    </div>
    <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.leomedpharma.in'}/admin/orders/${p.orderId}"
       style="display:inline-block;background:#000;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">
      View in Admin
    </a>
  `)

  const to = process.env.ORDERS_EMAIL ?? 'leomedpharma1@gmail.com'
  const { error } = await getResend().emails.send({
    from:    FROM,
    to,
    subject: `New Order #${p.orderId.slice(0,8).toUpperCase()} — ${formatINR(p.total)} (${p.paymentMethod})`,
    html,
  })
  if (error) throw new Error(error.message)
}
