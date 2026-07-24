import { BetaAnalyticsDataClient } from '@google-analytics/data'

const PROPERTY_ID = process.env.GA4_PROPERTY_ID

function getCredentials() {
  const b64 = process.env.GA4_SERVICE_ACCOUNT_B64
  if (!b64 || !PROPERTY_ID) return null
  try {
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'))
  } catch {
    return null
  }
}

export async function getGA4VisitorStats(): Promise<{ visitorsToday: number; visitors30d: number }> {
  const credentials = getCredentials()
  if (!credentials) return { visitorsToday: 0, visitors30d: 0 }

  try {
    const client = new BetaAnalyticsDataClient({ credentials })
    const [res] = await client.runReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [
        { startDate: 'today',       endDate: 'today'  },
        { startDate: '30daysAgo',   endDate: 'today'  },
      ],
      metrics: [{ name: 'activeUsers' }],
    })
    const rows = res.rows ?? []
    return {
      visitorsToday: parseInt(rows[0]?.metricValues?.[0]?.value ?? '0'),
      visitors30d:   parseInt(rows[1]?.metricValues?.[0]?.value ?? '0'),
    }
  } catch (e) {
    console.error('[ga4] visitor stats error:', e)
    return { visitorsToday: 0, visitors30d: 0 }
  }
}

export async function getGA4RealtimeUsers(): Promise<number> {
  const credentials = getCredentials()
  if (!credentials) return 0

  try {
    const client = new BetaAnalyticsDataClient({ credentials })
    const [res] = await client.runRealtimeReport({
      property: `properties/${PROPERTY_ID}`,
      metrics: [{ name: 'activeUsers' }],
    })
    return parseInt(res.rows?.[0]?.metricValues?.[0]?.value ?? '0')
  } catch (e) {
    console.error('[ga4] realtime error:', e)
    return 0
  }
}
