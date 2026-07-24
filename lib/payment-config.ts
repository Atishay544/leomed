/**
 * ⚠️  SECURITY-CRITICAL — PAYMENT DESTINATION ⚠️
 *
 * This is the SINGLE SOURCE OF TRUTH for where customer money goes.
 *
 * These values are intentionally HARD-CODED constants — NOT read from the
 * database, environment variables, an API, or any admin setting. That is a
 * deliberate security decision: it means there is NO runtime code path through
 * which an attacker (via a compromised DB row, admin account, env var, stored
 * XSS, or injected request) can redirect customer payments to a different UPI
 * account. The only way to change the payment destination is a reviewed git
 * commit + redeploy.
 *
 * DO NOT:
 *   - make these values come from process.env, the DB, props, or a fetch()
 *   - render them via dangerouslySetInnerHTML
 *   - accept a UPI id / QR url from the client and display or trust it
 *
 * If you change UPI_ID here, you MUST also replace public/QR.jpeg with a QR
 * that encodes the SAME id, in the same commit. They must always match.
 *
 * Protect this with branch protection + required review on main, and 2FA on
 * the git host and Vercel — that is the actual trust boundary for this value.
 */
export const PAYMENT_CONFIG = Object.freeze({
  // TODO — CRITICAL BEFORE LAUNCH: this UPI_ID and public/QR.jpeg still belong to
  // the previous business (Hi Fashions). Replace both with Leomed Pharma's own
  // UPI VPA + matching QR image before accepting any real payments, or customer
  // money will be sent to the wrong account.
  /** Merchant UPI VPA shown next to the QR. Public by nature (printed on the QR). */
  UPI_ID: 'REPLACE_WITH_LEOMED_PHARMA_UPI_ID',
  /** Static QR image in /public that encodes the same UPI_ID above. */
  QR_IMAGE_PATH: '/QR.jpeg',
  /** Display name for the payee. */
  PAYEE_NAME: 'Leomed Pharma',
} as const)

export const UPI_ID = PAYMENT_CONFIG.UPI_ID
export const QR_IMAGE_PATH = PAYMENT_CONFIG.QR_IMAGE_PATH
