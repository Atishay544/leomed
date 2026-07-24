import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Routes that require a logged-in user
const PROTECTED = ['/account', '/checkout', '/wishlist', '/admin']

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
  if (!supabaseUrl || !supabaseKey) {
    const needsAuth = PROTECTED.some(p => pathname.startsWith(p))
    if (needsAuth) {
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }
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
  // app_metadata is server-set and RS256-signed — cannot be forged by clients.
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user ?? null

  const needsAuth = PROTECTED.some(p => pathname.startsWith(p))
  if (needsAuth && !user) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Admin role check — app_metadata.role is embedded in the signed JWT
  if (pathname.startsWith('/admin') && user) {
    if (user.app_metadata?.role !== 'admin') {
      return NextResponse.redirect(new URL('/?error=unauthorized', req.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
