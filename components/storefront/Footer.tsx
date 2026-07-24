import Link from 'next/link'

type Category = { id: string; name: string; slug: string }

const staticLinks = {
  Account: [
    { label: 'My Orders', href: '/account/orders' },
    { label: 'Wishlist', href: '/wishlist' },
    { label: 'My Profile', href: '/account' },
  ],
  Support: [
    { label: 'Contact Us', href: '/contact' },
    { label: 'FAQs', href: '/faq' },
    { label: 'Refund & Returns', href: '/refund-policy' },
    { label: 'Shipping Info', href: '/shipping-policy' },
  ],
  Legal: [
    { label: 'Privacy Policy', href: '/privacy-policy' },
    { label: 'Terms of Service', href: '/terms' },
  ],
}

const socials: { label: string; href: string; icon: string }[] = [
  // TODO: add Leomed Pharma social handles once available, e.g.:
  // { label: 'Instagram', href: 'https://www.instagram.com/leomedpharma/', icon: 'IG' },
]

export default function Footer({ categories = [] }: { categories?: Category[] }) {
  return (
    <footer className="bg-gray-900 text-gray-300 pt-12 pb-6 mt-16">
      <div className="max-w-350 mx-auto px-4 sm:px-6 lg:px-10 grid grid-cols-2 md:grid-cols-5 gap-8 mb-10">
        {/* Brand */}
        <div className="col-span-2 md:col-span-1">
          <Link href="/" className="inline-block mb-3">
            <span className="text-xl font-extrabold tracking-tight text-white">Leomed Pharma</span>
          </Link>
          <p className="text-sm leading-relaxed">Your trusted online pharmacy for OTC medicines & wellness essentials.</p>
          <div className="flex gap-3 mt-4">
            {socials.map(s => (
              <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
                className="w-8 h-8 rounded-full bg-gray-700 hover:bg-white hover:text-black transition flex items-center justify-center text-xs font-bold">
                {s.icon}
              </a>
            ))}
          </div>
        </div>

        {/* Shop — dynamic categories from DB */}
        <div>
          <h3 className="text-white font-semibold mb-3 text-sm">Shop</h3>
          <ul className="space-y-2">
            <li>
              <Link href="/products" className="text-sm hover:text-white transition">All Products</Link>
            </li>
            {categories.map(cat => (
              <li key={cat.id}>
                <Link href={`/category/${cat.slug}`} className="text-sm hover:text-white transition">
                  {cat.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Static link sections */}
        {Object.entries(staticLinks).map(([title, items]) => (
          <div key={title}>
            <h3 className="text-white font-semibold mb-3 text-sm">{title}</h3>
            <ul className="space-y-2">
              {items.map(item => (
                <li key={item.label}>
                  <Link href={item.href} className="text-sm hover:text-white transition">{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-800 pt-6 max-w-350 mx-auto px-4 sm:px-6 lg:px-10 flex flex-col sm:flex-row justify-between items-center gap-2 text-sm text-gray-500">
        <p>© {new Date().getFullYear()} Leomed Pharma. All rights reserved.</p>
        <div className="flex gap-4">
          <a href="mailto:leomedpharma1@gmail.com" className="hover:text-white">leomedpharma1@gmail.com</a>
          <a href="tel:+916398697503" className="hover:text-white">+91 63986 97503</a>
        </div>
      </div>
    </footer>
  )
}
