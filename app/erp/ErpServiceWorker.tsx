'use client'

import { useEffect } from 'react'

/** Registers public/sw.js, scoped to /erp only — the storefront stays a
 *  plain website. Renders nothing; this is a side effect, not UI. */
export default function ErpServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/erp/' }).catch(() => {
      // Installable-ness is a nice-to-have, not load-bearing — a registration
      // failure (e.g. unsupported browser, dev-mode quirks) must never block
      // or error the actual app.
    })
  }, [])

  return null
}
