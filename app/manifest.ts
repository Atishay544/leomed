import type { MetadataRoute } from 'next'

/**
 * Installable app shell for ERP/field staff — MRs, managers, HR, accountants
 * signing in from a phone. The storefront stays a normal website; this is
 * deliberately scoped to /erp so installing it opens straight to the staff
 * portal, not the public shop (see the PWA scope decision this was built
 * from).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Leomed Pharma ERP',
    short_name: 'Leomed ERP',
    description: 'Field force, HR, accounting and admin portal for Leomed Pharma staff.',
    start_url: '/erp',
    scope: '/erp',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#ffffff',
    theme_color: '#047857',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
