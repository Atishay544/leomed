export const revalidate = 86400

import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms and conditions governing use of this website.',
}

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8">
        <p className="text-sm text-gray-500 mb-2">Last updated: September 2026</p>
        <h1 className="text-3xl font-bold text-gray-900">Terms of Service</h1>
        <p className="text-gray-600 mt-3">Please read these terms carefully before using this website. By accessing or using it, you agree to these terms.</p>
      </div>

      <div className="space-y-8 text-gray-700">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Acceptance of Terms</h2>
          <p>By accessing or using this website, you confirm that you have the legal capacity to agree to these Terms of Service and our <Link href="/privacy-policy" className="text-black underline underline-offset-2">Privacy Policy</Link>.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">2. About This Website</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>This website is an informational product catalogue for Leomed Pharma. There is no shopping cart, checkout, or online payment anywhere on the site.</li>
            <li>No account or registration is required to browse the catalogue.</li>
            <li>Leomed Pharma sells through a distributor and retail network — purchases, pricing, deliveries, returns and refunds are arranged directly between distributors, retailers, chemists, doctors and customers through their own commercial channels, not through this website.</li>
            <li>Product images and information are for illustration and informational purposes; actual items, packaging, and pricing may vary by distributor and region. MRP and pack size shown on a product page are informational only, not a checkout price.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Product Use &amp; Medical Disclaimer</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Leomed Pharma manufactures and distributes over-the-counter (OTC) medicines, health devices, personal care, and wellness products only. We do not sell or dispense prescription (Rx) drugs.</li>
            <li>Product descriptions are provided for informational purposes and do not constitute medical advice. Always read the product label and package insert before use.</li>
            <li>Consult a registered medical practitioner or pharmacist before use if you are pregnant, nursing, have an existing medical condition, or are taking other medication.</li>
            <li>In case of adverse reaction, discontinue use immediately and seek medical attention.</li>
            <li>We are not liable for misuse of any product.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Prohibited Use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Use the site for any unlawful purpose or in violation of any applicable laws</li>
            <li>Attempt to gain unauthorised access to our systems or data</li>
            <li>Scrape, crawl, or harvest any content from the site without permission</li>
            <li>Transmit spam, malware, or any malicious code</li>
            <li>Impersonate any person or entity</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Intellectual Property</h2>
          <p>All content on this website — including text, images, logos, and code — is our property or used with permission. You may not reproduce, distribute, or create derivative works without our written consent.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Limitation of Liability</h2>
          <p>To the fullest extent permitted by law, we shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of this website or of any product manufactured or distributed by Leomed Pharma. Since products are purchased through distributors and retailers rather than this website, any dispute over a specific purchase should be raised with the seller first.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Governing Law</h2>
          <p>These terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in India.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Changes to Terms</h2>
          <p>We may update these terms at any time. Continued use of the site after changes are posted constitutes your acceptance of the new terms.</p>
        </section>

        <div className="border-t border-gray-200 pt-6 mt-8">
          <p className="text-sm text-gray-500">Questions? <Link href="/contact" className="text-black underline underline-offset-2">Contact us</Link>.</p>
        </div>
      </div>
    </div>
  )
}
