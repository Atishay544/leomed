'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { FAQS } from './faq-data'

export { FAQS }

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-4 text-left gap-4 group"
        aria-expanded={open}
      >
        <span className="font-medium text-gray-900 group-hover:text-black">{question}</span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <p className="pb-4 text-gray-600 text-sm leading-relaxed pr-6">{answer}</p>
      )}
    </div>
  )
}

export default function FaqClient() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-gray-900">Frequently Asked Questions</h1>
        <p className="text-gray-600 mt-3">Can't find what you're looking for? <Link href="/contact" className="text-black underline underline-offset-2">Contact us</Link> and we'll help.</p>
      </div>

      <div className="space-y-8">
        {FAQS.map(section => (
          <div key={section.category}>
            <h2 className="text-base font-semibold text-gray-500 uppercase tracking-wider mb-2">{section.category}</h2>
            <div className="bg-white rounded-2xl border border-gray-200 px-5">
              {section.items.map(item => (
                <FaqItem key={item.q} question={item.q} answer={item.a} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 bg-gray-50 rounded-2xl p-6 text-center">
        <p className="font-semibold text-gray-900 mb-1">Still have questions?</p>
        <p className="text-gray-600 text-sm mb-4">Our support team is available Mon–Sat, 10am–7pm IST.</p>
        <Link href="/contact"
          className="inline-block bg-black text-white px-6 py-2.5 rounded-xl font-medium hover:bg-gray-800 transition">
          Contact Support
        </Link>
      </div>
    </div>
  )
}
