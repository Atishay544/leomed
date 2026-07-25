import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? ''

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.leomedpharma.in'

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "Leomed Pharma — OTC Medicines & Wellness Online India",
    template: "%s | Leomed Pharma",
  },
  icons: {
    icon: [
      { url: '/logo.jpeg', type: 'image/jpeg' },
    ],
    apple: '/logo.jpeg',
    shortcut: '/logo.jpeg',
  },
  description: "Shop OTC medicines, health devices, personal care, and wellness products online at Leomed Pharma. Fast delivery, genuine products, trusted across India.",
  keywords: [
    "leomed pharma", "leomedpharma", "leomedpharma.in",
    "otc medicines online india", "buy medicines online india", "online pharmacy india",
    "wellness products online", "health devices online india", "personal care online india",
    "ayurvedic products online", "supplements online india",
  ],
  authors: [{ name: "Leomed Pharma", url: BASE_URL }],
  creator: "Leomed Pharma",
  publisher: "Leomed Pharma",
  category: "healthcare",
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: BASE_URL,
    siteName: "Leomed Pharma",
    title: "Leomed Pharma — OTC Medicines & Wellness Online India",
    description: "Shop OTC medicines, health devices, personal care, and wellness products online at Leomed Pharma.",
    images: [
      {
        url: `/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "Leomed Pharma — OTC Medicines & Wellness Online India",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Leomed Pharma — OTC Medicines & Wellness Online India",
    description: "Shop OTC medicines, health devices, personal care, and wellness products online at Leomed Pharma.",
    images: [`/opengraph-image`],
  },
  alternates: {
    canonical: BASE_URL,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    // Add your Google Search Console verification token here once you have it
    // google: 'your-verification-token',
  },
};

// Organization + WebSite + OnlineStore JSON-LD
const orgJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": ["Organization", "Pharmacy"],
      "@id": `${BASE_URL}/#organization`,
      name: "Leomed Pharma",
      alternateName: ["LeomedPharma"],
      url: BASE_URL,
      logo: {
        "@type": "ImageObject",
        "@id": `${BASE_URL}/#logo`,
        url: `${BASE_URL}/opengraph-image`,
        width: 1200,
        height: 630,
        caption: "Leomed Pharma",
      },
      image: { "@id": `${BASE_URL}/#logo` },
      description: "Shop OTC medicines, health devices, personal care, and wellness products online at Leomed Pharma. Pan-India delivery.",
      taxID: "09ADRPT8009N4ZG",
      // TODO: confirm full registered address (city/pincode not visible on the shop signboard photo used for this)
      address: {
        "@type": "PostalAddress",
        streetAddress: "Gher Kalerai, Hanuman Chowk, Bhagat Singh Road",
        addressRegion: "Uttar Pradesh",
        addressCountry: "IN",
      },
      additionalProperty: [
        { "@type": "PropertyValue", name: "Drug Licence No.", value: "UP1220B001821" },
      ],
      foundingDate: "2026",
      areaServed: { "@type": "Country", name: "India" },
      contactPoint: [
        {
          "@type": "ContactPoint",
          email: "leomedpharma1@gmail.com",
          telephone: "+916398697503",
          contactType: "customer support",
          availableLanguage: ["English", "Hindi"],
          areaServed: "IN",
        },
        {
          "@type": "ContactPoint",
          email: "leomedpharma1@gmail.com",
          contactType: "sales",
          availableLanguage: ["English", "Hindi"],
          areaServed: "IN",
        },
      ],
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: "OTC Medicines & Wellness",
        itemListElement: [
          { "@type": "OfferCatalog", name: "OTC Medicines", url: `${BASE_URL}/products` },
          { "@type": "OfferCatalog", name: "Health Devices", url: `${BASE_URL}/products` },
          { "@type": "OfferCatalog", name: "Personal Care", url: `${BASE_URL}/products` },
          { "@type": "OfferCatalog", name: "Wellness & Supplements", url: `${BASE_URL}/products` },
        ],
      },
      sameAs: [
        "https://www.leomedpharma.in",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${BASE_URL}/#website`,
      url: BASE_URL,
      name: "Leomed Pharma",
      description: "Shop OTC medicines, health devices, personal care, and wellness products online at Leomed Pharma.",
      inLanguage: "en-IN",
      publisher: { "@id": `${BASE_URL}/#organization` },
      potentialAction: [
        {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${BASE_URL}/search?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      ],
    },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}<Analytics /></body>
      {GA_ID && <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />}
      {GA_ID && <Script id="ga4-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${GA_ID}', { send_page_view: true });
      `}} />}
    </html>
  );
}
