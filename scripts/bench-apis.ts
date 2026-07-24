/**
 * API Benchmark — measures real response-time for every route.
 *
 * Usage:
 *   npx tsx scripts/bench-apis.ts
 *
 * Env vars (optional):
 *   BASE_URL      – defaults to http://localhost:3000
 *   ADMIN_COOKIE  – full Cookie header for an admin session, e.g.
 *                   "sb-xxx-auth-token=..."
 *                   Without this, admin routes are tested for auth-rejection
 *                   latency (still exercises getUser() overhead).
 *   RUNS          – number of back-to-back runs per endpoint (default 3)
 *   WARMUP        – warmup runs before timing begins (default 1)
 */

const BASE_URL    = process.env.BASE_URL    ?? 'http://localhost:3000'
const ADMIN_COOKIE= process.env.ADMIN_COOKIE ?? ''
const RUNS        = Number(process.env.RUNS   ?? 3)
const WARMUP      = Number(process.env.WARMUP ?? 1)

// ── ANSI colours ──────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  orange: '\x1b[38;5;208m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
}

function colour(ms: number): string {
  if (ms <  100) return C.green
  if (ms <  200) return C.yellow
  if (ms <  300) return C.orange
  return C.red
}

function badge(ms: number): string {
  if (ms < 300) return `${C.green}✓ PASS${C.reset}`
  return `${C.red}✗ FAIL >300ms${C.reset}`
}

// ── Timing helper ─────────────────────────────────────────────────────────────
async function time(fn: () => Promise<Response>): Promise<{ ms: number; status: number }> {
  const t0 = performance.now()
  const res = await fn()
  const ms = Math.round(performance.now() - t0)
  return { ms, status: res.status }
}

async function bench(
  label: string,
  method: string,
  path: string,
  body?: Record<string, unknown> | FormData,
  headers: Record<string, string> = {},
): Promise<{ avg: number; min: number; max: number; status: number }> {
  const url = `${BASE_URL}${path}`

  const buildInit = (): RequestInit => {
    const h: Record<string, string> = { ...headers }
    let bodyInit: BodyInit | undefined

    if (body instanceof FormData) {
      bodyInit = body
      // don't set Content-Type — browser sets it with boundary
    } else if (body !== undefined) {
      h['Content-Type'] = 'application/json'
      bodyInit = JSON.stringify(body)
    }

    return { method, headers: h, body: bodyInit }
  }

  // Warmup (not counted)
  for (let i = 0; i < WARMUP; i++) {
    try { await fetch(url, buildInit()) } catch {}
  }

  const results: { ms: number; status: number }[] = []
  for (let i = 0; i < RUNS; i++) {
    try {
      results.push(await time(() => fetch(url, buildInit())))
    } catch (e: any) {
      results.push({ ms: -1, status: 0 })
    }
  }

  const valid = results.filter(r => r.ms >= 0)
  const avg   = valid.length ? Math.round(valid.reduce((s, r) => s + r.ms, 0) / valid.length) : -1
  const min   = valid.length ? Math.min(...valid.map(r => r.ms)) : -1
  const max   = valid.length ? Math.max(...valid.map(r => r.ms)) : -1
  const status = results[results.length - 1]?.status ?? 0

  return { avg, min, max, status }
}

// ── Print row ─────────────────────────────────────────────────────────────────
function row(
  label: string,
  method: string,
  path: string,
  result: { avg: number; min: number; max: number; status: number },
  note = '',
) {
  const { avg, min, max, status } = result
  const c  = colour(avg)
  const m  = method.padEnd(6)
  const lbl = label.padEnd(40)
  const timing = avg >= 0
    ? `${c}${String(avg).padStart(4)}ms${C.reset} ${C.dim}(min ${min} / max ${max})${C.reset}`
    : `${C.red}  ERR${C.reset}`
  const b  = avg >= 0 ? badge(avg) : `${C.red}✗ ERROR${C.reset}`
  const s  = status === 0 ? '' : `${C.dim}[${status}]${C.reset}`
  const n  = note ? ` ${C.dim}${note}${C.reset}` : ''
  console.log(`  ${C.bold}${m}${C.reset} ${lbl} ${timing}  ${b} ${s}${n}`)
}

