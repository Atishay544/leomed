import type { Metadata } from 'next'
import FaqClient from './FaqClient'
import { FAQS } from './faq-data'

export const revalidate = 86400

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.leomedpharma.in'

export const metadata: Metadata = {
  title: 'Frequently Asked Questions',
  description: 'Find answers to common questions about orders, shipping, returns, payments, and your account at Leomed Pharma.',
  alternates: { canonical: `${BASE_URL}/faq` },
  openGraph: {
    title: 'FAQ — Leomed Pharma',
    description: 'Find answers to common questions about orders, shipping, returns, payments, and your account.',
    url: `${BASE_URL}/faq`,
    type: 'website',
    siteName: 'Leomed Pharma',
  },
  twitter: {
    card: 'summary',
    title: 'FAQ — Leomed Pharma',
    description: 'Find answers to common questions about orders, shipping, returns, payments, and your account.',
  },
}

export default function FaqPage() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.flatMap(s => s.items).map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <FaqClient />
    </>
  )
}
