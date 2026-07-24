export const revalidate = 86400

import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How we collect, use, and protect your personal information.',
}

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8">
        <p className="text-sm text-gray-500 mb-2">Last updated: July 2026</p>
        <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
        <p className="text-gray-600 mt-3">We respect your privacy, especially when it comes to your health information. This policy explains what data we collect, how we use it, and your rights over it.</p>
      </div>

      <div className="space-y-8 text-gray-700">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Information We Collect</h2>
          <h3 className="font-medium text-gray-800 mt-4 mb-2">Information you provide</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Name, email address, phone number when you create an account</li>
            <li>Shipping and billing addresses</li>
            <li>Payment information (processed securely by Razorpay — we never store card details)</li>
            <li>Messages sent through our chat support or contact form</li>
            <li>Product reviews and ratings you submit</li>
            <li>Health-related information you choose to share with us (e.g. product preferences relevant to your order) — we treat this as sensitive personal data under India's Digital Personal Data Protection (DPDP) Act, 2023 and apply additional safeguards to it</li>
          </ul>
          <h3 className="font-medium text-gray-800 mt-4 mb-2">Information collected automatically</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Device type, browser, and operating system</li>
            <li>IP address and approximate location</li>
            <li>Pages visited, time spent, and clickstream data</li>
            <li>Cookies and similar tracking technologies</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">2. How We Use Your Information</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>To process and fulfil your orders</li>
            <li>To send order confirmations, shipping updates, and invoices</li>
            <li>To respond to your support requests and enquiries</li>
            <li>To personalise your shopping experience and product recommendations</li>
            <li>To detect and prevent fraud and abuse</li>
            <li>To improve our website, products, and services</li>
            <li>To send promotional emails (only with your consent — you can unsubscribe at any time)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Cookies</h2>
          <p>We use cookies to:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Keep you logged in and maintain your shopping cart</li>
            <li>Remember your preferences (currency, language)</li>
            <li>Analyse site traffic (via anonymised analytics)</li>
          </ul>
          <p className="mt-3">You can disable cookies in your browser settings, but some features of the site may not work correctly.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Sharing Your Information</h2>
          <p>We do <strong>not</strong> sell your personal data. We may share it only with:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>Delivery partners</strong> — your name, address, and phone for order fulfilment</li>
            <li><strong>Payment processors</strong> — Razorpay, for secure payment processing</li>
            <li><strong>Cloud infrastructure</strong> — Supabase and Vercel for hosting and database</li>
            <li><strong>Legal authorities</strong> — only when required by law</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Sensitive Health Data</h2>
          <p>Any health-related information you share with us is treated as sensitive personal data. We:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Never sell or share it with advertisers or data brokers</li>
            <li>Restrict internal access to staff who need it to fulfil your order</li>
            <li>Do not use it to make automated decisions about your eligibility for products or services</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Data Retention</h2>
          <p>We retain your personal data for as long as your account is active or as needed to provide services. Order records are kept for 7 years for accounting and tax compliance. You may request deletion of your account at any time (see Your Rights below).</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Your Rights</h2>
          <p>You have the right to:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>Access</strong> — request a copy of your personal data</li>
            <li><strong>Correction</strong> — update inaccurate information in your account</li>
            <li><strong>Deletion</strong> — request deletion of your account and data</li>
            <li><strong>Portability</strong> — receive your data in a machine-readable format</li>
            <li><strong>Opt-out</strong> — unsubscribe from marketing emails at any time</li>
          </ul>
          <p className="mt-3">To exercise any of these rights, <Link href="/contact" className="text-black underline underline-offset-2">contact us</Link>.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Security</h2>
          <p>We use industry-standard security measures including TLS encryption, row-level security on our database, and two-factor authentication for admin access. However, no method of internet transmission is 100% secure.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Children's Privacy</h2>
          <p>Our services are not directed at children under 13. We do not knowingly collect personal information from children.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">10. Changes to This Policy</h2>
          <p>We may update this policy periodically. We will notify you of significant changes by email or by posting a notice on our website. Continued use of our services after changes constitutes acceptance of the updated policy.</p>
        </section>

        <div className="border-t border-gray-200 pt-6 mt-8">
          <p className="text-sm text-gray-500">Questions about this policy? <Link href="/contact" className="text-black underline underline-offset-2">Contact us</Link> — we'll respond within 2 business days.</p>
        </div>
      </div>
    </div>
  )
}
