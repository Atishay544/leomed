import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Leomed Pharma — OTC Medicines & Wellness Online India'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OGImage() {
  return new ImageResponse(
    <div style={{
      background: 'linear-gradient(135deg, #0a1f14 0%, #123a26 50%, #0a1f14 100%)',
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '60px',
      position: 'relative',
    }}>
      {/* Green accent bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '6px',
        background: 'linear-gradient(90deg, #145C3A, #2F9E6B, #145C3A)',
      }} />
      {/* Brand name */}
      <div style={{
        color: '#2F9E6B',
        fontSize: 72,
        fontWeight: 900,
        letterSpacing: '-2px',
        marginBottom: '16px',
        textShadow: '0 2px 20px rgba(47,158,107,0.35)',
      }}>
        Leomed Pharma
      </div>
      {/* Tagline */}
      <div style={{
        color: '#cccccc',
        fontSize: 28,
        letterSpacing: '2px',
        textTransform: 'uppercase',
        marginBottom: '8px',
      }}>
        OTC Medicines &amp; Wellness Online
      </div>
      {/* Sub-line */}
      <div style={{
        color: '#888888',
        fontSize: 20,
        marginTop: '12px',
      }}>
        Genuine Products · Fast Delivery Across India
      </div>
      {/* Bottom accent bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '6px',
        background: 'linear-gradient(90deg, #145C3A, #2F9E6B, #145C3A)',
      }} />
    </div>,
    size
  )
}