// ── Admin headers ─────────────────────────────────────────────────────────────
const adminHeaders: Record<string, string> = ADMIN_COOKIE
  ? { Cookie: ADMIN_COOKIE }
  : {}

const authNote = ADMIN_COOKIE
  ? ''
  : `${C.yellow}(no ADMIN_COOKIE — testing auth-rejection latency)${C.reset}`

// ── Test cases ────────────────────────────────────────────────────────────────
async function run() {
  console.log()
  console.log(`${C.bold}${C.cyan}╔══════════════════════════════════════════════════════════════════╗${C.reset}`)
  console.log(`${C.bold}${C.cyan}║         ecom API Benchmark  —  target: <300ms                    ║${C.reset}`)
  console.log(`${C.bold}${C.cyan}╚══════════════════════════════════════════════════════════════════╝${C.reset}`)
  console.log(`  ${C.dim}Base URL : ${BASE_URL}${C.reset}`)
  console.log(`  ${C.dim}Runs     : ${RUNS} (+ ${WARMUP} warmup)${C.reset}`)
  console.log(`  ${C.dim}Legend   : ${C.green}green <100ms${C.reset}  ${C.yellow}yellow <200ms${C.reset}  ${C.orange}orange <300ms${C.reset}  ${C.red}red ≥300ms${C.reset}`)
  console.log()

  // ── PUBLIC ROUTES ──────────────────────────────────────────────────────────
  console.log(`${C.bold}PUBLIC ROUTES${C.reset}`)

  // POST /api/contact
  row(
    '/api/contact — POST',
    'POST',
    '/api/contact',
    await bench('contact POST', 'POST', '/api/contact', {
      name: 'Bench User', email: 'bench@test.com',
      subject: 'Test', message: 'Benchmark test message for API timing.',
    }),
    '(inserts chat_session + message)',
  )

  // POST /api/checkout/validate-coupon (bad code — exercises DB lookup fast-path)
  row(
    '/api/checkout/validate-coupon — POST',
    'POST',
    '/api/checkout/validate-coupon',
    await bench('validate-coupon POST', 'POST', '/api/checkout/validate-coupon', {
      code: 'BENCH_INVALID_XYZ', subtotal: 99.99,
    }),
    '(expects 400 — bad code — still hits DB)',
  )

  // POST /api/chat/bot-reply (greeting intent, fake session → 404, exercises classify+parallel)
  row(
    '/api/chat/bot-reply — POST (greeting)',
    'POST',
    '/api/chat/bot-reply',
    await bench('bot-reply greeting', 'POST', '/api/chat/bot-reply', {
      session_id: '00000000-0000-0000-0000-000000000000',
      message: 'hello',
    }),
    '(expects 404 — session not found — exercises session check)',
  )

  // POST /api/chat/bot-reply (order intent — exercises parallel session+orders query)
  row(
    '/api/chat/bot-reply — POST (order intent)',
    'POST',
    '/api/chat/bot-reply',
    await bench('bot-reply order', 'POST', '/api/chat/bot-reply', {
      session_id: '00000000-0000-0000-0000-000000000000',
      message: 'where is my order',
      user_id: null,
    }),
    '(order intent, no user — exercises classify branch)',
  )

  // POST /api/chat/bot-reply (fallback intent — exercises parallel count query)
  row(
    '/api/chat/bot-reply — POST (fallback)',
    'POST',
    '/api/chat/bot-reply',
    await bench('bot-reply fallback', 'POST', '/api/chat/bot-reply', {
      session_id: '00000000-0000-0000-0000-000000000000',
      message: 'asdfqwertyzxcv',
    }),
    '(fallback intent — exercises parallel count branch)',
  )

  console.log()

  // ── ADMIN ROUTES ──────────────────────────────────────────────────────────
  console.log(`${C.bold}ADMIN ROUTES${C.reset}  ${authNote}`)

  // Coupons
  row(
    '/api/admin/coupons — POST',
    'POST',
    '/api/admin/coupons',
    await bench('coupons POST', 'POST', '/api/admin/coupons', {
      code: `BENCH${Date.now()}`, type: 'percentage', value: 10,
    }, adminHeaders),
  )

  row(
    '/api/admin/coupons — PATCH',
    'PATCH',
    '/api/admin/coupons',
    await bench('coupons PATCH', 'PATCH', '/api/admin/coupons', {
      id: '00000000-0000-0000-0000-000000000000', is_active: false,
    }, adminHeaders),
  )

  // Banners
  row(
    '/api/admin/banners — POST',
    'POST',
    '/api/admin/banners',
    await bench('banners POST', 'POST', '/api/admin/banners', {
      title: 'Bench Banner', is_active: true, sort_order: 99,
    }, adminHeaders),
  )

  row(
    '/api/admin/banners — PATCH',
    'PATCH',
    '/api/admin/banners',
    await bench('banners PATCH', 'PATCH', '/api/admin/banners', {
      id: '00000000-0000-0000-0000-000000000000', title: 'Updated',
    }, adminHeaders),
  )

  // Announcements
  row(
    '/api/admin/announcements — POST',
    'POST',
    '/api/admin/announcements',
    await bench('announcements POST', 'POST', '/api/admin/announcements', {
      message: 'Bench announcement', is_active: true,
    }, adminHeaders),
  )

  row(
    '/api/admin/announcements — PATCH',
    'PATCH',
    '/api/admin/announcements',
    await bench('announcements PATCH', 'PATCH', '/api/admin/announcements', {
      id: '00000000-0000-0000-0000-000000000000', is_active: false,
    }, adminHeaders),
  )

  // Products
  row(
    '/api/admin/products — POST',
    'POST',
    '/api/admin/products',
    await bench('products POST', 'POST', '/api/admin/products', {
      name: `Bench Product ${Date.now()}`,
      slug: `bench-product-${Date.now()}`,
      price: '9.99', stock: '100', is_active: false,
    }, adminHeaders),
  )

  row(
    '/api/admin/products — PATCH',
    'PATCH',
    '/api/admin/products',
    await bench('products PATCH', 'PATCH', '/api/admin/products', {
      id: '00000000-0000-0000-0000-000000000000',
      name: 'Bench Updated', price: '19.99',
    }, adminHeaders),
  )

  // Upload image (tiny 1×1 PNG — tests auth+bucket+upload path, not transfer time)
  const oneByOnePng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  )
  const imgForm = new FormData()
  imgForm.append('file', new Blob([oneByOnePng], { type: 'image/png' }), 'bench.png')
  row(
    '/api/admin/upload-image — POST',
    'POST',
    '/api/admin/upload-image',
    await bench('upload-image POST', 'POST', '/api/admin/upload-image', imgForm, adminHeaders),
    '(1×1 PNG — auth + bucket + storage upload)',
  )

  // Upload video — tiny mp4 stub (tests auth path; actual upload skipped if auth fails)
  const mp4Stub = Buffer.from('AAAAIAAAAAAAAAA=', 'base64') // not a real mp4 — fails content check if authed
  const vidForm = new FormData()
  vidForm.append('file', new Blob([mp4Stub], { type: 'video/mp4' }), 'bench.mp4')
  row(
    '/api/admin/upload-video — POST',
    'POST',
    '/api/admin/upload-video',
    await bench('upload-video POST', 'POST', '/api/admin/upload-video', vidForm, adminHeaders),
    '(stub mp4 — exercises auth + bucket check)',
  )

  console.log()

  // ── SUMMARY ────────────────────────────────────────────────────────────────
  console.log(`${C.bold}Tips:${C.reset}`)
  console.log(`  ${C.dim}• Set ADMIN_COOKIE env var to get real admin timings${C.reset}`)
  console.log(`  ${C.dim}• Set app_metadata.role='admin' in Supabase to skip DB profile check${C.reset}`)
  console.log(`  ${C.dim}• Green = <100ms  Yellow = <200ms  Orange = <300ms  Red = >300ms${C.reset}`)
  console.log(`  ${C.dim}• Auth routes without ADMIN_COOKIE show getUser() latency only${C.reset}`)
  console.log()
}

run().catch(err => {
  console.error('Benchmark error:', err)
  process.exit(1)
})
