import type { Metadata, Viewport } from 'next'
import ErpServiceWorker from './ErpServiceWorker'

/**
 * Wraps the whole /erp tree (the signpost at /erp, /erp/login, and the
 * authenticated app under /erp/(app)) — not just the post-login shell —
 * so the PWA install/standalone-mode metadata applies no matter which of
 * those a visitor's browser happens to be on when they add it to their
 * home screen. See app/manifest.ts for the manifest itself (scope: '/erp').
 */
export const metadata: Metadata = {
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'Leomed ERP',
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  themeColor: '#047857',
}

export default function ErpRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ErpServiceWorker />
      {children}
    </>
  )
}
