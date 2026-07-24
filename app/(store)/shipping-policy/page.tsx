export const revalidate = 86400

import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Shipping Policy',
  description: 'Delivery times, shipping rates, and carriers we use.',
}

export default function ShippingPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8">
        <p className="text-sm text-gray-500 mb-2">Last updated: July 2026</p>
        <h1 className="text-3xl font-bold text-gray-900">Shipping Policy</h1>
        <p className="text-gray-600 mt-3">We aim to get your order to you as quickly and safely as possible. Here's everything you need to know about our shipping.</p>
      </div>

      <div className="space-y-8 text-gray-700">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Free Shipping</h2>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-800 font-medium">
            🎉 Free shipping on all orders above ₹499
          </div>
          <p className="mt-3">Orders below ₹499 are charged a flat shipping fee of ₹49.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Delivery Timeframes</h2>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-136 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Location</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Estimated Delivery</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Shipping Fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="px-4 py-3">Metro cities (Mumbai, Delhi, Bengaluru, Chennai, Hyderabad, Pune, Kolkata)</td>
                  <td className="px-4 py-3 font-medium">1–3 business days</td>
                  <td className="px-4 py-3">Free above ₹499</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Tier-2 &amp; Tier-3 cities</td>
                  <td className="px-4 py-3 font-medium">3–5 business days</td>
                  <td className="px-4 py-3">Free above ₹499</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Remote &amp; rural areas</td>
                  <td className="px-4 py-3 font-medium">5–8 business days</td>
                  <td className="px-4 py-3">Free above ₹499</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-500 mt-2">Business days are Monday–Saturday, excluding public holidays.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Order Processing</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Orders placed before <strong>2:00 PM IST</strong> on a business day are typically dispatched the same day.</li>
            <li>Orders placed after 2:00 PM or on weekends/holidays are dispatched the next business day.</li>
            <li>You'll receive a shipping confirmation email with a tracking number once your order is dispatched.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Tracking Your Order</h2>
          <p>Once your order is shipped:</p>
          <ol className="list-decimal pl-5 space-y-1 mt-2">
            <li>You'll receive an email with your tracking number and carrier link.</li>
            <li>Log in and visit <Link href="/account/orders" className="text-black underline underline-offset-2">My Orders</Link> to see live status updates.</li>
            <li>You can also ask our <Link href="/contact" className="text-black underline underline-offset-2">support chat</Link> — our bot will pull up your tracking instantly.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Shipping Partners</h2>
          <p>We work with leading logistics partners including Delhivery, Bluedart, DTDC, and India Post to ensure reliable and timely delivery across India.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Packaging &amp; Handling of Health Products</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>All medicines and health products are packed in tamper-evident, sealed packaging.</li>
            <li>We only ship products with adequate shelf life remaining at the time of dispatch.</li>
            <li>Please inspect the seal and packaging on delivery — do not accept or consume any product with a broken seal or damaged packaging.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Failed Delivery Attempts</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Our courier partner will attempt delivery up to 3 times.</li>
            <li>After 3 failed attempts, the package is returned to us.</li>
            <li>We'll contact you to arrange re-delivery (additional shipping charges may apply) or issue a refund (excluding original shipping cost).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Damaged in Transit</h2>
          <p>If your order arrives damaged, please <Link href="/contact" className="text-black underline underline-offset-2">contact us within 48 hours</Link> with photos. We'll arrange a replacement or full refund at no cost to you.</p>
        </section>

        <div className="border-t border-gray-200 pt-6 mt-8">
          <p className="text-sm text-gray-500">Questions about your shipment? <Link href="/contact" className="text-black underline underline-offset-2">Chat with our support team</Link> — we respond within 4 hours.</p>
        </div>
      </div>
    </div>
  )
}
