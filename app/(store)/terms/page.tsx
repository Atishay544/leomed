export const revalidate = 86400

import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms and conditions governing use of our store and services.',
}

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8">
        <p className="text-sm text-gray-500 mb-2">Last updated: July 2026</p>
        <h1 className="text-3xl font-bold text-gray-900">Terms of Service</h1>
        <p className="text-gray-600 mt-3">Please read these terms carefully before using our store. By placing an order or creating an account, you agree to these terms.</p>
      </div>

      <div className="space-y-8 text-gray-700">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Acceptance of Terms</h2>
          <p>By accessing or using this website, you confirm that you are at least 18 years of age (or have parental consent), have the legal capacity to enter into a binding contract, and agree to these Terms of Service and our <Link href="/privacy-policy" className="text-black underline underline-offset-2">Privacy Policy</Link>.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Account Registration</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
            <li>You must provide accurate and complete information during registration.</li>
            <li>You are responsible for all activity that occurs under your account.</li>
            <li>You must notify us immediately of any unauthorised use of your account.</li>
            <li>We reserve the right to terminate accounts that violate these terms.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Products and Pricing</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>All prices are listed in Indian Rupees (₹) and are inclusive of applicable taxes.</li>
            <li>We reserve the right to change prices at any time without notice.</li>
            <li>Product images are for illustration purposes; actual items may vary slightly.</li>
            <li>We cannot guarantee that all products are always in stock.</li>
            <li>In the event of a pricing error, we will notify you and give you the option to proceed at the correct price or cancel.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Orders and Payment</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Placing an order constitutes an offer to purchase; acceptance occurs when we confirm the order by email.</li>
            <li>We reserve the right to cancel or refuse any order at our discretion.</li>
            <li>Payment is processed securely through Razorpay. We accept major credit/debit cards and UPI.</li>
            <li>Orders will not be processed until payment is confirmed.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Product Use &amp; Medical Disclaimer</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>We sell over-the-counter (OTC) medicines, health devices, personal care, and wellness products only. We do not sell or dispense prescription (Rx) drugs through this website.</li>
            <li>Product descriptions are provided for informational purposes and do not constitute medical advice. Always read the product label and package insert before use.</li>
            <li>Consult a registered medical practitioner or pharmacist before use if you are pregnant, nursing, have an existing medical condition, or are taking other medication.</li>
            <li>In case of adverse reaction, discontinue use immediately and seek medical attention.</li>
            <li>We are not liable for misuse of any product purchased through this site.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Prohibited Use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Use the site for any unlawful purpose or in violation of any applicable laws</li>
            <li>Attempt to gain unauthorised access to our systems or data</li>
            <li>Scrape, crawl, or harvest any content from the site without permission</li>
            <li>Transmit spam, malware, or any malicious code</li>
            <li>Impersonate any person or entity</li>
            <li>Engage in fraudulent transactions or chargebacks</li>
            <li>Submit false or misleading reviews</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Intellectual Property</h2>
          <p>All content on this website — including text, images, logos, and code — is our property or used with permission. You may not reproduce, distribute, or create derivative works without our written consent.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Limitation of Liability</h2>
          <p>To the fullest extent permitted by law, we shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of our services or products. Our total liability for any claim shall not exceed the amount you paid for the relevant order.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Returns and Refunds</h2>
          <p>Returns and refunds are governed by our <Link href="/refund-policy" className="text-black underline underline-offset-2">Refund &amp; Returns Policy</Link>, which forms part of these terms.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">10. Governing Law</h2>
          <p>These terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in India.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">11. Changes to Terms</h2>
          <p>We may update these terms at any time. Continued use of the site after changes are posted constitutes your acceptance of the new terms.</p>
        </section>

        <div className="border-t border-gray-200 pt-6 mt-8">
          <p className="text-sm text-gray-500">Questions? <Link href="/contact" className="text-black underline underline-offset-2">Contact us</Link>.</p>
        </div>
      </div>
    </div>
  )
}
