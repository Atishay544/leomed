export const revalidate = 86400

import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Refund & Returns Policy',
  description: 'Learn about our returns policy, refund process, and eligibility criteria for medicines and wellness products.',
}

export default function RefundPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8">
        <p className="text-sm text-gray-500 mb-2">Last updated: July 2026</p>
        <h1 className="text-3xl font-bold text-gray-900">Refund &amp; Returns Policy</h1>
      </div>

      <div className="prose prose-gray max-w-none space-y-8 text-gray-700">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Medicines &amp; Health Products — Non-Returnable</h2>
          <p>In line with applicable drug and pharmacy regulations in India, <strong>medicines, health supplements, and other consumable/perishable health products cannot be returned or exchanged once delivered</strong>, except in the specific cases listed under "Damaged, Defective, Expired or Wrong Item" below. This is to ensure product safety and integrity for all customers.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Non-Medicine Items — 7-Day Return Window</h2>
          <p>For non-medicinal items such as health devices, personal care products, and general wellness accessories, you may request a return within <strong>7 days</strong> of delivery, provided the item meets all of the following conditions:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Unused and in its original, unopened packaging with seal intact</li>
            <li>All tags, accessories, and manuals included</li>
            <li>Returned within 7 days of delivery</li>
            <li>Accompanied by proof of purchase (order ID)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Never Returnable</h2>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Medicines, tablets, syrups, and any consumable drug product (Rx or OTC) once dispensed</li>
            <li>Opened or unsealed health/personal care products, for hygiene and safety reasons</li>
            <li>Items with a broken safety seal or tamper-evident packaging</li>
            <li>Products nearing expiry at the time of return request</li>
            <li>Gift cards and promotional/free items</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Damaged, Defective, Expired or Wrong Item</h2>
          <p>If you receive a damaged, defective, expired, near-expiry, or incorrect item, please <Link href="/contact" className="text-black underline underline-offset-2">contact us within 48 hours</Link> of delivery with clear photos of the product, packaging, and label (including batch number and expiry date). We will arrange a replacement or full refund at no extra cost to you — this applies to medicines as well.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">How to Initiate an Eligible Return</h2>
          <ol className="list-decimal pl-5 space-y-2 mt-2">
            <li>Log in to your account and go to <Link href="/account/orders" className="text-black underline underline-offset-2">My Orders</Link>.</li>
            <li>Select the order and click <strong>"Request Return"</strong> (only shown for eligible items).</li>
            <li>Select the item(s) and reason for return.</li>
            <li>We'll email you return instructions within 24 hours.</li>
          </ol>
          <p className="mt-3">Alternatively, <Link href="/contact" className="text-black underline underline-offset-2">contact our support team</Link> and we'll guide you through the process.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Refund Processing</h2>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>We'll notify you by email of the approval or rejection of your return/refund request.</li>
            <li>Approved refunds are processed within <strong>3–5 business days</strong>.</li>
            <li>Refunds are credited to the original payment method.</li>
            <li>Bank processing may take an additional 2–7 business days depending on your bank.</li>
          </ul>
        </section>

        <div className="border-t border-gray-200 pt-6 mt-8">
          <p className="text-sm text-gray-500">Questions? <Link href="/contact" className="text-black underline underline-offset-2">Contact our support team</Link> — we typically respond within 4 business hours.</p>
        </div>
      </div>
    </div>
  )
}
