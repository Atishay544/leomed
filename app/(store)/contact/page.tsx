export const revalidate = 86400

import type { Metadata } from 'next'
import ContactForm from './ContactForm'
import Link from 'next/link'
import { Mail, MessageCircle, Clock, Phone } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Get in touch with our support team. We respond within 4 hours on business days.',
}

export default function ContactPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-gray-900">Contact Us</h1>
        <p className="text-gray-600 mt-2">We're here to help. Send us a message and we'll get back to you quickly.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Info */}
        <div className="space-y-5">
          <div className="bg-gray-50 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-1">
              <MessageCircle size={18} className="text-gray-700" />
              <h3 className="font-semibold text-gray-900">Live Chat</h3>
            </div>
            <p className="text-sm text-gray-600">Click the chat bubble on any page for instant support from our team or bot.</p>
          </div>

          <div className="bg-gray-50 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-1">
              <Mail size={18} className="text-gray-700" />
              <h3 className="font-semibold text-gray-900">Email</h3>
            </div>
            <a href="mailto:leomedpharma1@gmail.com" className="text-sm text-black underline underline-offset-2">leomedpharma1@gmail.com</a>
            <p className="text-xs text-gray-500 mt-2">Leomed Pharma</p>
          </div>

          <div className="bg-gray-50 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-1">
              <Phone size={18} className="text-gray-700" />
              <h3 className="font-semibold text-gray-900">Phone / WhatsApp</h3>
            </div>
            <a href="tel:+916398697503" className="text-sm text-black underline underline-offset-2">+91 63986 97503</a>
            <p className="text-xs text-gray-500 mt-2">Mon – Sat, 10:00 AM – 7:00 PM IST</p>
          </div>

          <div className="bg-gray-50 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-1">
              <Clock size={18} className="text-gray-700" />
              <h3 className="font-semibold text-gray-900">Support Hours</h3>
            </div>
            <p className="text-sm text-gray-600">Monday – Saturday<br />10:00 AM – 7:00 PM IST</p>
            <p className="text-xs text-gray-400 mt-2">Typical response: within 4 hours</p>
          </div>

          <div className="bg-gray-50 rounded-2xl p-5 text-sm text-gray-600 space-y-1">
            <p className="font-medium text-gray-900 mb-2">Business Details</p>
            {/* TODO: replace with registered address, Drug License No., and Pharmacist-in-Charge details once available */}
            <p>Leomed Pharma</p>
            <p className="text-xs text-gray-400">[Registered address — TODO]</p>
            <p className="text-xs text-gray-400">[Drug License No. — TODO]</p>
            <p className="text-xs text-gray-400">[GSTIN — TODO]</p>
          </div>

          <div className="bg-gray-50 rounded-2xl p-5 text-sm text-gray-600 space-y-1">
            <p className="font-medium text-gray-900 mb-2">Quick Links</p>
            <Link href="/faq" className="block hover:text-black transition">→ FAQs</Link>
            <Link href="/refund-policy" className="block hover:text-black transition">→ Refund Policy</Link>
            <Link href="/shipping-policy" className="block hover:text-black transition">→ Shipping Policy</Link>
            <Link href="/account/orders" className="block hover:text-black transition">→ Track Your Order</Link>
          </div>
        </div>

        {/* Form */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 text-lg mb-5">Send us a message</h2>
            <ContactForm />
          </div>
        </div>
      </div>
    </div>
  )
}
