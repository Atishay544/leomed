import { Resend } from 'resend'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

const FROM = 'Leomed Pharma <orders@leomedpharma.in>'

// ─── Shared helpers ─────────────────────────────────────────────────────────

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
      <div style="display:inline-block;background:#f0fdf4;border:2px solid #bbf7d0;border-radius:16px;padding:20px 48px">
        <span style="font-size:42px;font-weight:800;letter-spacing:14px;color:#166534;font-family:monospace">${otp}</span>
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
