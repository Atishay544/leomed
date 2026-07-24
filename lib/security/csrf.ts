import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_ORIGINS = new Set([
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.leomedpharma.in',
  'https://www.leomedpharma.in',
  'https://leomedpharma.in',
  'http://localhost:3000',
  'http://localhost:3001',
])

/**
 * Validates that the request Origin matches our app domain.
 * Returns a 403 response if the check fails, null if it passes.
 * Use this on every state-mutating API route (POST/PATCH/DELETE).
 */
export function assertSameOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get('origin')

  // Requests without Origin header are same-origin or server-to-server — allow.
  // (Browsers always send Origin on cross-origin requests.)
  if (!origin) return null

  if (!ALLOWED_ORIGINS.has(origin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return null
}
