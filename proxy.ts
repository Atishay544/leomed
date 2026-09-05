import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// The storefront has no public accounts any more. Two staff doors share the
// same underlying identity (erp_users): /erp/login for all field-force
// staff, /admin/login as a second, admin-branded door onto the storefront
// catalogue/content panel (gated on erp_users.role = 'ADMIN'). An ADMIN
// account can also still use /erp/login — the doors are cosmetic, not a
// separate account system.
const ERP_ROOT    = '/erp'
const ERP_LOGIN   = '/erp/login'
const ADMIN_ROOT  = '/admin'
const ADMIN_LOGIN = '/admin/login'

function loginPathFor(pathname: string) {
  return pathname.startsWith(ADMIN_ROOT) ? ADMIN_LOGIN : ERP_LOGIN
}

function needsStaffAuth(pathname: string) {
  if (pathname.startsWith(ERP_LOGIN) || pathname.startsWith(ADMIN_LOGIN)) return false
  return pathname.startsWith(ERP_ROOT) || pathname.startsWith(ADMIN_ROOT)
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Block attack paths
  const blockedPaths = ['/wp-admin', '/wp-login', '/phpmyadmin', '/.env', '/admin.php', '/xmlrpc.php']
  if (blockedPaths.some(p => pathname.startsWith(p))) return new NextResponse(null, { status: 404 })

  // Block scanner UAs
  const ua = req.headers.get('user-agent') ?? ''
  const badAgents = ['sqlmap', 'nikto', 'masscan', 'nmap', 'dirbuster', 'gobuster']
  if (badAgents.some(b => ua.toLowerCase().includes(b))) return new NextResponse(null, { status: 403 })

  let response = NextResponse.next({ request: req })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  // This is a cheap edge gate only: "is anyone signed in at all?" The
  // authoritative check — is this signed-in user active staff, and do they
  // hold the ADMIN role for /admin — happens server-side in
  // lib/erp/auth.ts / lib/admin-auth.ts, because a JWT claim can go stale
  // (deactivated overnight, role changed) while the cookie is still valid.
  const staffGate = needsStaffAuth(pathname)

  if (!supabaseUrl || !supabaseKey) {
    if (staffGate) return NextResponse.redirect(new URL(loginPathFor(pathname), req.url))
    return response
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
        response = NextResponse.next({ request: req })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  // getSession() decodes JWT from cookie locally — no Supabase API call (~1ms).
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user ?? null

  if (staffGate && !user) {
    const loginUrl = new URL(loginPathFor(pathname), req.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
